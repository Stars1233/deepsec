import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const responseHeaderLeakMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "response-header-leak",
  description: "Response headers exposing internal infrastructure details",
  filePatterns: ["**/*.{ts,tsx,js,jsx,lua,go,conf}"],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];

    return regexMatcher(
      "response-header-leak",
      [
        { regex: /x-powered-by/i, label: "X-Powered-By header" },
        { regex: /setHeader\s*\(\s*['"]server['"]/i, label: "Server header set" },
        { regex: /x-debug|x-internal|x-trace-id/i, label: "Debug/internal header" },
        { regex: /add_header.*server_version|add_header.*x-debug/i, label: "Nginx debug header" },
        { regex: /ngx\.header\[['"]x-debug/, label: "Lua debug response header" },
        {
          regex: /w\.Header\(\)\.Set\s*\(\s*"X-Debug|w\.Header\(\)\.Set\s*\(\s*"Server"/,
          label: "Go debug response header",
        },
      ],
      content,
    );
  },
};
