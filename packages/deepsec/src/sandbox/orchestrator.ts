import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir, readProjectConfig } from "@deepsec/core";
import { Sandbox } from "@vercel/sandbox";
import { downloadResults } from "./download.js";
import { partitionFiles } from "./partitioner.js";
import {
  createBootstrapSnapshot,
  DEEPSEC_DIR,
  spawnFromSnapshot,
  TARGET_DIR,
  type UploadBundle,
} from "./setup.js";
import { untrackSandbox } from "./shutdown.js";
import {
  deleteRunState,
  generateRunId,
  listRunStates,
  loadRunState,
  saveRunState,
} from "./state.js";
import type { SandboxConfig, SandboxInstance, SandboxResult, SandboxRunState } from "./types.js";
import { DATA_EXCLUDES, DEEPSEC_APP_EXCLUDES, makeTarball, TARGET_EXCLUDES } from "./upload.js";

/** Commands where we inject --root to point at the sandbox target checkout */
const NEEDS_ROOT = new Set(["process", "revalidate", "scan"]);

function buildCommandArgs(config: SandboxConfig, manifestPath: string | null): string[] {
  const args = ["packages/deepsec/src/cli.ts", config.command, "--project-id", config.projectId];

  if (NEEDS_ROOT.has(config.command)) {
    args.push("--root", TARGET_DIR);
  }
  if (manifestPath) {
    args.push("--manifest", manifestPath);
  }

  for (const arg of config.extraArgs) {
    args.push(...arg.split(/\s+/).filter(Boolean));
  }

  return args;
}

const PARTITIONABLE_COMMANDS = new Set(["process", "revalidate"]);

// --- Upload prep ---

function resolveDeepsecAppRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate deepsec workspace root from sandbox orchestrator");
}

async function prepareUploads(
  config: SandboxConfig,
  onLog: (msg: string) => void,
): Promise<UploadBundle> {
  const project = readProjectConfig(config.projectId);
  const localTargetRoot = project.rootPath;
  const localDataDir = dataDir(config.projectId);
  const localAppRoot = resolveDeepsecAppRoot();

  onLog(
    `Preparing upload bundles (app=${localAppRoot}, target=${localTargetRoot}, data=${localDataDir})...`,
  );

  const [app, target, data] = await Promise.all([
    makeTarball(localAppRoot, DEEPSEC_APP_EXCLUDES, onLog),
    makeTarball(localTargetRoot, TARGET_EXCLUDES, onLog),
    makeTarball(localDataDir, DATA_EXCLUDES, onLog),
  ]);

  return { app, target, data };
}

// --- Partition + bootstrap + spawn N workers ---

interface BootstrapAndSpawnResult {
  instances: SandboxInstance[];
  partitions: string[][];
  totalFiles: number;
  snapshotId: string | null;
}

