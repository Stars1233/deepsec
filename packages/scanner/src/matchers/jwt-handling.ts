import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

/**
 * Both repos: JWT creation, signing, verification, and cookie handling.
 * Misconfigurations can lead to auth bypass or token forgery.
 */
export const jwtHandlingMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "jwt-handling",
  description: "JWT signing, verification, and cookie-based session handling",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];
    if (/node_modules/.test(filePath)) return [];

    // Only match files that deal with JWT/tokens
    if (!/jwt|jose|jsonwebtoken|token|session.*cookie/i.test(content)) return [];

    return regexMatcher(
      "jwt-handling",
      [
        {
          regex: /jwtVerify|jwt\.verify|verifyJwt/,
          label: "JWT verification (verify algorithm pinning)",
        },
        {
          regex: /SignJWT|jwt\.sign|jwtSign|createBypassJwt/,
          label: "JWT signing (verify key management)",
        },
        { regex: /jwtDecrypt|jwtEncrypt|EncryptJWT/, label: "JWT encryption (verify algorithm)" },
        {
          regex: /cookie.*secret|SESSION_COOKIE|USER_CACHE_COOKIE/,
          label: "Session cookie handling",
        },
        {
          regex: /refreshToken|force_refresh_access_token/,
          label: "Token refresh logic (verify validation)",
        },
        {
          regex: /algorithm.*none|alg.*none/i,
          label: "JWT 'none' algorithm (CRITICAL if not test)",
        },
      ],
      content,
    );
  },
};
