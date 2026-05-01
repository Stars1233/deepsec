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

deepsec is polyglot (TS, Go, Python, Lua, Terraform, …). Run it from a
**dedicated audits workspace** next to the codebases you're scanning,
not as a dev-dep inside any of them. One workspace can scan many
repos — each is a `projects[]` entry in `deepsec.config.ts`.

```
parent/
├── security-audits/   ← scanning workspace (created by init)
├── my-app/            ← target codebase
└── another-service/   ← another target codebase
```

From inside your first target codebase, step out and scaffold a
workspace seeded with that codebase:

```bash
cd ..                                              # out of my-app/
npx deepsec init security-audits ./my-app          # workspace + first project
cd security-audits
pnpm install                                       # installs deepsec
```

The scaffold is minimal: `package.json`, `deepsec.config.ts` (one
project entry pointing at `./my-app`), an `INFO.md` template, an
`AGENTS.md` with a setup prompt for your coding agent, plus
`.env.local` and `.gitignore`. No custom matchers by default — add
those later when a real finding shapes one for you.

Two things to do before scanning:

- **`.env.local`** — paste an AI Gateway token (see
  [docs/vercel-setup.md](docs/vercel-setup.md) for how to get one).
- **`AGENTS.md`** — open the workspace in your coding agent (Claude
  Code, Cursor, Codex, …) and let it follow the prompt. It reads the
  bundled deepsec skill (`node_modules/deepsec/SKILL.md`), opens your
  codebase, and fills in `INFO.md` with the auth shape and threat
  model. INFO.md is injected into every AI batch and meaningfully
  improves accuracy.

Then scan:

```bash
pnpm deepsec scan        --project-id my-app
pnpm deepsec process     --project-id my-app --concurrency 5
pnpm deepsec revalidate  --project-id my-app --concurrency 5     # optional, cuts FP rate
pnpm deepsec export      --project-id my-app --format md-dir --out ./findings
```

(The `--root` for `scan` is resolved from `deepsec.config.ts` —
override with `--root <path>` for one-off scans against a different
checkout.) To register another codebase later, run
`pnpm deepsec init-project <root>`.

To scan a second repo from the same workspace, append a new entry to
`projects[]` in `deepsec.config.ts`.

`scan` is free (regex only). `process` is the expensive AI stage
(≈$0.30/file on Opus by default — see
[docs/models.md](docs/models.md) to pick a cheaper model). Run state
goes to `./data/<project-id>/`, gitignored by default; schema in
[docs/data-layout.md](docs/data-layout.md).

Want your coding agent (Claude Code, Codex, Cursor, …) to fill in the
config and `INFO.md` from your repo's README? See the prompt in
[docs/getting-started.md](docs/getting-started.md).

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