async function bootstrapAndSpawn(
  config: SandboxConfig,
  onLog: (msg: string) => void,
): Promise<BootstrapAndSpawnResult> {
  const usePartitioning = PARTITIONABLE_COMMANDS.has(config.command);
  let partitions: string[][];
  let totalFiles: number;

  if (usePartitioning) {
    onLog("Partitioning files across sandboxes...");
    const result = partitionFiles(config.projectId, config.sandboxCount, {
      command: config.command,
      limit: config.limit,
      filter: config.filter,
      reinvestigate: config.reinvestigate,
      force: config.force,
      minSeverity: config.minSeverity,
      agentType: config.agentType,
    });
    partitions = result.partitions;
    totalFiles = result.totalFiles;

    if (totalFiles === 0) {
      onLog("No files to process.");
      return { instances: [], partitions: [], totalFiles: 0, snapshotId: null };
    }

    onLog(
      `${totalFiles} files partitioned across ${partitions.length} sandbox(es): ${partitions.map((p) => p.length).join(", ")} files each`,
    );
  } else {
    if (config.sandboxCount > 1) {
      onLog(`Warning: '${config.command}' doesn't support file partitioning. Using 1 sandbox.`);
    }
    partitions = [[]];
    totalFiles = 0;
    onLog(`Running '${config.command}' on 1 sandbox...`);
  }

  // Step 1: get a snapshot — either use one the user passed, or build a fresh one
  let snapshotId = config.snapshotId ?? null;
  if (!snapshotId) {
    const bundle = await prepareUploads(config, onLog);
    snapshotId = await createBootstrapSnapshot({
      projectId: config.projectId,
      command: config.command,
      agentType: config.agentType,
      vcpus: config.vcpus,
      timeout: config.timeout,
      bundle,
      onLog,
    });
  } else {
    onLog(`Using provided snapshot: ${snapshotId}`);
  }

  // Step 2: spawn N worker sandboxes from the snapshot in parallel
  onLog(`Spawning ${partitions.length} worker sandbox(es) from snapshot ${snapshotId}...`);

  const spawnPromises = partitions.map(async (partition, idx): Promise<SandboxInstance> => {
    try {
      const sandbox = await spawnFromSnapshot({
        snapshotId: snapshotId!,
        command: config.command,
        agentType: config.agentType,
        vcpus: config.vcpus,
        timeout: config.timeout,
        allowedHosts: config.allowedHosts,
        onLog: (msg) => onLog(`[sandbox-${idx}] ${msg}`),
      });
      onLog(`[sandbox-${idx}] Ready (${sandbox.sandboxId}, ${partition.length} files)`);
      return {
        sandbox,
        index: idx,
        sandboxId: sandbox.sandboxId,
        status: "setup",
        manifest: partition,
      };
    } catch (err: any) {
      const parts: string[] = [];
      if (err?.message) parts.push(err.message);
      if (err?.status) parts.push(`status: ${err.status}`);
      if (err?.body) parts.push(`body: ${JSON.stringify(err.body).slice(0, 300)}`);
      if (err?.response?.status) parts.push(`response.status: ${err.response.status}`);
      if (err?.cause) parts.push(`cause: ${err.cause}`);
      const errMsg = parts.join(" | ") || String(err);
      onLog(`[sandbox-${idx}] Spawn failed: ${errMsg}`);
      return {
        sandbox: null as unknown as Sandbox,
        index: idx,
        sandboxId: "",
        status: "error" as const,
        manifest: partition,
        error: errMsg,
      } satisfies SandboxInstance;
    }
  });

  const instances = await Promise.all(spawnPromises);
  return { instances, partitions, totalFiles, snapshotId };
}

// --- Dispatch: kick off command on a sandbox, return cmdId ---

async function dispatchOnSandbox(
  instance: SandboxInstance,
  config: SandboxConfig,
  onLog: (msg: string) => void,
): Promise<string | null> {
  if (instance.status === "error") return null;

  const { sandbox, index, manifest } = instance;

  let manifestPath: string | null = null;
  if (PARTITIONABLE_COMMANDS.has(config.command) && manifest.length > 0) {
    manifestPath = "/tmp/manifest.json";
    await sandbox.writeFiles([
      { path: manifestPath, content: Buffer.from(JSON.stringify(manifest)) },
    ]);
  }

  const args = buildCommandArgs(config, manifestPath);
  onLog(
    `[sandbox-${index}] Dispatching: deepsec ${config.command} (${manifest.length || "all"} files)...`,
  );

  const cmd = await sandbox.runCommand({
    cmd: "npx",
    args: ["tsx", ...args],
    cwd: DEEPSEC_DIR,
    detached: true,
  });

  return cmd.cmdId;
}

// --- Launch (detached) ---

export async function launch(config: SandboxConfig, onLog: (msg: string) => void): Promise<string> {
  const { instances, partitions: _p, totalFiles: _t } = await bootstrapAndSpawn(config, onLog);

  if (instances.length === 0) {
    throw new Error("No sandboxes to launch (no files to process?)");
  }

  const runId = generateRunId();
  onLog(`Run ${runId}: dispatching commands...`);

  const sandboxEntries: SandboxRunState["sandboxes"] = [];

  for (const inst of instances) {
    const cmdId = await dispatchOnSandbox(inst, config, onLog);
    if (cmdId) {
      sandboxEntries.push({
        sandboxId: inst.sandboxId,
        cmdId,
        index: inst.index,
        manifest: inst.manifest,
      });
    }
  }

  const state: SandboxRunState = {
    runId,
    projectId: config.projectId,
    command: config.command,
    vcpus: config.vcpus,
    launchedAt: new Date().toISOString(),
    sandboxes: sandboxEntries,
  };

  saveRunState(state);
  onLog(`Run ${runId} launched with ${sandboxEntries.length} sandbox(es). You can disconnect now.`);
  onLog(
    `  Collect results later: pnpm deepsec sandbox collect --project-id ${config.projectId} --run-id ${runId}`,
  );
  onLog(
    `  Check status:          pnpm deepsec sandbox status --project-id ${config.projectId} --run-id ${runId}`,
  );

  return runId;
}

