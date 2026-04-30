import fs from "node:fs";
import path from "node:path";
import { BOLD, DIM, GREEN, RESET, YELLOW } from "../formatters.js";

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
  const targetRoot = path.resolve(process.cwd(), opts.targetRoot);

  if (!fs.existsSync(targetRoot)) {
    console.error(`Target codebase does not exist: ${targetRoot}`);
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

  const projectId = opts.id ?? path.basename(targetRoot);
  // Use a relative path in the config so the workspace stays portable
  // (re-locate the workspace and the target together and it still works).
  const targetRel = path.relative(workspaceDir, targetRoot);

  fs.mkdirSync(workspaceDir, { recursive: true });

  writeFile(workspaceDir, "package.json", packageJson(path.basename(workspaceDir)));
  writeFile(workspaceDir, "deepsec.config.ts", configTs(projectId, targetRel));
  writeFile(workspaceDir, "INFO.md", infoMd(projectId));
  writeFile(workspaceDir, "AGENTS.md", agentsMd(projectId, targetRel));
  writeFile(workspaceDir, ".env.local", envLocal());
  writeFile(workspaceDir, ".gitignore", gitignore());

  const wsRel = path.relative(process.cwd(), workspaceDir) || ".";
  console.log(
    `${GREEN}✓${RESET} Initialized deepsec audits workspace at ${BOLD}${workspaceDir}${RESET}`,
  );
  console.log(`  ${DIM}First project:${RESET} ${BOLD}${projectId}${RESET} → ${targetRel}\n`);
  console.log("Next steps:\n");
  if (wsRel !== ".") console.log(`  cd ${wsRel}`);
  console.log(`  pnpm install                          ${DIM}# installs deepsec${RESET}`);
  console.log(`  ${DIM}# Set ANTHROPIC_AUTH_TOKEN in .env.local${RESET}`);
  console.log();
  console.log(
    `  ${YELLOW}Hand off to your coding agent:${RESET} ${BOLD}AGENTS.md${RESET} has the prompt.`,
  );
  console.log(`  ${DIM}It walks the agent through filling in INFO.md from your repo.${RESET}`);
  console.log();
  console.log(`  pnpm deepsec scan    --project-id ${projectId} --root ${targetRel}`);
  console.log(`  pnpm deepsec process --project-id ${projectId}`);
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

function configTs(id: string, targetRel: string): string {
  return `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "deepsec/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  projects: [
    {
      id: ${JSON.stringify(id)},
      root: ${JSON.stringify(targetRel)},
      infoMarkdown: fs.readFileSync(path.join(here, "INFO.md"), "utf-8"),
    },
  ],
});
`;
}

function infoMd(id: string): string {
  return `# ${id}

> Replace each section with real content. See AGENTS.md for guidance.

## What this codebase does

<one paragraph describing the app and its purpose>

## Auth shape

<auth helpers, middleware patterns, session shape, RBAC primitives>

## Threat model

<what an attacker would want from this codebase, plus likely vectors>

## Project-specific patterns to flag

<entry points, sensitive helpers, untrusted input shapes, anything domain-specific>

## Known false-positives

<test fixtures, generated code, intentionally-unsafe code paths to ignore>
`;
}

function agentsMd(id: string, targetRel: string): string {
  return `# Agent setup

This is a deepsec scanning workspace for \`${id}\` (target: \`${targetRel}\`).
Setup is incomplete — \`INFO.md\` still has placeholder sections.

## What to do

1. **Read the deepsec skill.** After \`pnpm install\`, the file is at
   \`node_modules/deepsec/SKILL.md\`. It maps every doc topic to a file
   under \`node_modules/deepsec/dist/docs/\`. Read \`getting-started.md\`,
   \`configuration.md\`, and \`writing-matchers.md\` (skim the rest).

2. **Fill in \`INFO.md\`.** The fields are listed there. Source material:
   - \`${targetRel}/README.md\`
   - \`${targetRel}/package.json\` (or \`go.mod\`, \`pyproject.toml\`, etc.)
   - any \`AGENTS.md\` / \`CLAUDE.md\` in \`${targetRel}\`
   - the actual code under \`${targetRel}/\` — *open files*, don't guess

   Be concrete. Name actual functions, file globs, middleware names. Avoid
   generic security boilerplate. INFO.md is injected into the AI prompt
   for every batch — vague content here means vague findings.

3. **(Optional) Add custom matchers** for repo-specific patterns the
   built-in matchers won't catch. Read
   \`node_modules/deepsec/dist/docs/writing-matchers.md\` first; the
   workflow there starts from a confirmed finding and grows the matcher
   from it. Don't add matchers speculatively — wait for a real TP.

## When you're done

The user will run:

\`\`\`bash
pnpm deepsec scan    --project-id ${id} --root ${targetRel}
pnpm deepsec process --project-id ${id}
\`\`\`

You can delete this file once setup is complete.
`;
}

function envLocal(): string {
  return `ANTHROPIC_AUTH_TOKEN=
ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh
`;
}

function gitignore(): string {
  return `node_modules/
data/
.env*.local
`;
}
