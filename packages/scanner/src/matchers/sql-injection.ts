import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const sqlInjectionMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "sql-injection",
  description: "Raw SQL string concatenation or interpolation",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, _filePath) {
    return regexMatcher(
      "sql-injection",
      [
        { regex: /`\s*SELECT\s+.*\$\{/, label: "template literal SELECT with interpolation" },
        { regex: /`\s*INSERT\s+.*\$\{/, label: "template literal INSERT with interpolation" },
        { regex: /`\s*UPDATE\s+.*\$\{/, label: "template literal UPDATE with interpolation" },
        { regex: /`\s*DELETE\s+.*\$\{/, label: "template literal DELETE with interpolation" },
        { regex: /['"]SELECT\s+.*['"]\s*\+/, label: "string concat SELECT" },
        { regex: /['"]INSERT\s+.*['"]\s*\+/, label: "string concat INSERT" },
        { regex: /['"]UPDATE\s+.*['"]\s*\+/, label: "string concat UPDATE" },
        { regex: /['"]DELETE\s+.*['"]\s*\+/, label: "string concat DELETE" },
        { regex: /query\s*\(\s*`[^`]*\$\{/, label: "query() with interpolation" },
        { regex: /\.raw\s*\(\s*`[^`]*\$\{/, label: ".raw() with interpolation" },
        { regex: /LIKE\s+['"]?%?\$\{/, label: "LIKE with interpolation" },
        { regex: /LIKE\s+['"]%\$\{/, label: "LIKE '%${...}%' pattern" },
        { regex: /RLIKE\s+['"]?\$\{/, label: "RLIKE with interpolation" },
        {
          regex: /executeQuery\w*\s*\(\s*`[^`]*\$\{/,
          label: "executeQuery with template interpolation",
        },
        { regex: /sql\.raw\s*\(/, label: "sql.raw() — raw SQL (verify parameterized)" },
        { regex: /sql`[^`]*\$\{.*\}/, label: "sql tagged template with interpolation" },
      ],
      content,
    );
  },
};