// --- Status: check on a detached run ---

export async function checkStatus(
  projectId: string,
  runId?: string,
  onLog: (msg: string) => void = console.log,
): Promise<void> {
  if (!runId) {
    const runs = listRunStates(projectId);
    if (runs.length === 0) {
      onLog("No detached sandbox runs found.");
      return;
    }
    onLog(`Detached sandbox runs for ${projectId}:`);
    for (const run of runs) {
      onLog(
        `  ${run.runId}  ${run.command}  ${run.sandboxes.length} sandbox(es)  launched ${run.launchedAt}`,
      );
    }
    return;
  }

  const state = loadRunState(projectId, runId);
  onLog(`Run ${runId}: ${state.command} (launched ${state.launchedAt})`);

  for (const entry of state.sandboxes) {
    try {
      const sandbox = await Sandbox.get({ sandboxId: entry.sandboxId });
      const cmd = await sandbox.getCommand(entry.cmdId);

      if (cmd.exitCode === null) {
        onLog(
          `  sandbox-${entry.index} (${entry.sandboxId}): RUNNING (${entry.manifest.length} files)`,
        );
      } else if (cmd.exitCode === 0) {
        onLog(
          `  sandbox-${entry.index} (${entry.sandboxId}): COMPLETE (exit 0, ${entry.manifest.length} files)`,
        );
      } else {
        onLog(`  sandbox-${entry.index} (${entry.sandboxId}): FAILED (exit ${cmd.exitCode})`);
      }
    } catch (err) {
      onLog(
        `  sandbox-${entry.index} (${entry.sandboxId}): UNREACHABLE (${err instanceof Error ? err.message : err})`,
      );
    }
  }
}

// --- Collect: reconnect to completed sandboxes, pull results, stop ---

