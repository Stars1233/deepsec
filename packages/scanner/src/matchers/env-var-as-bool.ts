import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const envVarAsBoolMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "env-var-as-bool",
  description: "Security env vars checked with truthy/falsy — 'false' string is truthy in JS",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];

    return regexMatcher(
      "env-var-as-bool",
      [
        {
          regex: /if\s*\(\s*!?\s*process\.env\.\w*(DISABLE|SKIP|BYPASS|NO_).*AUTH/i,
          label: "Security disable flag checked as truthy",
        },
        {
          regex:
            /if\s*\(\s*!?\s*process\.env\.\w*(DISABLE|SKIP|BYPASS|NO_).*(VERIFY|CHECK|VALIDATE)/i,
          label: "Verification disable flag checked as truthy",
        },
        {
          regex: /if\s*\(\s*process\.env\.\w*(ENABLE|REQUIRE).*AUTH.*\)/i,
          label: "Auth enable flag — falsy when unset",
        },
        {
          regex: /process\.env\.\w*(SECRET|TOKEN|KEY)\w*\s*[^!=?|&]/,
          label: "Secret env var used as boolean",
        },
      ],
      content,
    );
  },
};
