import type { CandidateMatch } from "@deepsec/core";
import type { MatcherPlugin } from "../types.js";

/**
 * Detects conditionals that check for test/debug/internal headers
 * and skip security checks. These can be abused in production.
 */
export const testHeaderBypassMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "test-header-bypass",
  description: "Test/debug headers that bypass security checks in production",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, filePath) {
    if (/\.(test|spec|mock|stub)\./i.test(filePath)) return [];
    if (/node_modules|\.next|dist\//.test(filePath)) return [];

    const matches: CandidateMatch[] = [];
    const lines = content.split("\n");

    const headerPatterns: { regex: RegExp; label: string }[] = [
      { regex: /x-automated-test/i, label: "x-automated-test header" },
      { regex: /x-test-/i, label: "x-test-* header" },
      { regex: /x-debug/i, label: "x-debug header" },
      { regex: /x-internal/i, label: "x-internal header" },
      { regex: /x-bypass/i, label: "x-bypass header" },
      { regex: /x-skip-auth/i, label: "x-skip-auth header" },
      { regex: /x-no-rate-limit/i, label: "x-no-rate-limit header" },
      { regex: /x-admin/i, label: "x-admin header" },
      { regex: /['"]test['"].*===.*headers/i, label: "test value in header check" },
      { regex: /headers.*['"]test['"]/i, label: "header compared to test" },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { regex, label } of headerPatterns) {
        if (regex.test(line)) {
          // Check if it's in a conditional that skips something
          const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 3)).join("\n");
          if (/if\s*\(|skip|bypass|disable|return\s+(true|next)|continue/.test(context)) {
            const start = Math.max(0, i - 2);
            const end = Math.min(lines.length, i + 3);
            matches.push({
              vulnSlug: "test-header-bypass",
              lineNumbers: [i + 1],
              snippet: lines.slice(start, end).join("\n"),
              matchedPattern: `${label} — may bypass security in production`,
            });
            break;
          }
        }
      }
    }

    return matches;
  },
};
