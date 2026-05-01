import fs from "node:fs";
import path from "node:path";
import { BOLD, DIM, GREEN, RESET, YELLOW } from "../formatters.js";
import { requireExistingDir } from "../require-dir.js";
import { PROJECTS_INSERT_MARKER, registerProject } from "./init-project.js";

const IGNORED_WORKSPACE_ENTRIES = new Set([".git", ".DS_Store"]);

interface InitOpts {
  workspace?: string;
  targetRoot?: string;
  id?: string;
  force?: boolean;
}

export function initCommand(opts: InitOpts) {
  if (!opts.workspace || !opts.targetRoot) {
    console.error(
      `Usage: deepsec init <workspace-dir> <target-root> [--id <project-id>] [--force]\n\n` +
        `  <workspace-dir>  Where to create the new scanning workspace\n` +
        `  <target-root>    Path to the codebase you want to scan first\n\n` +
        `Example:\n  deepsec init security-audits ../my-app`,
    );
    process.exit(1);
  }

  const workspaceDir = path.resolve(process.cwd(), opts.workspace);
  let targetAbs: string;
  try {
    targetAbs = requireExistingDir(opts.targetRoot, "<target-root>");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (fs.existsSync(workspaceDir)) {
    const meaningful = fs
      .readdirSync(workspaceDir)
      .filter((e) => !IGNORED_WORKSPACE_ENTRIES.has(e));
    if (meaningful.length > 0 && !opts.force) {
      console.error(
        `Workspace directory is not empty: ${workspaceDir}\n` +
          `Use --force to write into a non-empty directory.`,
      );
      process.exit(1);
    }
  }

  // Workspace skeleton: empty config (with marker), README, AGENTS, env.
  fs.mkdirSync(workspaceDir, { recursive: true });
  writeFile(workspaceDir, "package.json", packageJson(path.basename(workspaceDir)));
  writeFile(workspaceDir, "deepsec.config.ts", emptyConfigTs());
  writeFile(workspaceDir, "AGENTS.md", workspaceAgentsMd());
  writeFile(workspaceDir, ".env.local", envLocal());
  writeFile(workspaceDir, ".gitignore", gitignore());

  // Register the first project via the shared code path. Same writes
  // `init-project` would do: data/<id>/{project.json,INFO.md,SETUP.md}
  // and append to projects[].
  let registered: ReturnType<typeof registerProject>;
  try {
    registered = registerProject({
      workspaceDir,
      targetRoot: targetAbs,
      id: opts.id,
      force: opts.force,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // README references the project, so write it AFTER registration.
  writeFile(workspaceDir, "README.md", readmeMd(registered.id, registered.targetRel));

  const wsRel = path.relative(process.cwd(), workspaceDir) || ".";
  console.log(
    `${GREEN}✓${RESET} Initialized deepsec audits workspace at ${BOLD}${workspaceDir}${RESET}`,
  );
  console.log(
    `  ${DIM}First project:${RESET} ${BOLD}${registered.id}${RESET} → ${registered.targetRel}\n`,
  );
  console.log("Next steps:\n");
  if (wsRel !== ".") console.log(`  cd ${wsRel}`);
  console.log(`  pnpm install                          ${DIM}# installs deepsec${RESET}`);
  console.log(`  ${DIM}# Set ANTHROPIC_AUTH_TOKEN in .env.local${RESET}`);
  console.log();
  console.log(`  ${YELLOW}Hand off to your coding agent:${RESET} open the workspace and follow`);
  console.log(`  ${BOLD}data/${registered.id}/SETUP.md${RESET} to fill in INFO.md.`);
  console.log();
  console.log(`  pnpm deepsec scan    --project-id ${registered.id}`);
  console.log(`  pnpm deepsec process --project-id ${registered.id}`);
  console.log();
  console.log(`  ${DIM}# To register another project later: deepsec init-project <root>${RESET}`);
}

function writeFile(dir: string, name: string, content: string) {
  const p = path.join(dir, name);
  if (fs.existsSync(p)) return;
  fs.writeFileSync(p, content);
}

function packageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      version: "0.1.0",
      private: true,
      description: "deepsec scanning workspace",
      type: "module",
      dependencies: { deepsec: "^0.1.0" },
    },
    null,
    2,
  )}\n`;
}

/**
 * Empty config with the insert marker. `init-project` (and the same code
 * path called from `init`) appends new project entries above the marker.
 */
function emptyConfigTs(): string {
  return `import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    ${PROJECTS_INSERT_MARKER}
  ],
});
`;
}

function readmeMd(id: string, targetRel: string): string {
  return `# deepsec audits workspace

