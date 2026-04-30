import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const gitProviderUrlInjectionMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "git-provider-url-injection",
  description:
    "Git provider API URLs constructed with interpolated user input — path injection risk",
  filePatterns: ["**/*.{ts,tsx,js,jsx}"],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];

    return regexMatcher(
      "git-provider-url-injection",
      [
        { regex: /api\.github\.com.*\$\{/, label: "GitHub API URL with interpolation" },
        { regex: /github\.com\/.*\$\{/, label: "GitHub URL with interpolated path" },
        { regex: /gitlab\.com.*\$\{/, label: "GitLab URL with interpolation" },
        { regex: /bitbucket\.org.*\$\{/, label: "Bitbucket URL with interpolation" },
        { regex: /`https?:\/\/.*git.*\$\{/, label: "Git provider URL with interpolation" },
      ],
      content,
    );
  },
};
