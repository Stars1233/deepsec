import fs from "node:fs";
import path from "node:path";
import { dataDir, ensureProject, findProject } from "@deepsec/core";
import { BOLD, DIM, GREEN, RESET, YELLOW } from "../formatters.js";
import { requireExistingDir } from "../require-dir.js";

export const PROJECTS_INSERT_MARKER = "// <deepsec:projects-insert-above>";

const CONFIG_FILENAMES = [
  "deepsec.config.ts",
  "deepsec.config.mjs",
  "deepsec.config.js",
  "deepsec.config.cjs",
];

/** Walk up from `start` looking for a deepsec config file. */
function findWorkspaceRoot(start: string): string | undefined {
  let dir = path.resolve(start);
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      if (fs.existsSync(path.join(dir, name))) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

interface RegisterResult {
  id: string;
  targetRel: string;
  targetAbs: string;
  configPath: string;
  setupMdPath: string;
  infoMdPath: string;
}

/**
 * Register a project in an existing deepsec workspace. Shared by `init`
 * (called once for the first project, after the workspace skeleton is in
 * place) and `init-project` (called against an existing workspace).
 *
 * Writes:
 *   - data/<id>/project.json (via ensureProject — also auto-detects githubUrl)
 *   - data/<id>/INFO.md (placeholder template)
 *   - data/<id>/SETUP.md (per-project agent setup prompt)
 *   - appends `{ id, root }` to projects[] in deepsec.config.ts
 */
export function registerProject(opts: {
  workspaceDir: string;
  targetRoot: string;
  id?: string;
  force?: boolean;
}): RegisterResult {
  const workspaceDir = fs.realpathSync(path.resolve(opts.workspaceDir));
  const targetAbs = requireExistingDir(opts.targetRoot, "<target-root>");
  const id = opts.id ?? path.basename(targetAbs);
  const targetRel = path.relative(workspaceDir, targetAbs);

  const configPath = findConfigInWorkspace(workspaceDir);
  if (!configPath) {
    throw new Error(
      `Could not find deepsec.config.ts in ${workspaceDir}.\n` +
        `  init-project must run inside a workspace created by \`deepsec init\`.`,
    );
  }

  const projectDataDir = path.join(workspaceDir, dataDir(id));
  const dataExists = fs.existsSync(projectDataDir) && fs.readdirSync(projectDataDir).length > 0;
  const inConfig = configIncludesProjectId(configPath, id);
  if ((dataExists || inConfig) && !opts.force) {
    throw new Error(
      `Project "${id}" already exists in this workspace ` +
        `(${dataExists ? "data dir" : "config"} occupied).\n` +
        `  Pass --force to overwrite, or pick a different --id.`,
    );
  }

  // Run all writes from the workspace root so DEEPSEC_DATA_ROOT-relative
  // paths via `dataDir(id)` land correctly. Restore on exit.
  const originalCwd = process.cwd();
  try {
    process.chdir(workspaceDir);
    ensureProject(id, targetAbs);
    const projectDir = dataDir(id);
    fs.mkdirSync(projectDir, { recursive: true });
    const infoMdPath = path.join(projectDir, "INFO.md");
    if (!fs.existsSync(infoMdPath) || opts.force) {
      fs.writeFileSync(infoMdPath, infoMdTemplate(id));
    }
    const setupMdPath = path.join(projectDir, "SETUP.md");
    fs.writeFileSync(setupMdPath, setupMdTemplate(id, targetRel));

    insertProjectIntoConfig(configPath, id, targetRel);

    return {
      id,
      targetRel,
      targetAbs,
      configPath,
      setupMdPath: path.resolve(setupMdPath),
      infoMdPath: path.resolve(infoMdPath),
    };
  } finally {
    process.chdir(originalCwd);
  }
}

function findConfigInWorkspace(workspaceDir: string): string | undefined {
  for (const name of CONFIG_FILENAMES) {
    const p = path.join(workspaceDir, name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function configIncludesProjectId(configPath: string, id: string): boolean {
  const src = fs.readFileSync(configPath, "utf-8");
  const re = new RegExp(`id:\\s*["'\`]${escapeRegex(id)}["'\`]`);
  return re.test(src);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insertProjectIntoConfig(configPath: string, id: string, root: string): void {
  const src = fs.readFileSync(configPath, "utf-8");
  if (!src.includes(PROJECTS_INSERT_MARKER)) {
    throw new Error(
      `Marker "${PROJECTS_INSERT_MARKER}" not found in ${configPath}.\n` +
        `  init-project relies on this marker to know where to add the new project.\n` +
        `  Either add it back inside the projects[] array, or add the project entry by hand:\n` +
        `    { id: "${id}", root: ${JSON.stringify(root)} },`,
    );
  }
  // Preserve the marker's leading indent on the inserted line so the
  // appended entry sits at the same indent level.
  const replacer = (match: string) => {
    const m = match.match(/^([\t ]*)(.*)$/m);
    const indent = m?.[1] ?? "    ";
    return `${indent}{ id: ${JSON.stringify(id)}, root: ${JSON.stringify(root)} },\n${match}`;
  };
  const re = new RegExp(`^[\\t ]*${escapeRegex(PROJECTS_INSERT_MARKER)}.*$`, "m");
  const updated = src.replace(re, replacer);
  fs.writeFileSync(configPath, updated);
}

function infoMdTemplate(id: string): string {
  return `# ${id}

> Replace each section with real content. See \`SETUP.md\` (next to this
> file) for guidance and a coding-agent prompt that fills this in for you.

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

function setupMdTemplate(id: string, targetRel: string): string {
  return `# Agent setup for \`${id}\`

This is a deepsec scanning workspace. Project \`${id}\` was just registered
(target: \`${targetRel}\`). Setup is incomplete — \`data/${id}/INFO.md\`
still has placeholder sections.

## What to do

1. **Read the deepsec skill.** After \`pnpm install\`, the file is at
   \`node_modules/deepsec/SKILL.md\`. It maps every doc topic to a file
   under \`node_modules/deepsec/dist/docs/\`. Read \`getting-started.md\`,
   \`configuration.md\`, and \`writing-matchers.md\` (skim the rest).

2. **Fill in \`data/${id}/INFO.md\`.** It's auto-injected into the AI
   prompt for every batch. Source material:
   - \`${targetRel}/README.md\`
   - \`${targetRel}/package.json\` (or \`go.mod\`, \`pyproject.toml\`, etc.)
   - any \`AGENTS.md\` / \`CLAUDE.md\` in \`${targetRel}\`
   - the actual code under \`${targetRel}/\` — *open files*, don't guess

   Be concrete. Name actual functions, file globs, middleware names. Avoid
   generic security boilerplate. Vague INFO.md → vague findings.

3. **(Optional) Add custom matchers** for repo-specific patterns the
   built-in matchers won't catch. Read
   \`node_modules/deepsec/dist/docs/writing-matchers.md\` first; the
   workflow there starts from a confirmed finding and grows the matcher
   from it. Don't add matchers speculatively — wait for a real TP.

## When you're done

The user will run:

\`\`\`bash
pnpm deepsec scan    --project-id ${id}
pnpm deepsec process --project-id ${id}
\`\`\`

You can delete this file once setup is complete.
`;
}

/* CLI entry point */
export function initProjectCommand(opts: {
  targetRoot?: string;
  id?: string;
  force?: boolean;
}): void {
  if (!opts.targetRoot) {
    console.error(
      `Usage: deepsec init-project <target-root> [--id <project-id>] [--force]\n\n` +
        `  <target-root>  Path to the codebase to register as a new project.\n\n` +
        `Run from inside a workspace created by \`deepsec init\`.`,
    );
    process.exit(1);
  }

  const workspaceDir = findWorkspaceRoot(process.cwd());
  if (!workspaceDir) {
    console.error(
      `No deepsec workspace found in or above ${process.cwd()}.\n` +
        `  Run \`deepsec init <workspace> <target>\` first.`,
    );
    process.exit(1);
  }

  let result: RegisterResult;
  try {
    result = registerProject({
      workspaceDir,
      targetRoot: opts.targetRoot,
      id: opts.id,
      force: opts.force,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Reference findProject to silence unused-import lint when this file
  // is bundled (the function is part of the public surface and may be
  // used by future callers).
  void findProject;

  console.log(
    `${GREEN}✓${RESET} Added project ${BOLD}${result.id}${RESET} → ${result.targetRel}\n`,
  );
  console.log(
    `  ${YELLOW}Hand off to your coding agent:${RESET} open the workspace in Claude Code,`,
  );
  console.log(
    `  Cursor, Codex CLI, etc. They'll pick up ${BOLD}data/${result.id}/SETUP.md${RESET} and`,
  );
  console.log(`  fill in ${BOLD}data/${result.id}/INFO.md${RESET} from the codebase.`);
  console.log();
  console.log(`  Then: ${DIM}pnpm deepsec scan --project-id ${result.id}${RESET}`);
}
