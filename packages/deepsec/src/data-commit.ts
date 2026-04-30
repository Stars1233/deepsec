import { execSync } from "node:child_process";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const DATA_BRANCH = process.env.DEEPSEC_DATA_BRANCH ?? "main";

/**
 * Commit any changes in the data repo and push to origin.
 * Used after local operations that modify file records.
 */
export function commitAndPushData(message: string): boolean {
  // Large data dirs (10k+ pending records) can blow past the default 1 MB
  // execSync buffer with a single `git status --porcelain` call.
  const MAX_BUFFER = 256 * 1024 * 1024;

  const status = execSync("git status --porcelain", {
    cwd: DATA_DIR,
    encoding: "utf-8",
    timeout: 10000,
    maxBuffer: MAX_BUFFER,
  }).trim();

  if (!status) return false;

  execSync("git add -A", {
    cwd: DATA_DIR,
    encoding: "utf-8",
    timeout: 60000,
    maxBuffer: MAX_BUFFER,
  });
  execSync(`git commit -m ${JSON.stringify(message)}`, {
    cwd: DATA_DIR,
    encoding: "utf-8",
    timeout: 60000,
    maxBuffer: MAX_BUFFER,
  });

  let retries = 3;
  while (retries > 0) {
    try {
      execSync(`git pull --rebase origin ${DATA_BRANCH}`, {
        cwd: DATA_DIR,
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: MAX_BUFFER,
      });
      execSync(`git push origin HEAD:${DATA_BRANCH}`, {
        cwd: DATA_DIR,
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: MAX_BUFFER,
      });
      return true;
    } catch {
      retries--;
      if (retries === 0) {
        console.error(
          `Failed to push data repo after 3 retries. Push manually: cd data && git push origin HEAD:${DATA_BRANCH}`,
        );
        return false;
      }
    }
  }
  return false;
}
