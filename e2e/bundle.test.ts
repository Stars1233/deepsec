import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUNDLE = path.join(ROOT, "packages/deepsec/dist/cli.mjs");
const FIXTURES = path.join(ROOT, "fixtures/vulnerable-app");

function runBundle(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync("node", [BUNDLE, ...args], {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...(opts.env ?? {}) },
    encoding: "utf-8",
    timeout: 60_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepsec-bundle-"));
  // Symlink the repo's node_modules so the temp workspace can resolve
  // `deepsec/config` (workspace symlink) and the externalized native deps.
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}

describe("bundle e2e", () => {
  beforeAll(() => {
    if (!fs.existsSync(BUNDLE)) {
      throw new Error(`Bundle not found at ${BUNDLE}. Run \`pnpm bundle\` first.`);
    }
  });

  it("--help exits 0 and prints the help banner", () => {
    const { stdout, status } = runBundle(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("deepsec");
    expect(stdout).toContain("scan");
    expect(stdout).toContain("process");
  });

  it("--version exits 0", () => {
    const { stdout, status } = runBundle(["--version"]);
    expect(status).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("scan against the fixture produces FileRecords", () => {
    const cwd = makeWorkspace();
    fs.writeFileSync(
      path.join(cwd, "deepsec.config.ts"),
      `import { defineConfig } from "deepsec/config";
export default defineConfig({
  projects: [{ id: "fixture", root: ${JSON.stringify(FIXTURES)} }],
});`,
    );

    const { status, stdout, stderr } = runBundle(
      ["scan", "--project-id", "fixture", "--root", FIXTURES],
      { cwd },
    );
    expect(status, `stdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
    expect(stdout).toContain("Scan complete");

    const filesDir = path.join(cwd, "data", "fixture", "files");
    expect(fs.existsSync(filesDir)).toBe(true);
    const filesCount = fs.readdirSync(filesDir, { recursive: true }).length;
    expect(filesCount).toBeGreaterThan(0);
  });

  it("loads deepsec.config.ts from cwd via the bundle", () => {
    const cwd = makeWorkspace();
    fs.writeFileSync(
      path.join(cwd, "deepsec.config.ts"),
      `import { defineConfig } from "deepsec/config";
console.error("[config-loaded-marker]");
export default defineConfig({
  projects: [{ id: "fixture", root: ${JSON.stringify(FIXTURES)} }],
});`,
    );

    const { stderr } = runBundle(["--help"], { cwd });
    expect(stderr).toContain("[config-loaded-marker]");
  });

  it("activates an inline plugin declared in deepsec.config.ts", () => {
    const cwd = makeWorkspace();
    // A throwaway plugin contributing one matcher. If the bundle's plugin
    // loader works, the matcher's slug should be selectable via --matchers
    // and visible in the scan log.
    fs.writeFileSync(
      path.join(cwd, "deepsec.config.ts"),
      `import { defineConfig } from "deepsec/config";
const plugin = {
  name: "inline-test-plugin",
  matchers: [{
    slug: "inline-test-matcher",
    description: "test marker",
    noiseTier: "precise",
    filePatterns: ["**/*.ts"],
    match() { return []; },
  }],
};
export default defineConfig({
  projects: [{ id: "fixture", root: ${JSON.stringify(FIXTURES)} }],
  plugins: [plugin],
});`,
    );

    const { status, stdout } = runBundle(
      ["scan", "--project-id", "fixture", "--root", FIXTURES, "--matchers", "inline-test-matcher"],
      { cwd },
    );
    expect(status, stdout).toBe(0);
    expect(stdout).toContain("inline-test-matcher");
  });

  it("samples/webapp/ — config loads and custom matchers register", () => {
    const sampleDir = path.join(ROOT, "samples/webapp");
    // Symlink node_modules so the sample's `deepsec/config` import resolves.
    const link = path.join(sampleDir, "node_modules");
    if (!fs.existsSync(link)) {
      fs.symlinkSync(path.join(ROOT, "node_modules"), link, "dir");
    }
    try {
      const { status, stdout, stderr } = runBundle(
        [
          "scan",
          "--project-id",
          "webapp",
          "--root",
          FIXTURES,
          "--matchers",
          "webapp-debug-flag,webapp-route-no-rate-limit",
        ],
        { cwd: sampleDir },
      );
      expect(status, `stdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
      // Both custom matchers should appear in the run log.
      expect(stdout).toContain("webapp-debug-flag");
      expect(stdout).toContain("webapp-route-no-rate-limit");
    } finally {
      fs.rmSync(link, { force: true });
      fs.rmSync(path.join(sampleDir, "data"), { recursive: true, force: true });
    }
  });

  it("init scaffolds a minimal workspace seeded with the first project", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deepsec-init-"));
    const workspace = path.join(tmp, "audits");
    const targetRoot = path.join(tmp, "my-app");
    fs.mkdirSync(targetRoot);
    try {
      const { status, stdout, stderr } = runBundle(["init", workspace, targetRoot]);
      expect(status, `stdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
      expect(stdout).toContain("Initialized deepsec audits workspace");
      expect(stdout).toContain("First project:");
      expect(stdout).toContain("AGENTS.md");

      for (const f of [
        "package.json",
        "deepsec.config.ts",
        "INFO.md",
        "AGENTS.md",
        ".env.local",
        ".gitignore",
      ]) {
        expect(fs.existsSync(path.join(workspace, f)), `missing ${f}`).toBe(true);
      }
      // No custom matchers / extra files from a sample copy.
      expect(fs.existsSync(path.join(workspace, "matchers"))).toBe(false);
      expect(fs.existsSync(path.join(workspace, "config.json"))).toBe(false);

      // package.json: workspace dir name + deepsec dep.
      const pkg = JSON.parse(fs.readFileSync(path.join(workspace, "package.json"), "utf-8"));
      expect(pkg.name).toBe("audits");
      expect(pkg.dependencies.deepsec).toBeTruthy();

      // config.ts: id derived from target basename, root is relative.
      const configSrc = fs.readFileSync(path.join(workspace, "deepsec.config.ts"), "utf-8");
      expect(configSrc).toContain('id: "my-app"');
      expect(configSrc).toContain('root: "../my-app"');
      expect(configSrc).toContain("infoMarkdown:");

      // AGENTS.md: agent setup prompt mentions SKILL.md and INFO.md.
      const agentsMd = fs.readFileSync(path.join(workspace, "AGENTS.md"), "utf-8");
      expect(agentsMd).toContain("node_modules/deepsec/SKILL.md");
      expect(agentsMd).toContain("INFO.md");
      expect(agentsMd).toContain("../my-app");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("init --id overrides the auto-derived project id", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deepsec-init-"));
    const workspace = path.join(tmp, "audits");
    const targetRoot = path.join(tmp, "boring-name");
    fs.mkdirSync(targetRoot);
    try {
      const { status, stdout, stderr } = runBundle([
        "init",
        workspace,
        targetRoot,
        "--id",
        "internal-api",
      ]);
      expect(status, `stdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
      const configSrc = fs.readFileSync(path.join(workspace, "deepsec.config.ts"), "utf-8");
      expect(configSrc).toContain('id: "internal-api"');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("init refuses a non-existent target codebase", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deepsec-init-"));
    try {
      const { status, stderr } = runBundle([
        "init",
        path.join(tmp, "audits"),
        path.join(tmp, "does-not-exist"),
      ]);
      expect(status).not.toBe(0);
      expect(stderr).toContain("Target codebase does not exist");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("init refuses a non-empty workspace without --force", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deepsec-init-"));
    const workspace = path.join(tmp, "audits");
    const targetRoot = path.join(tmp, "my-app");
    fs.mkdirSync(workspace);
    fs.mkdirSync(targetRoot);
    fs.writeFileSync(path.join(workspace, "marker"), "");
    try {
      const { status, stderr } = runBundle(["init", workspace, targetRoot]);
      expect(status).not.toBe(0);
      expect(stderr).toContain("not empty");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
