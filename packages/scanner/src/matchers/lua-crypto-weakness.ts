import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const luaCryptoWeaknessMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "lua-crypto-weakness",
  description: "Weak crypto patterns in Lua — hardcoded IVs, ECB mode, timing-unsafe comparisons",
  filePatterns: ["**/*.lua"],
  match(content, filePath) {
    if (/_test\.lua$|_spec\.lua$/.test(filePath)) return [];

    return regexMatcher(
      "lua-crypto-weakness",
      [
        { regex: /aes.*ecb|ecb.*aes/i, label: "AES ECB mode (no IV, deterministic)" },
        {
          regex: /==\s*.*hmac|hmac.*==/,
          label: "Timing-unsafe HMAC comparison (use constant-time)",
        },
        { regex: /==\s*.*hash|hash.*==/, label: "Timing-unsafe hash comparison" },
        { regex: /md5\s*\(|\.md5/, label: "MD5 usage" },
        { regex: /sha1\s*\(|\.sha1\b/, label: "SHA1 usage" },
        { regex: /local\s+iv\s*=\s*["']/, label: "Hardcoded IV value" },
      ],
      content,
    );
  },
};