export async function collect(
  projectId: string,
  runId: string,
  onLog: (msg: string) => void,
): Promise<SandboxResult[]> {
  const state = loadRunState(projectId, runId);
  onLog(`Collecting run ${runId}: ${state.command} (${state.sandboxes.length} sandboxes)`);

  const resultPromises = state.sandboxes.map(async (entry): Promise<SandboxResult> => {
    try {
      const sandbox = await Sandbox.get({ sandboxId: entry.sandboxId });
      const cmd = await sandbox.getCommand(entry.cmdId);

      if (cmd.exitCode === null) {
        onLog(`[sandbox-${entry.index}] Still running, waiting...`);
        try {
          for await (const log of cmd.logs()) {
            const lines = log.data.trim();
            if (lines) {
              for (const line of lines.split("\n")) {
                onLog(`[sandbox-${entry.index}] ${line}`);
              }
            }
          }
        } catch {}
        const finished = await cmd.wait();
        if (finished.exitCode !== 0) {
          const stderr = await finished.stderr();
          onLog(`[sandbox-${entry.index}] Failed (exit ${finished.exitCode})`);
          try {
            await sandbox.stop();
          } catch {}
          return {
            sandboxIndex: entry.index,
            sandboxId: entry.sandboxId,
            success: false,
            filesProcessed: 0,
            error: `Exit ${finished.exitCode}: ${stderr.slice(0, 500)}`,
          };
        }
      } else if (cmd.exitCode !== 0) {
        const stderr = await cmd.stderr();
        onLog(`[sandbox-${entry.index}] Was failed (exit ${cmd.exitCode})`);
        try {
          await sandbox.stop();
        } catch {}
        return {
          sandboxIndex: entry.index,
          sandboxId: entry.sandboxId,
          success: false,
          filesProcessed: 0,
          error: `Exit ${cmd.exitCode}: ${stderr.slice(0, 500)}`,
        };
      }

      onLog(`[sandbox-${entry.index}] Complete, downloading results...`);
      try {
        await downloadResults(sandbox, entry.index, projectId, onLog);
      } catch (err) {
        onLog(
          `[sandbox-${entry.index}] Download failed: ${err instanceof Error ? err.message : err}`,
        );
      }

      try {
        await sandbox.stop();
      } catch {}
      untrackSandbox(sandbox);
      onLog(`[sandbox-${entry.index}] Stopped.`);

      return {
        sandboxIndex: entry.index,
        sandboxId: entry.sandboxId,
        success: true,
        filesProcessed: entry.manifest.length,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      onLog(`[sandbox-${entry.index}] Unreachable: ${errMsg}`);
      return {
        sandboxIndex: entry.index,
        sandboxId: entry.sandboxId,
        success: false,
        filesProcessed: 0,
        error: errMsg,
      };
    }
  });

  const results = await Promise.all(resultPromises);

  deleteRunState(projectId, runId);
  onLog(`Run ${runId} collected and cleaned up.`);

  return results;
}

// --- Orchestrate (attached): bootstrap → spawn → run → download → stop ---

export async function orchestrate(
  config: SandboxConfig,
  onLog: (msg: string) => void,
): Promise<SandboxResult[]> {
  const { instances } = await bootstrapAndSpawn(config, onLog);

  if (instances.length === 0) return [];

  onLog(`Dispatching '${config.command}' commands...`);

  const runPromises = instances.map(async (inst) => {
    // Start a background poller that streams deltas from the sandbox while
    // the worker runs. A nudge lets runOnSandboxAttached kick the poller as
    // soon as it sees "Batch N/M complete:" in the log.
    const stopPoller = { flag: false };
    const nudge = makeNudge();
    const pollerPromise =
      inst.status === "error"
        ? Promise.resolve()
        : streamDownloadLoop(inst, config.projectId, onLog, stopPoller, nudge);

    const result = await runOnSandboxAttached(inst, config, onLog, nudge);
    const tRun = Date.now();

    // Stop the poller and wait for it to wind down (it may be mid-download).
    // Signal the nudge so any in-flight `nudge.wait(15_000)` wakes immediately
    // instead of sleeping the full interval before checking stop.flag.
    stopPoller.flag = true;
    nudge.signal();
    await pollerPromise;
    const tPoller = Date.now();
    if (tPoller - tRun > 500) {
      onLog(`[sandbox-${inst.index}] [debug] pollerPromise wind-down took ${tPoller - tRun}ms`);
    }

    // One final sync to catch whatever the poller may have missed between
    // its last iteration and the worker exiting.
    if (inst.status !== "error") {
      try {
        await downloadResults(inst.sandbox, inst.index, config.projectId, onLog);
      } catch (err) {
        onLog(
          `[sandbox-${inst.index}] Final download failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const tDownload = Date.now();
    if (tDownload - tPoller > 500) {
      onLog(`[sandbox-${inst.index}] [debug] final downloadResults took ${tDownload - tPoller}ms`);
    }

    // Stop the sandbox immediately — no reason to keep it around.
    if (!config.keepAlive && inst.sandboxId) {
      try {
        await inst.sandbox.stop();
        onLog(`[sandbox-${inst.index}] Stopped.`);
      } catch {}
      untrackSandbox(inst.sandbox);
    }
    const tStop = Date.now();
    if (tStop - tDownload > 500) {
      onLog(`[sandbox-${inst.index}] [debug] sandbox.stop() took ${tStop - tDownload}ms`);
    }

    return result;
  });

  const runResults = await Promise.all(runPromises);

  if (config.keepAlive) {
    onLog("Sandboxes kept alive:");
    for (const inst of instances) {
      if (inst.sandboxId) {
        onLog(`  sandbox-${inst.index}: ${inst.sandboxId}`);
      }
    }
  }

  return runResults;
}

/**
 * Simple signal channel: the log-stream parser calls `signal()` when it
 * sees a "Batch N/M complete:" line; the streaming loop waits on `wait()`
 * (or its interval timer, whichever fires first).
 */
interface SyncNudge {
  signal: () => void;
  wait: (timeoutMs: number) => Promise<void>;
}

function makeNudge(): SyncNudge {
  let resolver: (() => void) | null = null;
  return {
    signal() {
      if (resolver) {
        const r = resolver;
        resolver = null;
        r();
      }
    },
    wait(timeoutMs: number) {
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          resolver = null;
          resolve();
        }, timeoutMs);
        resolver = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    },
  };
}

/**
 * Periodically sync files changed since the last sync. Triggered by either
 * a batch-complete nudge from the log parser or a 15s timer (safety net).
 * Runs until `stop.flag` becomes true.
 */
async function streamDownloadLoop(
  inst: SandboxInstance,
  projectId: string,
  onLog: (msg: string) => void,
  stop: { flag: boolean },
  nudge: SyncNudge,
  intervalMs = 15_000,
): Promise<void> {
  // Small initial delay so the worker has time to make progress.
  await nudge.wait(intervalMs);
  while (!stop.flag) {
    const tStart = Date.now();
    try {
      const count = await downloadResults(inst.sandbox, inst.index, projectId, onLog, {
        advanceMarker: true,
        quiet: true,
      });
      const dt = Date.now() - tStart;
      if (count > 0) onLog(`[sandbox-${inst.index}] streamed ${count} file(s) in ${dt}ms`);
      else if (dt > 1500)
        onLog(`[sandbox-${inst.index}] [debug] silent poller sync took ${dt}ms (0 files)`);
    } catch (err) {
      onLog(
        `[sandbox-${inst.index}] periodic sync: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (stop.flag) break;
    await nudge.wait(intervalMs);
  }
}

const BATCH_COMPLETE_RE = /Batch \d+\/\d+ complete:/;

async function runOnSandboxAttached(
  instance: SandboxInstance,
  config: SandboxConfig,
  onLog: (msg: string) => void,
  nudge?: SyncNudge,
): Promise<SandboxResult> {
  if (instance.status === "error") {
    return {
      sandboxIndex: instance.index,
      sandboxId: instance.sandboxId,
      success: false,
      filesProcessed: 0,
      error: instance.error,
    };
  }

  const { sandbox, index, manifest } = instance;
  instance.status = "running";

  try {
    let manifestPath: string | null = null;
    if (PARTITIONABLE_COMMANDS.has(config.command) && manifest.length > 0) {
      manifestPath = "/tmp/manifest.json";
      await sandbox.writeFiles([
        { path: manifestPath, content: Buffer.from(JSON.stringify(manifest)) },
      ]);
    }

    const args = buildCommandArgs(config, manifestPath);
    onLog(
      `[sandbox-${index}] Running: deepsec ${config.command} (${manifest.length || "all"} files)...`,
    );

    const cmd = await sandbox.runCommand({
      cmd: "npx",
      args: ["tsx", ...args],
      cwd: DEEPSEC_DIR,
      detached: true,
    });

    try {
      for await (const log of cmd.logs()) {
        const lines = log.data.trim();
        if (lines) {
          for (const line of lines.split("\n")) {
            onLog(`[sandbox-${index}] ${line}`);
            if (nudge && BATCH_COMPLETE_RE.test(line)) {
              // Kick the streaming download loop to sync now — a batch
              // just finished and wrote file records to disk.
              nudge.signal();
            }
          }
        }
      }
    } catch {}
    const tLogsClosed = Date.now();

    const result = await cmd.wait();
    const tWaitReturned = Date.now();
    const waitGap = tWaitReturned - tLogsClosed;
    if (waitGap > 500) {
      onLog(`[sandbox-${index}] [debug] cmd.wait() lagged ${waitGap}ms after cmd.logs() closed`);
    }

    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      instance.status = "error";
      instance.error = `Exit code ${result.exitCode}: ${stderr.slice(0, 500)}`;
      onLog(`[sandbox-${index}] ${config.command} failed (exit ${result.exitCode})`);
      return {
        sandboxIndex: index,
        sandboxId: sandbox.sandboxId,
        success: false,
        filesProcessed: 0,
        error: instance.error,
      };
    }

    instance.status = "done";
    onLog(`[sandbox-${index}] ${config.command} complete.`);
    return {
      sandboxIndex: index,
      sandboxId: sandbox.sandboxId,
      success: true,
      filesProcessed: manifest.length,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    instance.status = "error";
    instance.error = errMsg;
    onLog(`[sandbox-${index}] Error: ${errMsg}`);
    return {
      sandboxIndex: index,
      sandboxId: sandbox.sandboxId,
      success: false,
      filesProcessed: 0,
      error: errMsg,
    };
  }
}
