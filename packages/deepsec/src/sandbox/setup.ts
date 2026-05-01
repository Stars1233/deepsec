import { type NetworkPolicy, Sandbox } from "@vercel/sandbox";
import { markSetupComplete } from "./download.js";
import { trackSandbox, untrackSandbox } from "./shutdown.js";
import {
  extractTarballOnSandbox,
  type TarballStats,
  uploadTarballToSandbox,
} from "./upload.js";

const DEEPSEC_DIR = "/vercel/sandbox/deepsec-app";
const DATA_DIR = "/vercel/sandbox/deepsec-app/data";
const TARGET_DIR = "/vercel/sandbox/target";

export { DATA_DIR, DEEPSEC_DIR, TARGET_DIR };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_EXPIRATION_MS = 1 * ONE_DAY_MS;

// --- Tarball bundle passed from the orchestrator ---

export interface UploadBundle {
  /** tar.gz of the local deepsec app (source only, no node_modules/.git/data) */
  app: TarballStats;
  /** tar.gz of the local target working copy (no .git) */
  target: TarballStats;
  /** tar.gz of the local data/<projectId>/ directory */
  data: TarballStats;
}

// --- Sandbox env vars ---

const BASE_SANDBOX_ENV_KEYS: string[] = [
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "DEEPSEC_AGENT_DEBUG",
];

const COMMAND_ENV_KEYS: Record<string, string[]> = {
  enrich: ["PEOPLE_SH_BYPASS", "OWNERSHIP_AUTH_TOKEN"],
};

const PROXY_PORT = 8787;
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;
const PROXY_SCRIPT = `${DEEPSEC_DIR}/packages/deepsec/src/sandbox/request-proxy.mjs`;
const CODEX_HOME = "/vercel/sandbox/.codex";

function buildSandboxEnv(
  command?: string,
  agentType?: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  const keys = new Set([
    ...BASE_SANDBOX_ENV_KEYS,
    ...(command ? (COMMAND_ENV_KEYS[command] ?? []) : []),
  ]);
  for (const key of keys) {
    if (key in process.env) env[key] = process.env[key]!;
  }

  // Belt-and-suspenders alongside the worker egress firewall: the master
  // kill-switch covers DISABLE_TELEMETRY / DISABLE_ERROR_REPORTING /
  // DISABLE_AUTOUPDATER / DISABLE_FEEDBACK_COMMAND. The Codex CLI doesn't
  // honour env vars for its analytics — its config.toml is written into
  // CODEX_HOME by createBootstrapSnapshot and baked into the snapshot.
  env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1";

  // Claude SDK traffic goes through a local proxy that strips
  // `eager_input_streaming` from tool schemas (Bedrock rejects it).
  //
  // Codex traffic goes straight to the gateway — there's no Bedrock-style
  // body mutation needed for Codex, so a proxy hop would just add latency
  // and a base-url-rewriting hazard (path doubling, etc.). spawnFromSnapshot
  // skips the proxy startup when agentType=codex for the same reason.
  if (agentType === "codex") {
    env["CODEX_HOME"] = CODEX_HOME;
    if (!env["OPENAI_BASE_URL"] && env["ANTHROPIC_BASE_URL"]) {
      env["OPENAI_BASE_URL"] = env["ANTHROPIC_BASE_URL"];
    }
    if (!env["OPENAI_API_KEY"] && env["ANTHROPIC_AUTH_TOKEN"]) {
      env["OPENAI_API_KEY"] = env["ANTHROPIC_AUTH_TOKEN"];
    }
  } else {
    const realBaseUrl = env["ANTHROPIC_BASE_URL"];
    if (realBaseUrl) {
      env["ANTHROPIC_UPSTREAM_BASE_URL"] = realBaseUrl;
      env["ANTHROPIC_BASE_URL"] = PROXY_URL;
    }
  }
  return env;
}

