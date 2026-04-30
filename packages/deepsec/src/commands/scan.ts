import { scan } from "@deepsec/scanner";
import { BOLD, DIM, GREEN, RESET } from "../formatters.js";

export async function scanCommand(opts: { projectId: string; root: string; matchers?: string }) {
  const matcherSlugs = opts.matchers ? opts.matchers.split(",").map((s) => s.trim()) : undefined;

  console.log(`${BOLD}Scanning${RESET} ${opts.root} for project ${BOLD}${opts.projectId}${RESET}`);
  if (matcherSlugs) {
    console.log(`${DIM}Matchers: ${matcherSlugs.join(", ")}${RESET}`);
  }
  console.log();

  const result = await scan({
    projectId: opts.projectId,
    root: opts.root,
    matcherSlugs,
    onProgress(progress) {
      switch (progress.type) {
        case "matcher_started":
          console.log(`${DIM}  Running: ${progress.matcherSlug}${RESET}`);
          break;
        case "matcher_done":
          console.log(`  ${progress.matcherSlug}: ${progress.matchCount} match(es)`);
          break;
        case "file_scanned":
          break;
      }
    },
  });

  console.log();
  console.log(
    `${GREEN}Scan complete.${RESET} Run: ${BOLD}${result.runId}${RESET}  Candidates: ${result.candidateCount}`,
  );
  console.log();
  console.log(`Next: ${DIM}pnpm deepsec process --project-id ${opts.projectId}${RESET}`);
}
