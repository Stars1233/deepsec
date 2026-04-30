import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const luaStringConcatUrlMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "lua-string-concat-url",
  description: "Lua URL construction via string concatenation — SSRF risk",
  filePatterns: ["**/*.lua"],
  match(content, filePath) {
    if (/_test\.lua$|_spec\.lua$/.test(filePath)) return [];

    return regexMatcher(
      "lua-string-concat-url",
      [
        { regex: /["']https?:\/\/.*\.\./, label: "URL string concatenated with .." },
        { regex: /\.\..*["']https?:\/\//, label: "String concatenated into URL" },
        {
          regex: /ngx\.location\.capture\s*\(.*\.\./,
          label: "ngx.location.capture with concatenation",
        },
        { regex: /request_uri\s*=.*\.\./, label: "request_uri built via concatenation" },
      ],
      content,
    );
  },
};