// --- Worker egress firewall ---
//
// Workers should only reach the AI host the SDK/proxy actually forwards to.
// We derive that from the upstream base URL already present in the env, and
// fall back to the documented hosts when env parsing fails so we never end
// up applying an effective deny-all by accident.

const DEFAULT_AI_HOSTS = [
  "ai-gateway.vercel.sh",
  "api.anthropic.com",
  "api.openai.com",
];

function hostFromUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
}

export function buildWorkerNetworkPolicy(
  env: Record<string, string>,
  agentType: string | undefined,
  extraAllow: string[] = [],
): NetworkPolicy {
  const allow = new Set<string>(extraAllow);

  if (agentType === "codex") {
    const h = hostFromUrl(env["OPENAI_BASE_URL"]);
    if (h) allow.add(h);
  } else {
    const h = hostFromUrl(env["ANTHROPIC_UPSTREAM_BASE_URL"]);
    if (h) allow.add(h);
  }

  if (allow.size === 0) {
    for (const h of DEFAULT_AI_HOSTS) allow.add(h);
  }

  return { allow: [...allow] };
}

// --- Bootstrap: one sandbox does full setup, snapshots, stops ---

interface BootstrapOptions {
  projectId: string;
  command?: string;
  /** Which agent backend the workers will run — drives which native binary we install */
  agentType?: string;
  vcpus: number;
  timeout: number;
  bundle: UploadBundle;
  onLog: (msg: string) => void;
}

/**
 * Stand up a fresh sandbox, upload everything, install deps, ensure native
 * binaries, then snapshot and stop. Returns the snapshot id — workers use it
 * as their seed. The sandbox is always stopped before return (success or fail)
 * to avoid leaking compute.
 */
export async function createBootstrapSnapshot(
  opts: BootstrapOptions,
): Promise<string> {
  const command = opts.command ?? "process";
  const agentType = opts.agentType ?? "claude-agent-sdk";
  const sandboxEnv = buildSandboxEnv(command, agentType);

  opts.onLog("Creating bootstrap sandbox...");
  let sandbox: Sandbox;
  try {
    sandbox = await Sandbox.create({
      runtime: "node24",
      env: sandboxEnv,
      resources: { vcpus: opts.vcpus },
      timeout: opts.timeout,
    });
  } catch (err: any) {
    throw new Error(`Sandbox.create failed: ${err?.message ?? String(err)}`);
  }

  opts.onLog(`Bootstrap sandbox ${sandbox.sandboxId} created.`);
  trackSandbox(sandbox);

  try {
    // Install pnpm globally
    await runAndLog(
      sandbox,
      "npm",
      ["install", "-g", "pnpm@8"],
      "/vercel/sandbox",
      opts.onLog,
      {
        sudo: true,
      },
    );
    opts.onLog("  pnpm installed.");

    // Install ripgrep + python3 — Codex agents prefer rg/python over grep/awk
    // for whole-tree searches, and several investigation patterns lean on
    // python3 for parsing AST / JSON. Best-effort: warn but don't fail the
    // whole bootstrap if the package manager rejects either one.
    await installAgentTools(sandbox, opts.onLog);

    // Upload app + target + data in parallel
    const appTar = "/tmp/deepsec-app.tar.gz";
    const targetTar = "/tmp/deepsec-target.tar.gz";
    const dataTar = "/tmp/deepsec-data.tar.gz";
    const projectDataDir = `${DATA_DIR}/${opts.projectId}`;

    await Promise.all([
      (async () => {
        await uploadTarballToSandbox(
          sandbox,
          appTar,
          opts.bundle.app.buffer,
          opts.onLog,
        );
        await extractTarballOnSandbox(sandbox, appTar, DEEPSEC_DIR, opts.onLog);
      })(),
      (async () => {
        await uploadTarballToSandbox(
          sandbox,
          targetTar,
          opts.bundle.target.buffer,
          opts.onLog,
        );
        await extractTarballOnSandbox(
          sandbox,
          targetTar,
          TARGET_DIR,
          opts.onLog,
        );
      })(),
      (async () => {
        await uploadTarballToSandbox(
          sandbox,
          dataTar,
          opts.bundle.data.buffer,
          opts.onLog,
        );
        await extractTarballOnSandbox(
          sandbox,
          dataTar,
          projectDataDir,
          opts.onLog,
        );
      })(),
    ]);

    // Install dependencies
    opts.onLog("Running pnpm install...");
    await runAndLog(
      sandbox,
      "pnpm",
      ["install", "--frozen-lockfile"],
      DEEPSEC_DIR,
      opts.onLog,
    );

    // Ensure agent native binaries. Both backends ship vendored native binaries
    // through optional deps; pnpm's optional-dep filter on the host platform
    // doesn't always land the right binary on the sandbox. We install the
    // matching binary explicitly per agent.
    if (agentType === "codex") {
      opts.onLog("Ensuring Codex CLI native binary is installed...");
      await ensureCodexNativeBinary(sandbox, opts.onLog);
      await writeCodexConfig(sandbox, opts.onLog);
    } else {
      opts.onLog("Ensuring Claude SDK native binaries are installed...");
      await ensureClaudeNativeBinaries(sandbox, opts.onLog);
    }

    // Snapshot the prepared state
    opts.onLog("Snapshotting bootstrap sandbox...");
    const snap = await sandbox.snapshot({ expiration: SNAPSHOT_EXPIRATION_MS });
    opts.onLog(`Bootstrap snapshot: ${snap.snapshotId}`);

    return snap.snapshotId;
  } finally {
    try {
      await sandbox.stop();
    } catch {}
    untrackSandbox(sandbox);
    opts.onLog(`Bootstrap sandbox ${sandbox.sandboxId} stopped.`);
  }
}

