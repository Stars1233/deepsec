import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: ".env.local" });
dotenvConfig(); // also load .env as fallback

import { getRegistry } from "@deepsec/core";
import { Command } from "commander";
import { enrichCommand } from "./commands/enrich.js";
import { exportCommand } from "./commands/export.js";
import { initCommand } from "./commands/init.js";
import { initProjectCommand } from "./commands/init-project.js";
import { metricsCommand } from "./commands/metrics.js";
import { processCommand } from "./commands/process.js";
import { reportCommand } from "./commands/report.js";
import { revalidateCommand } from "./commands/revalidate.js";
import { sandboxAllCommand } from "./commands/sandbox-all.js";
import { sandboxCommand } from "./commands/sandbox-process.js";
import { scanCommand } from "./commands/scan.js";
import { statusCommand } from "./commands/status.js";
import { triageCommand } from "./commands/triage.js";
import { loadConfig } from "./load-config.js";

const program = new Command();

program
  .name("deepsec")
  .description("AI-powered vulnerability scanner for any codebase")
  .version("0.1.0");

program
  .command("init <workspace> <target-root>")
  .description("Bootstrap a scanning workspace seeded with one project + agent setup prompt")
  .option("--id <project-id>", "Override the project id (default: basename of <target-root>)")
  .option("--force", "Write into a non-empty workspace directory")
  .action(
    (
      workspace: string | undefined,
      targetRoot: string | undefined,
      opts: { id?: string; force?: boolean },
    ) =>
      initCommand({
        workspace,
        targetRoot,
        id: opts.id,
        force: opts.force,
      }),
  );

program
  .command("init-project <target-root>")
  .description("Register an additional project in the current workspace")
  .option("--id <project-id>", "Override the project id (default: basename of <target-root>)")
  .option("--force", "Overwrite an existing project of the same id")
  .action((targetRoot: string | undefined, opts: { id?: string; force?: boolean }) =>
    initProjectCommand({ targetRoot, id: opts.id, force: opts.force }),
  );

program
  .command("scan")
  .description("Scan a codebase for candidate vulnerability sites")
  .requiredOption("--project-id <id>", "Project identifier")
  .option(
    "--root <path>",
    "Root path to scan (overrides config / project.json; required for first-time scans)",
  )
  .option("--matchers <slugs>", "Comma-separated list of matcher slugs to use")
  .action(scanCommand);

program
  .command("process")
  .description("Investigate candidates with an AI agent")
  .requiredOption("--project-id <id>", "Project identifier")
  .option("--run-id <id>", "Resume a specific processing run")
  .option("--agent <type>", "Agent plugin type (claude-agent-sdk, codex)", "claude-agent-sdk")
  .option(
    "--model <model>",
    "Model to use (default: claude-opus-4-7 for claude-agent-sdk, gpt-5.5 for codex)",
  )
  .option("--max-turns <n>", "Max conversation turns per batch (default: 150)", parseInt)
  .option(
    "--reinvestigate [n]",
    "Re-investigate files. No arg = all files. Pass N as a wave marker — productive analyses are tagged with N, and re-running with the same N skips already-done files. Bump N to request another pass.",
  )
  .option("--limit <n>", "Max number of files to process", parseInt)
  .option("--concurrency <n>", "Batches to process in parallel (default: cores - 1)", parseInt)
  .option("--filter <prefix>", "Only process files matching this path prefix")
  .option("--batch-size <n>", "Files per batch (default: 5)", parseInt)
  .option("--root <path>", "Override rootPath from project.json (for sandbox execution)")
  .option(
    "--manifest <path>",
    "JSON file with array of file paths to process (instead of all pending)",
  )
  .option("--only-slugs <csv>", "Only process files that have a candidate with one of these slugs")
  .option("--skip-slugs <csv>", "Skip files whose candidate slugs are all in this set")
  .action(processCommand);

program
  .command("report")
  .description("Generate a markdown + JSON report from current analysis state.")
  .requiredOption("--project-id <id>", "Project identifier")
  .option("--run-id <id>", "Filter to a specific run's results")
  .action(reportCommand);

program
  .command("revalidate")
  .description("Re-check existing findings for false positives")
  .requiredOption("--project-id <id>", "Project identifier")
  .option("--run-id <id>", "Resume a specific revalidation run")
  .option("--agent <type>", "Agent plugin type (claude-agent-sdk, codex)", "claude-agent-sdk")
  .option(
    "--model <model>",
    "Model to use (default: claude-opus-4-7 for claude-agent-sdk, gpt-5.5 for codex)",
  )
  .option("--max-turns <n>", "Max conversation turns per batch (default: 150)", parseInt)
  .option(
    "--min-severity <sev>",
    "Only revalidate findings at this severity or above (CRITICAL, HIGH, MEDIUM, HIGH_BUG, BUG)",
  )
  .option("--force", "Re-check already-validated findings")
  .option("--limit <n>", "Max files to revalidate", parseInt)
  .option("--concurrency <n>", "Parallel batches (default: cores - 1)", parseInt)
  .option("--batch-size <n>", "Files per revalidation batch (default: 5)", parseInt)
  .option("--filter <prefix>", "Only revalidate files matching path prefix")
  .option("--root <path>", "Override rootPath from project.json (for sandbox execution)")
  .option("--manifest <path>", "JSON file with array of file paths to revalidate")
  .option("--only-slugs <csv>", "Only revalidate findings with one of these vulnSlugs")
  .option("--skip-slugs <csv>", "Skip findings with any of these vulnSlugs")
  .action(revalidateCommand);

