import type { CandidateMatch } from "@deepsec/core";
import type { MatcherPlugin } from "../types.js";

export const luaRegexBypassMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "lua-regex-bypass",
  description: "Lua regex patterns validating URLs/hosts — potential bypass via greedy wildcards",
  filePatterns: ["**/*.lua"],
  match(content, filePath) {
    if (/_test\.lua$|_spec\.lua$/.test(filePath)) return [];

    const matches: CandidateMatch[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // ngx.re.match or string.match/find with URL-like patterns
      const hasUrlRegex =
        (/ngx\.re\.match\s*\(/.test(line) && /https?|host|domain|\.com|\.sh/.test(line)) ||
        (/string\.(match|find)\s*\(/.test(line) && /https?|host|domain/.test(line));

      // Check for greedy wildcards that could allow bypass
      const hasGreedy = /\.\+|\.\*|%.+/.test(line);

      if (hasUrlRegex || (hasGreedy && /url|host|domain|redirect/i.test(line))) {
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        matches.push({
          vulnSlug: "lua-regex-bypass",
          lineNumbers: [i + 1],
          snippet: lines.slice(start, end).join("\n"),
          matchedPattern: hasUrlRegex
            ? "URL/host validation regex (verify not bypassable)"
            : "Greedy pattern in URL/host context",
        });
      }
    }

    return matches;
  },
};
