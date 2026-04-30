import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const secretInFallbackMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "secret-in-fallback",
  description:
    "Environment variable secrets with hardcoded fallback values — bypass when env unset",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];

    return regexMatcher(
      "secret-in-fallback",
      [
        {
          regex:
            /process\.env\.\w*(SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|AUTH)\w*\s*\?\?\s*['"][^'"]*['"]/,
          label: "Secret env var with ?? fallback",
        },
        {
          regex:
            /process\.env\.\w*(SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|AUTH)\w*\s*\|\|\s*['"][^'"]*['"]/,
          label: "Secret env var with || fallback",
        },
        {
          regex: /os\.getenv\s*\(\s*["']\w*(SECRET|TOKEN|KEY|PASSWORD).*\)\s*or\s+["']/,
          label: "Lua env var with 'or' fallback",
        },
      ],
      content,
    );
  },
};
