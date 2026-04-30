import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const secretEnvVarMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "secret-env-var",
  description: "Direct access to secret environment variables — review handling and exposure",
  filePatterns: ["**/*.{lua,go,ts,js}"],
  match(content, filePath) {
    if (/_test\.|_spec\.|\.test\.|\.spec\./.test(filePath)) return [];

    return regexMatcher(
      "secret-env-var",
      [
        // Lua
        { regex: /os\.getenv\s*\(\s*["'].*SECRET/, label: "Lua os.getenv for SECRET" },
        { regex: /os\.getenv\s*\(\s*["'].*MASTER_KEY/, label: "Lua os.getenv for MASTER_KEY" },
        { regex: /os\.getenv\s*\(\s*["'].*AWS_SECRET/, label: "Lua os.getenv for AWS_SECRET" },
        { regex: /os\.getenv\s*\(\s*["'].*PRIVATE_KEY/, label: "Lua os.getenv for PRIVATE_KEY" },
        // Go
        { regex: /os\.Getenv\s*\(\s*".*SECRET/, label: "Go os.Getenv for SECRET" },
        { regex: /os\.Getenv\s*\(\s*".*MASTER_KEY/, label: "Go os.Getenv for MASTER_KEY" },
        { regex: /os\.Getenv\s*\(\s*".*AWS_SECRET/, label: "Go os.Getenv for AWS_SECRET" },
        // TS/JS
        {
          regex: /process\.env\.\w*(JWT_SECRET|JWE_SECRET|PURGE_API_SECRET|COSMOSDB_MASTER_KEY)/,
          label: "Secret env var access",
        },
      ],
      content,
    );
  },
};
