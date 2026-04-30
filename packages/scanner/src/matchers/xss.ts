import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const xssMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "xss",
  description: "Unsafe innerHTML, dangerouslySetInnerHTML, template injection patterns",
  filePatterns: ["**/*.{ts,tsx,js,jsx,html,ejs,hbs}"],
  match(content, _filePath) {
    return regexMatcher(
      "xss",
      [
        { regex: /dangerouslySetInnerHTML/, label: "dangerouslySetInnerHTML" },
        { regex: /\.innerHTML\s*=/, label: "innerHTML assignment" },
        { regex: /\.outerHTML\s*=/, label: "outerHTML assignment" },
        { regex: /document\.write\s*\(/, label: "document.write" },
        { regex: /\$\{.*\}.*<\/?\w+>|<\w+[^>]*\$\{/, label: "template literal in HTML" },
        { regex: /v-html\s*=/, label: "Vue v-html directive" },
        { regex: /\[innerHTML\]\s*=/, label: "Angular innerHTML binding" },
      ],
      content,
    );
  },
};