// --- Worker: spawn from snapshot, no upload ---

interface SpawnOptions {
  snapshotId: string;
  command?: string;
  /** Drives which API base URL gets rewritten to the local proxy */
  agentType?: string;
  vcpus: number;
  timeout: number;
  /** Extra hostnames to allow through the worker's egress firewall, on top of the AI host derived from base URLs */
  allowedHosts?: string[];
  onLog: (msg: string) => void;
}

/**
 * Create a worker sandbox from the bootstrap snapshot. Re-touches the
 * setup-done marker so the post-run delta detection (`find -newer`) captures
 * only files modified during the worker's run. Also starts the local
 * request-proxy that mediates outbound API traffic for the active agent.
 */
export async function spawnFromSnapshot(opts: SpawnOptions): Promise<Sandbox> {
  const sandboxEnv = buildSandboxEnv(opts.command, opts.agentType);
  const networkPolicy = buildWorkerNetworkPolicy(
    sandboxEnv,
    opts.agentType,
    opts.allowedHosts,
  );

  let sandbox: Sandbox;
  try {
    sandbox = await Sandbox.create({
      source: { type: "snapshot", snapshotId: opts.snapshotId },
      env: sandboxEnv,
      resources: { vcpus: opts.vcpus },
      timeout: opts.timeout,
      networkPolicy,
    });
  } catch (err: any) {
    const details = [err?.message];
    if (err?.response?.status) details.push(`status: ${err.response.status}`);
    if (err?.body)
      details.push(`body: ${JSON.stringify(err.body).slice(0, 300)}`);
    throw new Error(
      `Sandbox.create from snapshot failed: ${details.filter(Boolean).join(" | ")}`,
    );
  }

  trackSandbox(sandbox);

  // Reset the setup marker so worker-local file modifications are detected
  // via `find -newer`. The marker time baked into the snapshot would work in
  // theory, but resetting is cheap and more robust against clock skew.
  await markSetupComplete(sandbox);

  // The local request-proxy exists to strip `eager_input_streaming` from
  // Anthropic-bound tool schemas (Bedrock rejects it). Codex talks directly
  // to the gateway without any body mutation, so we skip the proxy entirely
  // when agent=codex — saves a hop and avoids base-url rewriting bugs.
  if (opts.agentType !== "codex") {
    await startRequestProxy(sandbox, opts.onLog);
  }

  return sandbox;
}

