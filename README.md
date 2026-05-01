# deepsec

AI-powered vulnerability scanner. Regex matchers find candidate sites,
then Claude or Codex agents investigate each batch and emit structured
findings. The pipeline triages, revalidates, and exports results.

deepsec is meant to be used together with your existing coding agent. Ask
it to build custom scanners for your code base through deepsec's flexible
plugin system.

deepsec performs very deep analysis of a code base and can get very expensive
to use. We recommend running it one-off to get a code base into a good
state and then relying on code review based tools for continuous feedback.

Supports massively parallel fanout of processing across many worker
machines for large code bases. Generally, commands are idempotent: When you
interrupt a job, you can restart it and `deepsec` will continue where it
left off.


## Get started

deepsec is polyglot (TS, Go, Python, Lua, Terraform, …). Make a
directory next to the codebase you want to scan — separate from the
codebase, so deepsec's dependencies don't bleed into your build. One
such directory holds many projects.

```
parent/
├── security-audits/   ← deepsec lives here (config + scan state)
├── my-app/            ← target codebase
└── another-service/   ← another target codebase (added later)
```

From inside your first target codebase, step out one level and
scaffold:

```bash
cd ..                                              # out of my-app/
npx deepsec init security-audits ./my-app          # creates the dir + registers my-app
cd security-audits
pnpm install                                       # installs deepsec from npm
```

The scaffold is minimal: `deepsec.config.ts` (one `projects[]` entry
pointing at `../my-app`), `data/my-app/INFO.md` (template — repo
context that gets injected into every AI prompt), `data/my-app/SETUP.md`
(per-project agent setup prompt), `package.json`, workspace `AGENTS.md`,
`.env.local`, `.gitignore`. No custom matchers by default — add them
later when a real finding suggests one.

Two things to do before scanning:

**1. Paste your AI Gateway token into `.env.local`.** See
[docs/vercel-setup.md](docs/vercel-setup.md) for how to get one.

**2. Have your coding agent fill in `data/my-app/INFO.md`.** Open the
`security-audits/` directory in Claude Code / Cursor / Codex CLI / etc.,
then paste this prompt (replace `my-app` with your project id and
`../my-app` with your target's relative path):

> Read `node_modules/deepsec/SKILL.md` to understand the tool. Then
> read `data/my-app/SETUP.md` for project-specific instructions and
> follow them: open the target codebase at `../my-app`, read its
> README, package.json (or `go.mod` / `pyproject.toml`), any
> existing `AGENTS.md` / `CLAUDE.md`, and the actual code, then
> replace each section in `data/my-app/INFO.md` with concrete
> content — auth helpers, middleware names, threat model,
> false-positive sources. Be specific: name actual functions and
> file globs, not generic security boilerplate. INFO.md is injected
> into every AI scan batch, so vague content here means vague
> findings.

Then scan:

```bash
pnpm deepsec scan        --project-id my-app
pnpm deepsec process     --project-id my-app --concurrency 5
pnpm deepsec revalidate  --project-id my-app --concurrency 5     # optional, cuts FP rate
pnpm deepsec export      --project-id my-app --format md-dir --out ./findings
```

`scan` is free (regex only). `process` is the expensive AI stage
(≈$0.30/file on Opus by default — see
[docs/models.md](docs/models.md) to pick a cheaper model). Run state
goes to `data/my-app/`, gitignored by default; schema in
[docs/data-layout.md](docs/data-layout.md).

To register another codebase in this same audits dir, run
`pnpm deepsec init-project ../another-service` and paste the same
prompt above (with the new id) into your agent.

(`scan`'s `--root` is resolved from `deepsec.config.ts` — pass
`--root <path>` to override for a one-off scan against a different
checkout.)

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

Both supported agent backends route through Vercel AI Gateway by
default — one token covers Claude **and** Codex, zero-data retention,
high fan-out quotas.

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