program
  .command("enrich")
  .description("Enrich files with git history + ownership oracle")
  .requiredOption("--project-id <id>", "Project identifier")
  .option("--filter <prefix>", "Only enrich files matching path prefix")
  .option(
    "--min-severity <sev>",
    "Only enrich files with a finding at this severity or above (CRITICAL, HIGH, MEDIUM, HIGH_BUG, BUG, LOW)",
  )
  .option("--force", "Re-enrich already-enriched files")
  .option("--concurrency <n>", "Parallel ownership oracle requests (default: cores - 1)", parseInt)
  .action(enrichCommand);

program
  .command("triage")
  .description("Classify findings by priority (P0/P1/P2/skip) — lightweight, no code reading")
  .requiredOption("--project-id <id>", "Project identifier")
  .option("--severity <sev>", "Severity to triage (default: MEDIUM)", "MEDIUM")
  .option("--model <model>", "Model to use (default: claude-sonnet-4-6 — cheaper)")
  .option("--force", "Re-triage already-triaged findings")
  .option("--limit <n>", "Max findings to triage", parseInt)
  .option("--concurrency <n>", "Parallel triage batches (default: cores - 1)", parseInt)
  .action(triageCommand);

program
  .command("status")
  .description("Show current state of the project mirror")
  .requiredOption("--project-id <id>", "Project identifier")
  .action(statusCommand);

program
  .command("export")
  .description("Export findings as JSON or as a directory of per-finding markdown files")
  .option("--format <kind>", "Output format: json (default) or md-dir", "json")
  .option("--project-id <csv>", "Comma-separated project IDs (omit for all)")
  .option(
    "--min-severity <sev>",
    "Only export findings at this severity or above (CRITICAL, HIGH, MEDIUM, HIGH_BUG, BUG, LOW)",
  )
  .option(
    "--only-severity <sev>",
    "Only export findings at this exact severity (CRITICAL, HIGH, MEDIUM, HIGH_BUG, BUG, LOW)",
  )
  .option("--discovered-today", "Only findings whose most recent analysis was today (local time)")
  .option(
    "--since <iso>",
    "Only findings whose most recent analysis was on/after this ISO timestamp",
  )
  .option("--only-true-positive", "Only findings revalidated as true-positive")
  .option("--exclude-false-positive", "Drop findings revalidated as false-positive")
  .option("--only-slugs <csv>", "Only export findings with these vulnSlugs")
  .option("--skip-slugs <csv>", "Drop findings with these vulnSlugs")
  .option("--require-owner", "Drop findings that have no ownership data (no assignee, no teams)")
  .option(
    "--only-agent <type>",
    "Only export findings produced by this agent backend (e.g. codex, claude-agent-sdk)",
  )
  .option(
    "--only-marker <n>",
    "Only export findings produced under this --reinvestigate wave marker",
  )
  .option(
    "--out <path>",
    "Output path. JSON format: file (default: stdout). md-dir format: directory (required).",
  )
  .action(exportCommand);

program
  .command("metrics")
  .description("Report findings metrics across all projects (or one project)")
  .option("--project-id <id>", "Project identifier (omit for all projects)")
  .option("--min-severity <sev>", "Minimum severity to include (default: LOW)")
  .action(metricsCommand);

const sandboxCmd = program
  .command("sandbox <command>")
  .description(
    "Run a deepsec command on Vercel Sandbox microVMs. Sandbox-level options (--sandboxes, --vcpus, --detach, etc.) are parsed; all other options are passed through to the subcommand.",
  )
  .allowUnknownOption()
  .allowExcessArguments(true)
  .requiredOption("--project-id <id>", "Project identifier")
  .option("--sandboxes <n>", "Number of parallel sandboxes (default: 1)", parseInt)
  .option("--vcpus <n>", "vCPUs per sandbox (default: 2, max: 8)", parseInt)
  .option("--detach", "Launch sandboxes and exit immediately (collect results later)")
  .option("--run-id <id>", "Run ID for status/collect commands")
  .option("--snapshot-id <id>", "Restore from existing snapshot")
  .option("--save-snapshot", "Snapshot after setup for future reuse")
  .option("--keep-alive", "Don't stop sandboxes after completion")
  .option("--timeout <ms>", "Sandbox timeout in ms (default: 5 hours)", parseInt)
  .action((subcommand: string, opts: Record<string, unknown>) => {
    // Commander puts unknown options into .args on the Command object
    const unknownArgs = sandboxCmd.args.slice(1); // skip the subcommand itself
    return sandboxCommand(subcommand, { ...opts, args: unknownArgs } as Parameters<
      typeof sandboxCommand
    >[1]);
  });

const sandboxAllCmd = program
  .command("sandbox-all <command>")
  .description(
    "Run a deepsec command across ALL projects on Vercel Sandbox microVMs, allocating sandboxes proportionally",
  )
  .allowUnknownOption()
  .allowExcessArguments(true)
  .option("--sandboxes <n>", "Total sandboxes to distribute (default: 10)", parseInt)
  .option("--vcpus <n>", "vCPUs per sandbox (default: auto from concurrency, max: 8)", parseInt)
  .option("--timeout <ms>", "Sandbox timeout in ms (default: 5 hours)", parseInt)
  .action((subcommand: string, opts: Record<string, unknown>) => {
    const unknownArgs = sandboxAllCmd.args.slice(1);
    return sandboxAllCommand(subcommand, { ...opts, args: unknownArgs } as Parameters<
      typeof sandboxAllCommand
    >[1]);
  });

process.on("unhandledRejection", (err) => {
  console.error("\nFatal error:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("\nFatal error:", err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});

async function main() {
  await loadConfig();
  // Plugins may register their own subcommands.
  for (const register of getRegistry().commands) {
    register(program);
  }
  await program.parseAsync();
}

main();
