import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const secretsExposureMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "secrets-exposure",
  description: "Hardcoded API keys, tokens, passwords, and secrets",
  filePatterns: ["**/*.{ts,tsx,js,jsx,json,yaml,yml,env,conf,cfg}"],
  match(content, filePath) {
    // Skip test and fixture files
    if (/\.(test|spec|fixture|mock)\./i.test(filePath)) return [];
    if (/__(tests|mocks|fixtures)__/i.test(filePath)) return [];

    return regexMatcher(
      "secrets-exposure",
      [
        { regex: /['"]sk[-_]live[-_][a-zA-Z0-9]{20,}['"]/, label: "Stripe secret key" },
        { regex: /['"]AIza[a-zA-Z0-9_-]{35}['"]/, label: "Google API key" },
        { regex: /['"]ghp_[a-zA-Z0-9]{36}['"]/, label: "GitHub personal access token" },
        { regex: /['"]AKIA[A-Z0-9]{16}['"]/, label: "AWS access key ID" },
        {
          regex:
            /(password|passwd|secret|api_key|apikey|api[-_]secret)\s*[:=]\s*['"][^'"]{8,}['"](?!\s*[;,]\s*\/\/)/,
          label: "hardcoded credential",
        },
        { regex: /['"][a-f0-9]{64}['"]/, label: "potential 256-bit hex secret" },
        { regex: /Bearer\s+[a-zA-Z0-9._-]{20,}/, label: "hardcoded Bearer token" },
      ],
      content,
    );
  },
};