async function startRequestProxy(
  sandbox: Sandbox,
  onLog: (msg: string) => void,
): Promise<void> {
  // Background-launch the proxy. Using nohup + setsid + redirecting stdio so
  // the process survives the runCommand's lifecycle.
  await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `nohup node ${PROXY_SCRIPT} > /tmp/request-proxy.log 2>&1 &`],
  });

  // Wait until the port accepts connections (up to ~5s). If it never comes
  // up, the Claude SDK will fail with ECONNREFUSED and our retry will fire.
  const script = `
for i in $(seq 1 50); do
  if (echo > /dev/tcp/127.0.0.1/${PROXY_PORT}) 2>/dev/null; then
    echo "proxy ready after \${i} attempts"
    exit 0
  fi
  sleep 0.1
done
echo "proxy did not come up in 5s"
cat /tmp/request-proxy.log 2>/dev/null | tail -20
exit 1
`;
  const check = await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", script],
  });
  const out = (await check.stdout()) + (await check.stderr());
  for (const line of out.split("\n")) {
    if (line.trim()) onLog(`  ${line}`);
  }
  if (check.exitCode !== 0) {
    throw new Error(`request-proxy failed to start (exit ${check.exitCode})`);
  }
}

// --- Native binary remediation (shared helper) ---

async function ensureClaudeNativeBinaries(
  sandbox: Sandbox,
  onLog: (msg: string) => void,
): Promise<void> {
  const script = `
set -e
cd ${DEEPSEC_DIR}
SDK_VER=""
for CANDIDATE in \\
  ./node_modules/@anthropic-ai/claude-agent-sdk \\
  ./packages/processor/node_modules/@anthropic-ai/claude-agent-sdk \\
  ./node_modules/.pnpm/@anthropic-ai+claude-agent-sdk@*/node_modules/@anthropic-ai/claude-agent-sdk; do
  for DIR in $CANDIDATE; do
    if [ -f "$DIR/package.json" ]; then
      SDK_VER=$(node -p "require('$DIR/package.json').version" 2>/dev/null)
      break 2
    fi
  done
done
if [ -z "$SDK_VER" ]; then
  echo "Could not detect Claude SDK version"
  exit 1
fi
echo "Detected Claude SDK version: $SDK_VER"

# SDK picks -musl path first; if sandbox is glibc but musl binary lives there,
# exec fails with ENOENT (loader missing). Detect libc and install the
# matching libc's binary into BOTH the musl and non-musl SDK paths.
LIBC=gnu
if ldd /bin/ls 2>&1 | grep -qi musl; then LIBC=musl; fi
echo "  Sandbox libc: $LIBC"

SRC_SUFFIX=""
[ "$LIBC" = "musl" ] && SRC_SUFFIX="-musl"

for ARCH in x64 arm64; do
  SRC_VARIANT="linux-\${ARCH}\${SRC_SUFFIX}"
  SRC_PKG="@anthropic-ai/claude-agent-sdk-\${SRC_VARIANT}"
  echo "  Fetching \${SRC_PKG}@\${SDK_VER}..."
  rm -rf /tmp/claude-native-fetch && mkdir -p /tmp/claude-native-fetch
  cd /tmp/claude-native-fetch
  npm pack "\${SRC_PKG}@\${SDK_VER}" --silent 2>&1 | tail -1
  tar -xzf ./*.tgz
  if [ ! -f package/claude ]; then
    echo "  ERROR: \${SRC_PKG}@\${SDK_VER} does not contain claude binary"
    exit 1
  fi
  SIZE=$(stat -c%s package/claude 2>/dev/null || stat -f%z package/claude 2>/dev/null || echo "?")
  for DEST_VARIANT in "linux-\${ARCH}-musl" "linux-\${ARCH}"; do
    PNPM_KEY="@anthropic-ai+claude-agent-sdk-\${DEST_VARIANT}@\${SDK_VER}"
    DEST_PKG="@anthropic-ai/claude-agent-sdk-\${DEST_VARIANT}"
    TARGET_DIR="${DEEPSEC_DIR}/node_modules/.pnpm/\${PNPM_KEY}/node_modules/\${DEST_PKG}"
    mkdir -p "\${TARGET_DIR}"
    cp package/claude "\${TARGET_DIR}/claude"
    chmod +x "\${TARGET_DIR}/claude"
    echo "    → \${DEST_VARIANT}/claude (\${SIZE} bytes, from \${SRC_VARIANT})"
  done
done
rm -rf /tmp/claude-native-fetch
`;

  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", script],
  });
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  for (const line of (stdout + stderr).split("\n")) {
    if (line.trim()) onLog(`  ${line}`);
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `Claude native binary install failed (exit ${result.exitCode})`,
    );
  }
}

