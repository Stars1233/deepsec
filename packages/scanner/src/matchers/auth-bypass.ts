import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const authBypassMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "auth-bypass",
  description: "Auth checks, middleware guards, session validation that may be bypassable",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, _filePath) {
    return regexMatcher(
      "auth-bypass",
      [
        { regex: /isAdmin\s*[=!]==?\s*(true|false|req\.)/, label: "admin check comparison" },
        { regex: /auth.*skip|skip.*auth|bypass.*auth/i, label: "auth skip/bypass" },
        { regex: /if\s*\(\s*!?\s*session\s*\)/, label: "session null check" },
        { regex: /verify(Token|JWT|Session|Auth)\s*\(/, label: "auth verification call" },
        { regex: /middleware.*auth|auth.*middleware/i, label: "auth middleware" },
        { regex: /req\.headers\[['"]authorization['"]\]/, label: "authorization header access" },
      ],
      content,
    );
  },
};
