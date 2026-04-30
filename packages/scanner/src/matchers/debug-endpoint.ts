import type { CandidateMatch } from "@deepsec/core";
import type { MatcherPlugin } from "../types.js";

export const debugEndpointMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "debug-endpoint",
  description: "Dev/debug/test endpoints that might be reachable in production",
  filePatterns: [
    "**/api/debug/**/*.{ts,tsx}",
    "**/api/test/**/*.{ts,tsx}",
    "**/api/dev/**/*.{ts,tsx}",
    "**/api/**/debug*/*.{ts,tsx}",
    "**/api/**/*.{ts,tsx,js}",
    "**/app/api/**/*.{ts,tsx}",
  ],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];

    const isDebugPath = /\/debug|\/test\/|\/dev\/|\/internal\/|\/admin\//.test(filePath);
    const hasDebugCode = /debug.*endpoint|test.*endpoint|dev.*only|development.*only/.test(content);
    const hasDebugHeaders = /x-debug|x-test-|x-internal/.test(content);
    const hasEnvGate =
      /process\.env\.NODE_ENV\s*[!=]==?\s*['"]production['"]|process\.env\.NODE_ENV\s*[!=]==?\s*['"]development['"]/.test(
        content,
      );

    if (!isDebugPath && !hasDebugCode && !hasDebugHeaders) return [];

    const matches: CandidateMatch[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (
        /export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE)|export\s+(const\s+)?(GET|POST|PUT|DELETE)\s*=/.test(
          lines[i],
        )
      ) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 3);
        matches.push({
          vulnSlug: "debug-endpoint",
          lineNumbers: [i + 1],
          snippet: lines.slice(start, end).join("\n"),
          matchedPattern: hasEnvGate
            ? `Debug/test endpoint with env gate (verify ${isDebugPath ? "path" : "code"} not reachable in prod)`
            : `Debug/test endpoint WITHOUT env gate — may be reachable in production`,
        });
        break;
      }
    }

    return matches;
  },
};