This directory holds deepsec scan state for one or more codebases.
Currently configured: \`${id}\` (target: \`${targetRel}\`).

## Setup

1. \`pnpm install\` — pulls in [deepsec](https://www.npmjs.com/package/deepsec).
2. Add your AI Gateway token to \`.env.local\` (see [vercel-setup
   docs](https://github.com/vercel/deepsec/blob/main/docs/vercel-setup.md)).
3. Open this workspace in your coding agent (Claude Code, Cursor, …).
   It picks up \`data/${id}/SETUP.md\` and fills in
   \`data/${id}/INFO.md\` from the codebase.

## Daily commands

\`\`\`bash
pnpm deepsec scan        --project-id ${id}
pnpm deepsec process     --project-id ${id} --concurrency 5
pnpm deepsec revalidate  --project-id ${id} --concurrency 5  # cuts FP rate
pnpm deepsec export      --project-id ${id} --format md-dir --out ./findings
\`\`\`

\`scan\` is free (regex only). \`process\` is the AI stage (≈$0.30/file
on Opus by default). State lives in \`data/${id}/\`.

## Adding another project

\`\`\`bash
pnpm deepsec init-project ../another-codebase
\`\`\`

Appends a new entry to \`deepsec.config.ts\` (above the insert marker)
and writes a fresh \`data/<id>/{INFO.md,SETUP.md,project.json}\`. Open
the new \`SETUP.md\` in your agent to fill in INFO.md. Each project
gets its own \`data/<id>/\` subdirectory.

## Layout

\`\`\`
deepsec.config.ts        Project list (one entry per scanned repo)
data/${id}/
  INFO.md                Repo context — auto-injected into AI prompts
  SETUP.md               Per-project agent setup prompt (delete after use)
  project.json           Auto-managed: rootPath, githubUrl
  files/                 One JSON per scanned source file
  runs/                  Run metadata
  reports/               Generated markdown reports
AGENTS.md                Workspace-level pointer for coding agents
.env.local               Tokens (gitignored)
\`\`\`

## Versioning the workspace + scan state

This workspace's \`.gitignore\` excludes \`data/\`. Scan output (findings,
run metadata, INFO.md) is often organization-sensitive and shouldn't
share a git history with the workspace tooling.

The recommended pattern is **\`data/\` as its own git repo**:

\`\`\`bash
git init                 # the workspace itself (config, AGENTS.md, plugins)
cd data && git init      # the scan state, separately
\`\`\`

## Docs

After \`pnpm install\`, the full deepsec docs ship at
\`node_modules/deepsec/dist/docs/\`:

- \`getting-started.md\`, \`configuration.md\`, \`models.md\`,
  \`writing-matchers.md\`, \`plugins.md\`, \`architecture.md\`,
  \`data-layout.md\`, \`vercel-setup.md\`, \`faq.md\`

Or browse them on
[GitHub](https://github.com/vercel/deepsec/tree/main/docs).
`;
}

/**
 * Workspace-level AGENTS.md — generic pointer to per-project SETUP.md
 * files and to the deepsec skill. Per-project setup prompts now live at
 * `data/<id>/SETUP.md` (written by `init-project` / `init`).
 */
function workspaceAgentsMd(): string {
  return `# Agent setup

This is a deepsec scanning workspace. Each registered project has its
own setup prompt at \`data/<id>/SETUP.md\` — open the relevant one when
asked to set a project up.

## Common tasks

- **Set up a project for scanning**: read \`data/<id>/SETUP.md\` and
  follow it (read \`node_modules/deepsec/SKILL.md\`, then fill
  \`data/<id>/INFO.md\` from the target codebase).
- **Add a new project**: run \`deepsec init-project <root>\` — it
  scaffolds \`data/<id>/\` and prints/writes the setup prompt for the
  new project.
- **Write a custom matcher** (only after a real true-positive shows you
  a pattern worth keeping): read
  \`node_modules/deepsec/dist/docs/writing-matchers.md\`.

## Reference

The deepsec skill is at \`node_modules/deepsec/SKILL.md\` (after
\`pnpm install\`). The full docs ship at
\`node_modules/deepsec/dist/docs/\`.
`;
}

function envLocal(): string {
  return `ANTHROPIC_AUTH_TOKEN=
ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh
`;
}

function gitignore(): string {
  return `node_modules/
.env*.local
data/
`;
}
