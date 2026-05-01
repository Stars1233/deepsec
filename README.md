# deepsec

AI-powered vulnerability scanner. Regex matchers find candidate sites,
then Claude or Codex agents investigate each batch and emit structured
findings. The pipeline triages, revalidates, and exports results.

Pair it with your existing coding agent: hand it a confirmed finding and
ask it to write a matcher for sites of the same shape. Plugin slots cover
matchers, notifiers, ownership, people lookups, and remote executors.

The analysis is deep and expensive. Use it as a one-shot pass to clean a
codebase up, then lean on cheaper code-review tools for ongoing feedback.

For large codebases, work fans out across worker machines in parallel.
Commands are idempotent — interrupt a job, restart it, and deepsec picks up
where it left off.

## Get started

deepsec is polyglot (TS, Go, Python, Lua, Terraform, …). It lives in
a `.deepsec/` directory at the root of the codebase you scan —
checked into the same git repo, so the config, project context
(auth shape, threat model), and per-project setup prompts travel
with the code. Generated scan output (findings, run metadata) stays
gitignored.

From the root of the codebase you want to scan:

```bash
npx deepsec init       # creates .deepsec/ with this repo as the first project
cd .deepsec
pnpm install           # installs deepsec from npm
```

The scaffold is minimal: `deepsec.config.ts` (one `projects[]` entry
pointing at `..`), `data/<id>/INFO.md` (template — repo context that
gets injected into every AI prompt), `data/<id>/SETUP.md` (per-project
agent setup prompt), `package.json`, `AGENTS.md`, `.env.local`,
`.gitignore`. No custom matchers by default — add them later when a
real finding suggests one.

Two things to do before scanning:

**1. Paste your AI Gateway token into `.env.local`.** See
[docs/vercel-setup.md](docs/vercel-setup.md) for how to get one.

**2. Have your coding agent fill in `data/<id>/INFO.md`.** Open the
codebase in Claude Code / Cursor / Codex CLI / etc., then paste this
prompt (replace `<id>` with the project id `init` printed):

> Read `.deepsec/node_modules/deepsec/SKILL.md` to understand the
> tool. Then read `.deepsec/data/<id>/SETUP.md` and follow it:
> skim this repo's README, any AGENTS.md/CLAUDE.md, and a handful
> of representative code files, then replace each section of
> `.deepsec/data/<id>/INFO.md`.
>
> Keep it SHORT — target 50–100 lines total. Pick 3–5 examples per
> section, not exhaustive enumeration. Name primitives (auth helpers,
> middleware) but no line numbers. Skip generic CWE categories —
> built-in matchers cover those. Cover only what's project-specific.
> INFO.md is injected into every scan batch; verbose context dilutes
> signal.

Then scan from inside `.deepsec/`:

```bash
pnpm deepsec scan
pnpm deepsec process     --concurrency 5
pnpm deepsec revalidate  --concurrency 5                       # optional, cuts FP rate
pnpm deepsec export      --format md-dir --out ./findings
```

