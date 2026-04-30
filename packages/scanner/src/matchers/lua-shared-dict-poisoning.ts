import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const luaSharedDictPoisoningMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "lua-shared-dict-poisoning",
  description: "Writes to ngx.shared dictionaries — cross-worker cache poisoning risk",
  filePatterns: ["**/*.lua"],
  match(content, filePath) {
    if (/_test\.lua$|_spec\.lua$/.test(filePath)) return [];

    return regexMatcher(
      "lua-shared-dict-poisoning",
      [
        {
          regex: /ngx\.shared\.\w+:set\s*\(/,
          label: "ngx.shared dict :set() (verify key not request-derived)",
        },
        { regex: /ngx\.shared\.\w+:add\s*\(/, label: "ngx.shared dict :add()" },
        { regex: /ngx\.shared\.\w+:replace\s*\(/, label: "ngx.shared dict :replace()" },
        { regex: /ngx\.shared\.\w+:incr\s*\(/, label: "ngx.shared dict :incr()" },
      ],
      content,
    );
  },
};
