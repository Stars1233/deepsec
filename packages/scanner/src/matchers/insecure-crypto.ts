import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const insecureCryptoMatcher: MatcherPlugin = {
  noiseTier: "noisy" as const,
  slug: "insecure-crypto",
  description: "Weak cryptographic algorithms and insecure random number generation",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];

    const results = regexMatcher(
      "insecure-crypto",
      [
        { regex: /createHash\s*\(\s*['"]md5['"]/, label: "MD5 hash" },
        { regex: /createHash\s*\(\s*['"]sha1['"]/, label: "SHA1 hash" },
        { regex: /createCipher\s*\(/, label: "deprecated createCipher (use createCipheriv)" },
        { regex: /DES|RC4|Blowfish/i, label: "weak cipher algorithm" },
        { regex: /\bmd5\s*\(/, label: "MD5 function call" },
        {
          regex: /===?\s*.*\bhmac\b|\bhmac\b.*===?/,
          label: "Timing-unsafe HMAC comparison (use timingSafeEqual)",
        },
        { regex: /===?\s*.*\bdigest\b|\bdigest\b.*===?/, label: "Timing-unsafe digest comparison" },
        {
          regex: /===?\s*.*\bsignature\b|\bsignature\b.*===?/,
          label: "Timing-unsafe signature comparison",
        },
      ],
      content,
    );

    // Only flag Math.random in security-relevant contexts
    const securityContext =
      /\b(token|secret|key|password|nonce|salt|session|csrf|auth|credential|hash)\b/i;
    if (securityContext.test(content)) {
      results.push(
        ...regexMatcher(
          "insecure-crypto",
          [{ regex: /Math\.random\s*\(/, label: "Math.random in security context" }],
          content,
        ),
      );
    }

    return results;
  },
};
