import type { CandidateMatch } from "@deepsec/core";
import type { MatcherPlugin } from "../types.js";

/**
 * Detects read-then-delete/update sequences that aren't atomic.
 * TOCTOU race conditions: redis.get() followed by redis.del() without
 * a transaction, or similar patterns in any data store.
 */
export const nonAtomicReadDeleteMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "non-atomic-read-delete",
  description: "Non-atomic read-then-delete/update — TOCTOU race conditions",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, filePath) {
    if (/\.(test|spec|mock|stub)\./i.test(filePath)) return [];
    if (/node_modules|\.next|dist\//.test(filePath)) return [];

    const matches: CandidateMatch[] = [];
    const lines = content.split("\n");

    // Look for get-then-delete/set patterns within a window
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Redis get followed by del/set within 10 lines
      if (/redis\.(get|hget|hgetall)\s*\(/.test(line)) {
        const window = lines.slice(i, Math.min(lines.length, i + 10)).join("\n");
        if (/redis\.(del|hdel|set|hset|expire)\s*\(/.test(window)) {
          // Check it's not inside a transaction/pipeline
          const txWindow = lines
            .slice(Math.max(0, i - 5), Math.min(lines.length, i + 15))
            .join("\n");
          if (!/\.multi\s*\(|\.pipeline\s*\(|\.transaction\s*\(|WATCH/.test(txWindow)) {
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length, i + 5);
            matches.push({
              vulnSlug: "non-atomic-read-delete",
              lineNumbers: [i + 1],
              snippet: lines.slice(start, end).join("\n"),
              matchedPattern: "Redis get-then-delete/set without transaction — TOCTOU race",
            });
          }
        }
      }

      // SQL SELECT followed by DELETE/UPDATE on same table
      if (/\b(SELECT|findFirst|findUnique|findOne)\b/i.test(line)) {
        const window = lines.slice(i, Math.min(lines.length, i + 15)).join("\n");
        if (/\b(DELETE|UPDATE|destroy|remove|deleteMany)\b/i.test(window)) {
          const txWindow = lines
            .slice(Math.max(0, i - 5), Math.min(lines.length, i + 20))
            .join("\n");
          if (!/\$transaction\s*\(|BEGIN|SERIALIZABLE|\.transaction\s*\(/.test(txWindow)) {
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length, i + 5);
            matches.push({
              vulnSlug: "non-atomic-read-delete",
              lineNumbers: [i + 1],
              snippet: lines.slice(start, end).join("\n"),
              matchedPattern: "Read-then-modify without transaction — potential TOCTOU race",
            });
          }
        }
      }
    }

    return matches;
  },
};
