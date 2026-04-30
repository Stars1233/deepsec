import type { Severity } from "@deepsec/core";
import { enrich } from "@deepsec/processor";
import { commitAndPushData } from "../data-commit.js";
import { BOLD, DIM, GREEN, RESET } from "../formatters.js";

export async function enrichCommand(opts: {
  projectId: string;
  filter?: string;
  force?: boolean;
  concurrency?: number;
  minSeverity?: string;
}) {
  const minSeverity = opts.minSeverity as Severity | undefined;
  console.log(
    `${BOLD}Enriching${RESET} files with git history for project ${BOLD}${opts.projectId}${RESET}`,
  );
  if (opts.filter) console.log(`  Filter: ${opts.filter}`);
  if (minSeverity) console.log(`  Min severity: ${minSeverity}`);
  if (opts.concurrency) console.log(`  Concurrency: ${opts.concurrency}`);
  console.log();

  const result = await enrich({
    projectId: opts.projectId,
    filter: opts.filter,
    force: opts.force,
    concurrency: opts.concurrency,
    minSeverity,
    onProgress(progress) {
      if (progress.type === "file") {
        console.log(`  ${DIM}[${progress.current}/${progress.total}]${RESET} ${progress.message}`);
      } else {
        console.log(`\n${GREEN}${progress.message}${RESET}`);
      }
    },
  });

  if (result.enriched === 0) {
    console.log("No files to enrich (no findings, or already enriched — use --force).");
  } else {
    commitAndPushData(`enrich: ${opts.projectId} (${result.enriched} files)`);
  }
}
