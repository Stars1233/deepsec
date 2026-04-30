# FAQ

## How should I install deepsec?

Make one **dedicated audits workspace** next to your codebases and
scaffold it with `npx deepsec init`. One workspace covers many
target repos via `projects[]` in `deepsec.config.ts`:

```bash
cd ~/wherever-your-repos-live
npx deepsec init security-audits
cd security-audits
pnpm install
```

Your `deepsec.config.ts`, `INFO.md` files, plugins, and `data/` for every
project all live in this one workspace. Works for any target language;
the workspace is its own version-controllable thing.

**Don't** `pnpm add deepsec` *inside* the codebase you're scanning
— it pulls in `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`,
and `@vercel/sandbox`, heavy SDKs that don't belong in your
application's lockfile, and forces a JS/TS install in repos that
may not have one.

The polyglot reality is the reason: deepsec scans Go, Python, Lua,
Terraform, and more. The target repos don't need `node_modules` —
the *audits workspace* does, and that's a separate, small directory
you create just for this.

## How much does it cost?

The expensive stage is `process`. With Claude Opus and default settings
(`--concurrency 5 --batch-size 5`):

| Files | Approx cost | Approx wall time |
|---|---|---|
| 100 | $25–60 | 5–15 min |
| 500 | $130–300 | 25–60 min |
| 2,000 | $500–1200 | 1.5–4 hr |

Costs swing 2–3x based on file complexity. Run `--limit 50` first to
calibrate before committing to a full pass.

`triage` is ~1¢/finding. `revalidate` is comparable to `process`.

## Should I use Claude or Codex?

Both work. Different strengths:

- **Claude (Opus):** strong at reasoning about authorization shapes and
  cross-file flows. The default. Most expensive.
- **Codex (gpt-5.5):** runs in a strict sandbox (read-only, no network).
  Fast at grep-heavy investigations. Cheaper.

Mix them. Run Claude first, then re-process unconvincing findings with
`--agent codex --reinvestigate` for a second opinion. Findings dedupe
across agents.

## Should I use Vercel AI Gateway or Anthropic directly?

Either works. The gateway gives you provider failover, observability,
and zero data retention. One token covers Claude and Codex. For a quick
evaluation, use Anthropic directly. For ongoing production scanning, use
the gateway.

```bash
# Direct Anthropic
ANTHROPIC_AUTH_TOKEN=sk-ant-...
ANTHROPIC_BASE_URL=https://api.anthropic.com

# AI Gateway (recommended)
ANTHROPIC_AUTH_TOKEN=vck_...
ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh
```

See [vercel-setup.md](vercel-setup.md) for how to get a gateway key
and how to wire up Vercel Sandbox auth (OIDC or access token).

## How accurate is it? What's the FP rate?

Without revalidation: ~30–50% FP rate on `MEDIUM`, ~10–20% on `HIGH+`.
After revalidation: ~2–5% on `HIGH+`, with 95%+ TP rates on `CRITICAL`
in our internal use.

Two things help most:

1. **Revalidate `HIGH+` before acting on findings.** Worth the cost.
2. **Write a good `INFO.md` per project.** Even a paragraph describing
   the auth shape and threat model improves precision a lot. See
   [getting-started.md](getting-started.md).

## When should I use sandbox mode?

`deepsec sandbox process` fans work across [Vercel Sandbox][sb] microVMs
in parallel. Worth it when:

- The repo is large enough that local concurrency saturates your laptop.
- You want results in under an hour on a 5k+ file repo.
- You're running this as a scheduled job in CI/CD.

Otherwise local execution is simpler. The sandbox path needs the
`@vercel/sandbox` SDK (already a dep) and a Vercel account.

[sb]: https://vercel.com/docs/sandbox

## What happens to my code? Is it sent anywhere?

The AI agents read source code from your local repo and send relevant
snippets to the configured LLM provider as part of investigation
prompts. With Vercel AI Gateway, the gateway has zero data retention;
prompts aren't stored. With direct Anthropic, see Anthropic's data
retention policy.

deepsec itself doesn't phone home or report telemetry. The `data/<id>/`
directory stays on your machine unless you explicitly export it.

## Can I run this in CI?

Yes. The natural shape:

```bash
# Cron — full scan every Sunday
pnpm deepsec scan --project-id main --root .
pnpm deepsec process --project-id main --concurrency 5
pnpm deepsec revalidate --project-id main --min-severity HIGH
pnpm deepsec export --project-id main --format json --out findings.json

# Per-PR — incremental scan on changed files only
pnpm deepsec scan --project-id main --root .
pnpm deepsec process --project-id main --filter $CHANGED_PATH_PREFIX
```

The `data/` directory is your state — persist it between CI runs (cache
it as a build artifact) or just re-scan from scratch each time.

## Is it incremental?

Yes:

- `scan` merges new candidates into existing FileRecords; doesn't
  re-investigate already-analyzed files.
- `process` only touches files with `status: "pending"`, unless you
  pass `--reinvestigate` (re-investigate everything) or
  `--reinvestigate <N>` (re-investigate, tagged with wave marker N — a
  later run with the same N skips files already processed in this wave).
- `revalidate` only touches findings without a `revalidation` field
  unless `--force` is set.

## How do I add a matcher for my codebase?

See [docs/writing-matchers.md](writing-matchers.md). Short version: hand
a confirmed finding to your coding agent with the prompt in that doc and
it'll write the matcher.

## What if my codebase is in a language deepsec doesn't have matchers for?

The AI processor is language-agnostic and will investigate any
text-readable source file. The thinner the regex layer, the more the
process stage carries. A few starter matchers for the new language are
worth writing; they front-load file selection so the AI gets the most
promising sites first.

## How does it compare to Semgrep / CodeQL / OpenGrep?

deepsec is regex-then-AI: cheap wide net, AI for disambiguation. Semgrep
and CodeQL are AST/dataflow-then-rules: structural matching, no AI.

They're complementary. The AI catches shapes that are hard to express
structurally (auth bypass via business logic, OAuth state misuse, ICS
injection). Semgrep catches shapes that need precise structural matching
(taint flows, type-aware patterns).

deepsec catches what Semgrep misses, and vice versa. The highest
signal-per-dollar comes from running deepsec on top of an existing
Semgrep ruleset.

## What if I find a vulnerability in deepsec itself?

See [SECURITY.md](../SECURITY.md). Don't open a public issue — use
GitHub Security Advisories instead.
