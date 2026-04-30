import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const objectInjectionMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "object-injection",
  description: "Prototype pollution via Object.assign/merge/defaults with user input",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];

    return regexMatcher(
      "object-injection",
      [
        {
          regex: /Object\.assign\s*\(\s*\{\s*\}\s*,\s*(req|body|params|query)/,
          label: "Object.assign from user input",
        },
        {
          regex: /lodash.*merge\s*\(|_\.merge\s*\(|deepMerge\s*\(/,
          label: "Deep merge (prototype pollution risk)",
        },
        {
          regex: /_\.defaultsDeep\s*\(|defaultsDeep\s*\(/,
          label: "defaultsDeep (prototype pollution)",
        },
        {
          regex: /\[req\.\w+\]|body\[.*\].*=|params\[.*\].*=/,
          label: "Dynamic property assignment from user input",
        },
      ],
      content,
    );
  },
};
