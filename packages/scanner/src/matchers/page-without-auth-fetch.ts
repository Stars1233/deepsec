import type { CandidateMatch } from "@deepsec/core";
import type { MatcherPlugin } from "../types.js";

export const pageWithoutAuthFetchMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "page-without-auth-fetch",
  description:
    "Server Component pages fetching resources by URL params without verifying user access",
  filePatterns: ["**/app/**/page.{ts,tsx}"],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];

    // Must have dynamic params used in fetch
    const hasParamFetch =
      /params\.\w+/.test(content) && /fetch|fetchApi|getServerSession/.test(content);
    if (!hasParamFetch) return [];

    // Check if the page verifies access to the resource
    const hasAccessCheck =
      /auth|getSession|requireAuth|withAuthentication|checkAccess|verifyAccess|can\s*\(/.test(
        content,
      );

    const matches: CandidateMatch[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (
        /params\.\w+/.test(lines[i]) &&
        /fetch|Api|query/.test(lines.slice(i, Math.min(lines.length, i + 8)).join("\n"))
      ) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 4);
        matches.push({
          vulnSlug: "page-without-auth-fetch",
          lineNumbers: [i + 1],
          snippet: lines.slice(start, end).join("\n"),
          matchedPattern: hasAccessCheck
            ? "Page fetches by URL param with auth (verify scoping)"
            : "Page fetches by URL param WITHOUT access check — IDOR risk",
        });
        break;
      }
    }

    return matches;
  },
};
