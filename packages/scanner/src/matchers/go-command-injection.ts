import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const goCommandInjectionMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "go-command-injection",
  description: "Go exec.Command with potentially dynamic arguments",
  filePatterns: ["**/*.go"],
  match(content, filePath) {
    if (/_test\.go$/.test(filePath)) return [];

    return regexMatcher(
      "go-command-injection",
      [
        { regex: /exec\.Command\s*\(/, label: "exec.Command" },
        { regex: /exec\.CommandContext\s*\(/, label: "exec.CommandContext" },
        { regex: /syscall\.Exec\s*\(/, label: "syscall.Exec" },
      ],
      content,
    );
  },
};