(`--project-id` is auto-resolved when the config has one project. Pass
`--project-id <id>` once you've registered more.)

`scan` is free (regex only). `process` is the expensive AI stage
(≈$0.30/file on Opus by default — see
[docs/models.md](docs/models.md) to pick a cheaper model). Run state
goes to `.deepsec/data/<id>/`; everything except curated
`INFO.md`/`SETUP.md` is gitignored. Schema in
[docs/data-layout.md](docs/data-layout.md).

### Why in-repo?

Putting `.deepsec/` *inside* the repo means teammates inherit the
project context (auth shape, threat model in `INFO.md`, custom
matchers) just by cloning. The scaffold's `.gitignore` keeps the
config + curated context tracked and the bulky scan output ignored.

`.deepsec/` doesn't pollute the parent repo's lockfile or tooling —
it's a self-contained directory with its own `package.json`. The
parent repo only needs to be aware that `.deepsec/` exists; nothing
else.

To scan a *different* codebase from the same `.deepsec/`, run
`pnpm deepsec init-project <path>` (e.g. for a sibling service,
sub-package, etc.) and paste the same prompt above with the new id.

## Docs

- [docs/getting-started.md](docs/getting-started.md) — first-scan walkthrough
- [docs/writing-matchers.md](docs/writing-matchers.md) — **prompt your coding agent to grow your matcher set**
- [docs/configuration.md](docs/configuration.md) — `deepsec.config.ts` reference
- [docs/plugins.md](docs/plugins.md) — plugin authoring
- [docs/models.md](docs/models.md) — model selection, defaults, refusals, future models
- [docs/vercel-setup.md](docs/vercel-setup.md) — AI Gateway + Vercel Sandbox keys / tokens
- [docs/architecture.md](docs/architecture.md) — pipeline internals
- [docs/data-layout.md](docs/data-layout.md) — `data/` schemas (FileRecord, RunMeta, …)
- [docs/faq.md](docs/faq.md) — cost, model choice, sandbox mode, FP rate
- [samples/](samples/) — copy-paste starting points (currently: `webapp/`)
- [CONTRIBUTING.md](CONTRIBUTING.md) — repo layout, dev workflow

## AI provider — Vercel AI Gateway

Both agent backends route through Vercel AI Gateway by default. One
token covers Claude and Codex; the gateway has zero data retention.

```
ANTHROPIC_AUTH_TOKEN=vck_...
ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh
OPENAI_BASE_URL=https://ai-gateway.vercel.sh/v1
```

See [docs/vercel-setup.md](docs/vercel-setup.md) for getting a key
and for the Vercel Sandbox setup. To bypass the gateway, point
`ANTHROPIC_BASE_URL` at the official Anthropic endpoint (or any
Anthropic-compatible API).

## Severity levels

| Severity   | Meaning                                                 |
|------------|---------------------------------------------------------|
| `CRITICAL` | Immediate exploit / data exposure                       |
| `HIGH`     | Exploitable, real-world impact                          |
| `HIGH_BUG` | Major non-security bug (data loss, corruption, outage)  |
| `MEDIUM`   | Medium-severity security vulnerability                  |
| `BUG`      | Notable non-security bug (logic error, race, leak)      |
| `LOW`      | Minor / informational                                   |

## Plugins

Five extension slots: `matchers`, `notifiers`, `ownership`, `people`,
`executor`. A plugin can be inline or imported from a separate npm
package.

```ts
// deepsec.config.ts
import { defineConfig } from "deepsec/config";
import myPlugin from "@my-org/deepsec-plugin-foo";

export default defineConfig({
  projects: [{ id: "my-app", root: "../my-app" }],
  plugins: [myPlugin()],
});
```

See [docs/plugins.md](docs/plugins.md). For a worked inline plugin
with two custom matchers, see
[`samples/webapp/deepsec.config.ts`](samples/webapp/deepsec.config.ts).

## Distributed execution (optional)

Large monorepos can fan work across [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)
microVMs:

```bash
pnpm deepsec sandbox process --project-id my-app --sandboxes 10 --concurrency 4
```

Needs a Vercel account. The local working tree is tarballed and
uploaded; `.git` is excluded. Both OIDC tokens (local) and access
tokens (CI) are supported — see
[docs/vercel-setup.md](docs/vercel-setup.md).

## Workflow reference

| Command         | What it does                                             |
|-----------------|----------------------------------------------------------|
| `scan`          | Find candidate sites with regex matchers (fast, no AI)   |
| `process`       | AI investigation; emits findings + recommendation        |
| `triage`        | Lightweight P0/P1/P2 classification (cheaper model)      |
| `revalidate`    | Re-check existing findings; checks git history for fixes |
| `enrich`        | Add git committer info + (with a plugin) ownership data  |
| `report`        | Markdown + JSON summary for one project                  |
| `export`        | Per-finding JSON or directory of markdown files          |
| `metrics`       | Cross-project counts: severities, vulns by type, TPs     |
| `status`        | Snapshot of the project mirror                           |
| `sandbox <cmd>` | Run any of the above on Vercel Sandbox microVMs          |

## License

MIT. See [LICENSE](LICENSE).