/**
 * Install ripgrep + python3 in the bootstrap sandbox so the Codex agent has
 * efficient whole-tree search and a scripting language for ad-hoc analysis.
 * Detects the available package manager (dnf / microdnf / yum / apt-get).
 *
 * Best-effort: if neither tool can be installed, we log and move on. The
 * agent can fall back to grep / awk / shell.
 */
async function installAgentTools(
  sandbox: Sandbox,
  onLog: (msg: string) => void,
): Promise<void> {
  const script = `
set -u
log() { echo "  $*"; }

PM=""
for candidate in dnf microdnf yum apt-get apk; do
  if command -v "$candidate" >/dev/null 2>&1; then PM="$candidate"; break; fi
done
if [ -z "$PM" ]; then
  log "No supported package manager (dnf/microdnf/yum/apt-get/apk) — skipping rg/python3 install"
  exit 0
fi
log "Detected package manager: $PM"

install_with() {
  local pkg="$1"
  case "$PM" in
    dnf|microdnf|yum)
      $PM install -y "$pkg" 2>&1 | tail -5
      ;;
    apt-get)
      apt-get update -qq 2>&1 | tail -2
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$pkg" 2>&1 | tail -5
      ;;
    apk)
      apk add --no-cache "$pkg" 2>&1 | tail -5
      ;;
  esac
}

# ripgrep: try the package manager first (Debian/Ubuntu/Alpine ship it),
# then fall back to the official static musl binary on GitHub releases —
# Amazon Linux 2023 / RHEL / older yum-based distros don't have ripgrep
# in their default repos.
install_rg_from_github() {
  local arch=""
  case "$(uname -m)" in
    x86_64) arch="x86_64-unknown-linux-musl" ;;
    aarch64|arm64) arch="aarch64-unknown-linux-gnu" ;;
    *) log "WARN: unsupported arch $(uname -m) for ripgrep prebuilt"; return 1 ;;
  esac
  local rel="14.1.1"
  local url="https://github.com/BurntSushi/ripgrep/releases/download/\${rel}/ripgrep-\${rel}-\${arch}.tar.gz"
  log "Downloading ripgrep \${rel} (\${arch}) from GitHub..."
  rm -rf /tmp/rg-fetch && mkdir -p /tmp/rg-fetch && cd /tmp/rg-fetch
  if ! curl -fsSL --retry 3 -o rg.tar.gz "\${url}"; then
    log "WARN: ripgrep download failed: \${url}"
    return 1
  fi
  tar -xzf rg.tar.gz
  local bin
  bin=$(find . -maxdepth 3 -name rg -type f | head -1)
  if [ -z "\${bin}" ]; then
    log "WARN: rg binary not found in tarball"
    return 1
  fi
  install -m 0755 "\${bin}" /usr/local/bin/rg
  cd / && rm -rf /tmp/rg-fetch
}

if command -v rg >/dev/null 2>&1; then
  log "rg already installed: $(rg --version | head -1)"
else
  log "Installing ripgrep via package manager..."
  install_with ripgrep || true
  if ! command -v rg >/dev/null 2>&1; then
    install_rg_from_github || true
  fi
  if command -v rg >/dev/null 2>&1; then
    log "rg ready: $(rg --version | head -1)"
  else
    log "WARN: rg still not on PATH — agent will fall back to grep"
  fi
fi

# python3: usually preinstalled on AL2023 / Ubuntu, but cover the edge case
if command -v python3 >/dev/null 2>&1; then
  log "python3 already installed: $(python3 --version)"
else
  log "Installing python3..."
  install_with python3 || log "WARN: python3 install failed"
  command -v python3 >/dev/null 2>&1 && log "python3 ready: $(python3 --version)" || log "WARN: python3 still not on PATH"
fi
exit 0
`;
  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", script],
    sudo: true,
  });
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  for (const line of (stdout + stderr).split("\n")) {
    if (line.trim()) onLog(line);
  }
  // Don't throw on non-zero — best-effort.
}

