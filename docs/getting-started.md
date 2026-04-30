# Getting started

The README has the four commands. This page explains what each one does
and how to read the output.

## Install

Requires **Node.js 22+**. The recipe below uses pnpm; npm and yarn
work the same way.

deepsec ships on npm. Make one **dedicated audits workspace** next to the
codebases you're scanning. The workspace is N:1 — one workspace, many
target repos as `projects[]` entries.

```
parent/
├── security-audits/   ← dedicated audits workspace
├── my-app/            ← a target codebase
└── another-service/   ← another target codebase
```

From inside your first target codebase, step out and scaffold a
workspace seeded with that codebase as the first project:

```bash
cd ..                                              # out of my-app/
npx deepsec init security-audits ./my-app          # workspace + first project
cd security-audits
pnpm install                                       # installs deepsec
```

`init` lays down a minimal scaffold: `package.json`, `deepsec.config.ts`
(with one `projects[]` entry pointing at `./my-app`, id derived from the
target's basename), an `INFO.md` template with section placeholders, an
`AGENTS.md` with a setup prompt for your coding agent, plus `.env.local`
and `.gitignore`. There are no custom matchers in the scaffold — add
those later, only when a real finding shapes one for you.

Open `.env.local` and fill in `ANTHROPIC_AUTH_TOKEN`. Get one from
[Vercel AI Gateway](https://vercel.com/ai-gateway) (one token covers
Claude and Codex) or set `ANTHROPIC_BASE_URL=https://api.anthropic.com`
to use Anthropic directly. See [vercel-setup.md](vercel-setup.md).

## Fill in INFO.md

`INFO.md` is what makes deepsec project-aware. It's injected into the
AI prompt for every batch — vague content here means vague findings.

### Option A: let your coding agent do it (recommended)

Open `security-audits/` in your coding agent (Claude Code, Codex,
Cursor, Aider, …). The scaffold's `AGENTS.md` *is* the prompt — agents
that read `AGENTS.md` automatically (most do) will pick it up and run
through the workflow:

1. Read `node_modules/deepsec/SKILL.md` (the deepsec skill — maps every
   doc topic to a file under `node_modules/deepsec/dist/docs/`).
2. Open the target codebase, read its README + `package.json` + any
   `AGENTS.md`/`CLAUDE.md`, plus the actual code.
3. Replace each section in `INFO.md` with concrete content (helper
   names, file globs, middleware names — not generic boilerplate).

If your agent doesn't auto-load `AGENTS.md`, paste its contents as the
prompt yourself.

### Option B: by hand

The scaffold's `deepsec.config.ts` already loads `INFO.md` via
`infoMarkdown`, so just edit the file directly. The minimum config
shape, if you'd rather start from scratch:

```ts
// deepsec.config.ts
import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "my-app", root: "../my-app" },
  ],
});
```

Strip out what you don't need from the scaffold. `INFO.md` is
optional but worth keeping — even a paragraph noticeably improves the
AI's output.

## Run a scan

Before the first command: deepsec writes per-project state to
`./data/<project-id>/` next to your config — `files/` (one JSON per
scanned source file), `runs/`, plus `project.json` and the optional
`INFO.md` / `config.json`. The directory is gitignored by default; see
[data-layout.md](data-layout.md) for the full schema.

```bash
pnpm deepsec scan --project-id my-app --root ../my-app
```

`scan` runs ~110 regex matchers across the codebase. No AI calls, no cost.
On a 2,000-file project it takes ~15s. Output goes to `data/my-app/files/`
as one JSON file per scanned source file (called a `FileRecord`).

```bash
pnpm deepsec status --project-id my-app
```

shows the current state: how many files were scanned, how many are
pending AI investigation, etc.

## Run the AI investigation

```bash
pnpm deepsec process --project-id my-app --concurrency 5
```

This is where it gets expensive. Defaults: Claude Opus, 5 files per batch,
5 batches in parallel = 25 files in flight at once. You can lower the
parallelism (`--concurrency 1`) or set `--limit 50` to budget-cap.

A rough cost guide (Opus, default settings):

| Files | Approx cost | Approx wall time |
|---|---|---|
| 100 | $25–60 | 5–15 min |
| 500 | $130–300 | 25–60 min |
| 2,000 | $500–1200 | 1.5–4 hr |

Costs swing 2–3x based on file complexity. Run `--limit 50` first to
calibrate before committing to the full pass.

For a cheaper backend:

```bash
pnpm deepsec process --project-id my-app --agent codex --model gpt-5.5
```

Codex is the OpenAI-flavored backend. Same prompt, same JSON output,
different agent loop. Try both on a small sample to see which catches
shapes you care about. See [models.md](models.md) for the full
backend / model matrix, refusal handling, and how to swap in newer
models.

## Triage and revalidate

```bash
pnpm deepsec triage --project-id my-app --severity HIGH
pnpm deepsec revalidate --project-id my-app --min-severity HIGH
```

- **triage**: classifies findings P0/P1/P2 without re-reading the code.
  ~1¢/finding.
- **revalidate**: re-reads the code and the git history, then emits a
  TP/FP/Fixed/Uncertain verdict. Comparable cost to `process`. Cuts FP
  rate by 50%+ on most repos.

Both optional, but worth running on the HIGH/CRITICAL set.

## Get the findings out

```bash
pnpm deepsec export --project-id my-app --format md-dir --out ./findings
pnpm deepsec export --project-id my-app --format json   --out findings.json
```

`md-dir` writes one markdown file per finding under
`./findings/{CRITICAL,HIGH,MEDIUM,…}/`. `json` writes a single array
suitable for piping to a downstream issue tracker.

For a quick aggregate look:

```bash
pnpm deepsec metrics --project-id my-app
```

## Next

- [docs/writing-matchers.md](writing-matchers.md) — when a TP finding
  isn't covered by an existing matcher, prompt your coding agent to
  write one for the pattern.
- [docs/configuration.md](configuration.md) — every field on
  `deepsec.config.ts` and `data/<id>/config.json`.
- [docs/models.md](models.md) — defaults, `--agent` / `--model`,
  refusal handling, future models.
- [docs/plugins.md](plugins.md) — for org-specific patterns that don't
  belong in the public matcher set.
