import type { CandidateMatch } from "@deepsec/core";
import type { MatcherPlugin } from "../types.js";

/**
 * Detects sensitive data being sent to observability/tracing systems.
 * PII, secrets, tokens, request bodies in Datadog, Sentry, OpenTelemetry, etc.
 */
export const sensitiveDataInTracesMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "sensitive-data-in-traces",
  description: "Sensitive data sent to tracing/observability — check for PII, secrets, tokens",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, filePath) {
    if (/\.(test|spec|mock|stub)\./i.test(filePath)) return [];
    if (/node_modules|\.next|dist\//.test(filePath)) return [];

    const matches: CandidateMatch[] = [];
    const lines = content.split("\n");

    const tracePatterns: { regex: RegExp; label: string }[] = [
      // Datadog
      { regex: /addTagsToCurrentSpan\s*\(/, label: "Datadog span tags" },
      { regex: /tracer\.trace\s*\(/, label: "Datadog tracer" },
      { regex: /span\.setTag\s*\(/, label: "Datadog span tag" },
      // Sentry
      { regex: /Sentry\.captureException\s*\(/, label: "Sentry exception capture" },
      { regex: /Sentry\.setContext\s*\(/, label: "Sentry context" },
      { regex: /Sentry\.setExtra\s*\(/, label: "Sentry extra data" },
      // OpenTelemetry
      { regex: /span\.setAttribute\s*\(/, label: "OTel span attribute" },
      { regex: /span\.addEvent\s*\(/, label: "OTel span event" },
    ];

    // Check if the file handles sensitive data
    const hasSensitiveContext =
      /password|secret|token|apiKey|api_key|credential|private.?key|client.?secret|access.?token/i.test(
        content,
      ) ||
      /payment|billing|invoice|stripe|credit.?card/i.test(content) ||
      /req\.body|request\.body|rawReqData|requestPayload/i.test(content);

    if (!hasSensitiveContext) return [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { regex, label } of tracePatterns) {
        if (regex.test(line)) {
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          matches.push({
            vulnSlug: "sensitive-data-in-traces",
            lineNumbers: [i + 1],
            snippet: lines.slice(start, end).join("\n"),
            matchedPattern: `${label} in file with sensitive data — check what's being traced`,
          });
          break;
        }
      }
    }

    return matches;
  },
};