/**
 * Codex CLI ships a vendored Rust binary via platform-specific optional
 * dependencies (e.g. `@openai/codex-linux-x64`). pnpm running on the bootstrap
 * host (Mac arm64 typically) installs only host-matching optional deps, so the
 * sandbox often comes up without the linux binary it needs.
 *
 * We resolve the SDK version, force-install the linux variant matching the
 * sandbox arch via `npm pack`, and place its `vendor/<triple>/codex/` tree
 * where the bin script (`bin/codex.js`) looks it up via `require.resolve`.
 *
 * Codex linux binaries are statically linked musl, so they run on glibc
 * sandboxes too — no libc detection needed.
 */
async function ensureCodexNativeBinary(
  sandbox: Sandbox,
  onLog: (msg: string) => void,
): Promise<void> {
  const script = `
set -e
cd ${DEEPSEC_DIR}
SDK_VER=""
for CANDIDATE in \\
  ./node_modules/@openai/codex \\
  ./packages/processor/node_modules/@openai/codex \\
  ./node_modules/.pnpm/@openai+codex-sdk@*/node_modules/@openai/codex \\
  ./node_modules/.pnpm/@openai+codex@*/node_modules/@openai/codex; do
  for DIR in $CANDIDATE; do
    if [ -f "$DIR/package.json" ]; then
      SDK_VER=$(node -p "require('$DIR/package.json').version" 2>/dev/null)
      break 2
    fi
  done
done
if [ -z "$SDK_VER" ]; then
  echo "Could not detect Codex CLI version"
  exit 1
fi
echo "Detected Codex CLI version: $SDK_VER"

# Map sandbox arch to platform package + vendor triple
UNAME_M=$(uname -m)
case "$UNAME_M" in
  x86_64) ARCH=x64; TRIPLE=x86_64-unknown-linux-musl ;;
  aarch64|arm64) ARCH=arm64; TRIPLE=aarch64-unknown-linux-musl ;;
  *) echo "Unsupported arch: $UNAME_M"; exit 1 ;;
esac
echo "  Sandbox arch: $UNAME_M (linux-\${ARCH}, $TRIPLE)"

# The platform package's actual published version is "<sdk_ver>-linux-<arch>".
PLATFORM_PKG="@openai/codex-linux-\${ARCH}"
PLATFORM_VER="\${SDK_VER}-linux-\${ARCH}"

echo "  Fetching @openai/codex@\${PLATFORM_VER} (platform binary)..."
rm -rf /tmp/codex-native-fetch && mkdir -p /tmp/codex-native-fetch
cd /tmp/codex-native-fetch
npm pack "@openai/codex@\${PLATFORM_VER}" --silent 2>&1 | tail -1
tar -xzf ./*.tgz
if [ ! -f "package/vendor/\${TRIPLE}/codex/codex" ]; then
  echo "  ERROR: vendor/\${TRIPLE}/codex/codex not present in tarball"
  ls -la package/vendor/ 2>/dev/null || true
  exit 1
fi
SIZE=$(stat -c%s "package/vendor/\${TRIPLE}/codex/codex" 2>/dev/null || echo "?")

# pnpm stores platform packages under the alias name — drop the binary at every
# place pnpm might have created (or expects) the vendor tree.
PNPM_KEY="@openai+codex-linux-\${ARCH}@\${PLATFORM_VER}"
DEST_PATHS=(
  "${DEEPSEC_DIR}/node_modules/.pnpm/\${PNPM_KEY}/node_modules/\${PLATFORM_PKG}"
  "${DEEPSEC_DIR}/node_modules/\${PLATFORM_PKG}"
)
for DEST in "\${DEST_PATHS[@]}"; do
  mkdir -p "\${DEST}/vendor/\${TRIPLE}/codex"
  cp "package/vendor/\${TRIPLE}/codex/codex" "\${DEST}/vendor/\${TRIPLE}/codex/codex"
  chmod +x "\${DEST}/vendor/\${TRIPLE}/codex/codex"
  cp package/package.json "\${DEST}/package.json"
  echo "    → \${DEST} (\${SIZE} bytes)"
done
rm -rf /tmp/codex-native-fetch
`;

  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", script],
  });
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  for (const line of (stdout + stderr).split("\n")) {
    if (line.trim()) onLog(`  ${line}`);
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `Codex native binary install failed (exit ${result.exitCode})`,
    );
  }
}

