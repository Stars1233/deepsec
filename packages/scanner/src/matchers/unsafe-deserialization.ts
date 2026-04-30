import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const unsafeDeserializationMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "unsafe-deserialization",
  description: "JSON.parse on user input without schema validation, or unsafe eval of parsed data",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];

    return regexMatcher(
      "unsafe-deserialization",
      [
        {
          regex: /JSON\.parse\s*\(\s*(req\.|request\.|body\.|params\.|query\.)/,
          label: "JSON.parse of request input (verify schema validation)",
        },
        {
          regex: /JSON\.parse\s*\(\s*await\s+(req|request)\.text\(\)/,
          label: "JSON.parse of raw request text",
        },
        { regex: /eval\s*\(\s*JSON\.parse/, label: "eval of parsed JSON" },
        { regex: /new\s+Function\s*\(\s*JSON\.parse/, label: "new Function from parsed JSON" },
        {
          regex: /yaml\.load\s*\(|safeLoad\s*\(/,
          label: "YAML deserialization (verify safe mode)",
        },
      ],
      content,
    );
  },
};
