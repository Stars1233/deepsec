import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const cacheKeyPoisoningMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "cache-key-poisoning",
  description: "Cache key construction with attacker-controlled values — poisoning risk",
  filePatterns: ["**/*.{lua,go,ts,js}"],
  match(content, filePath) {
    if (/_test\.|_spec\.|\.test\.|\.spec\./.test(filePath)) return [];

    return regexMatcher(
      "cache-key-poisoning",
      [
        { regex: /cache.*key.*host|cache_key.*host/i, label: "Cache key includes Host header" },
        {
          regex: /cache.*key.*header|cache_key.*header/i,
          label: "Cache key includes request header",
        },
        { regex: /cache.*key.*query|cache_key.*query/i, label: "Cache key includes query params" },
        {
          regex: /vary.*:.*accept|vary.*:.*cookie/i,
          label: "Vary header includes client-controlled values",
        },
        {
          regex: /ngx\.shared\.\w+:set\s*\(.*ngx\.var\.host/,
          label: "Shared dict keyed by Host header",
        },
        {
          regex: /ngx\.shared\.\w+:set\s*\(.*ngx\.var\.request_uri/,
          label: "Shared dict keyed by request URI",
        },
        {
          regex: /redis\.\w*set\s*\(.*req\.|redis\.\w*set\s*\(.*host/i,
          label: "Redis set with request-derived key",
        },
        {
          regex: /\.set\s*\(.*cache.*req\.|\.set\s*\(.*cache.*host/i,
          label: "Cache set with request-derived data",
        },
      ],
      content,
    );
  },
};