/**
 * Codex doesn't honour env vars for telemetry — its controls live in
 * config.toml under CODEX_HOME. We bake the file into the bootstrap
 * snapshot so every worker inherits it. Belt-and-suspenders to the egress
 * firewall, which would already block the analytics endpoints; this just
 * keeps the SDK from logging connection-refused noise.
 */
async function writeCodexConfig(
  sandbox: Sandbox,
  onLog: (msg: string) => void,
): Promise<void> {
  const configToml = `# Written by deepsec sandbox bootstrap. Disables non-AI egress
# (analytics, update checks, OTEL exporters) so the agent stays within
# the sandbox firewall allowlist.
check_for_update_on_startup = false

[analytics]
enabled = false

[otel]
metrics_exporter = "none"
trace_exporter = "none"
`;
  const mkdir = await sandbox.runCommand({
    cmd: "mkdir",
    args: ["-p", CODEX_HOME],
  });
  if (mkdir.exitCode !== 0) {
    throw new Error(`Failed to create ${CODEX_HOME} (exit ${mkdir.exitCode})`);
  }
  await sandbox.writeFiles([
    { path: `${CODEX_HOME}/config.toml`, content: Buffer.from(configToml) },
  ]);
  onLog(
    `  Codex config.toml written to ${CODEX_HOME}/config.toml (telemetry/updates disabled).`,
  );
}

async function runAndLog(
  sandbox: Sandbox,
  cmd: string,
  args: string[],
  cwd: string,
  _onLog: (msg: string) => void,
  extraOpts?: { sudo?: boolean },
): Promise<void> {
  const result = await sandbox.runCommand({
    cmd,
    args,
    cwd,
    sudo: extraOpts?.sudo,
  });
  if (result.exitCode !== 0) {
    const stderr = (await result.stderr()).trim();
    const stdout = (await result.stdout()).trim();
    // Include BOTH streams. pnpm in particular writes errors to stdout while
    // emitting unrelated warnings (DEP0169 from `url.parse()`) on stderr —
    // showing only stderr hides the real failure.
    const sections: string[] = [];
    if (stdout) sections.push(`--- stdout ---\n${stdout}`);
    if (stderr) sections.push(`--- stderr ---\n${stderr}`);
    const body = sections.length > 0 ? `\n${sections.join("\n")}` : "";
    throw new Error(
      `Command failed: ${cmd} ${args.join(" ")} (exit ${result.exitCode}, cwd ${cwd})${body}`,
    );
  }
}
