import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@deepsec/core";
import type { Sandbox } from "@vercel/sandbox";
import { DATA_DIR } from "./setup.js";

const SETUP_MARKER = "/tmp/deepsec-setup-done";

/**
 * Touch a marker file at the end of setup. The results download uses
 * `find -newer <marker>` to grab only files modified during the run.
 */
export async function markSetupComplete(sandbox: Sandbox): Promise<void> {
  const res = await sandbox.runCommand({
    cmd: "touch",
    args: [SETUP_MARKER],
  });
  if (res.exitCode !== 0) {
    throw new Error(`touch ${SETUP_MARKER} failed (exit ${res.exitCode})`);
  }
}

/**
 * Tar up files under `data/<projectId>/` modified since setup, download the
 * tar, and extract it into the local data directory.
 * Returns the number of files extracted.
 *
 * When `advanceMarker` is true, the setup marker is bumped to "now" after
 * a successful download so subsequent polls only pick up newer changes.
 * Use it for streaming downloads mid-run; pass false for the final download
 * so we don't lose anything that lands during the download itself.
 */
export async function downloadResults(
  sandbox: Sandbox,
  sandboxIndex: number,
  projectId: string,
  onLog: (msg: string) => void,
  opts: { advanceMarker?: boolean; quiet?: boolean } = {},
): Promise<number> {
  const remoteProjectDir = `${DATA_DIR}/${projectId}`;
  const remoteTarPath = `/tmp/deepsec-results-${sandboxIndex}.tar.gz`;
  const log = (msg: string) => {
    if (!opts.quiet) onLog(msg);
  };

  log(`[sandbox-${sandboxIndex}] Packaging modified files...`);

  // Build the tar of files newer than the setup marker.
  // Cannot use $(find -print0) — bash command substitution strips NUL bytes.
  // Instead detect emptiness separately, then pipe find directly to tar.
  const tarCmd = [
    "sh",
    "-c",
    `cd ${remoteProjectDir} && ` +
      `first=$(find . -newer ${SETUP_MARKER} -type f -print -quit); ` +
      `if [ -z "$first" ]; then echo "__NO_CHANGES__"; exit 0; fi; ` +
      `find . -newer ${SETUP_MARKER} -type f -print0 | tar -czf ${remoteTarPath} --null -T -`,
  ];

  const tarResult = await sandbox.runCommand({
    cmd: tarCmd[0],
    args: tarCmd.slice(1),
  });
  if (tarResult.exitCode !== 0) {
    const err = await tarResult.stderr();
    throw new Error(
      `[sandbox-${sandboxIndex}] tar failed (exit ${tarResult.exitCode}): ${err.slice(0, 500)}`,
    );
  }

  const tarStdout = await tarResult.stdout();
  if (tarStdout.includes("__NO_CHANGES__")) {
    log(`[sandbox-${sandboxIndex}] No changes to download.`);
    if (opts.advanceMarker) {
      await sandbox.runCommand({ cmd: "touch", args: [SETUP_MARKER] });
    }
    return 0;
  }

  // Download the tarball
  const localTarPath = `/tmp/deepsec-results-${sandboxIndex}-${Date.now()}.tar.gz`;
  log(`[sandbox-${sandboxIndex}] Downloading results...`);
  const started = Date.now();
  const written = await sandbox.downloadFile(
    { path: remoteTarPath },
    { path: localTarPath },
    { mkdirRecursive: true },
  );
  if (!written) {
    throw new Error(`[sandbox-${sandboxIndex}] downloadFile returned null (source missing?)`);
  }
  const size = fs.statSync(localTarPath).size;
  const mb = (size / 1024 / 1024).toFixed(1);
  log(
    `[sandbox-${sandboxIndex}] Downloaded ${mb}MB in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  // Extract locally into data/<projectId>/
  const localProjectDir = dataDir(projectId);
  fs.mkdirSync(localProjectDir, { recursive: true });

  const count = await extractTarballLocally(localTarPath, localProjectDir);
  try {
    fs.unlinkSync(localTarPath);
  } catch {}
  log(
    `[sandbox-${sandboxIndex}] Extracted ${count} files into ${path.relative(process.cwd(), localProjectDir)}`,
  );

  // Bump the marker after a successful sync so subsequent polls are deltas.
  if (opts.advanceMarker) {
    await sandbox.runCommand({ cmd: "touch", args: [SETUP_MARKER] });
  }
  return count;
}

async function extractTarballLocally(tarPath: string, destDir: string): Promise<number> {
  // Use `tar -xzvf` and count emitted lines for "files extracted" feedback.
  return await new Promise<number>((resolve, reject) => {
    const child = spawn("tar", ["-xzvf", tarPath, "-C", destDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let extracted = 0;
    let stderr = "";
    let stdoutBuf = "";
    child.stdout.on("data", (c: Buffer) => {
      stdoutBuf += c.toString();
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (line && !line.endsWith("/")) extracted++;
      }
    });
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`tar -xzf exited ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(extracted);
      }
    });
  });
}
