import type { CandidateMatch } from "@deepsec/core";
import type { MatcherPlugin } from "../types.js";

/**
 * Detects endpoints that call expensive external APIs (LLMs, paid services)
 * without abuse protection (auth, rate limiting, captcha, bot detection).
 *
 * The issue isn't necessarily "no auth" — a public endpoint with a bot token
 * or API key is fine if it has rate limiting. The pattern is: expensive calls
 * without ANY form of abuse gating.
 */
export const expensiveApiAbuseMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "expensive-api-abuse",
  description:
    "Endpoints calling expensive APIs (LLM, AI, paid services) that may lack abuse protection",
  filePatterns: [
    "**/app/api/**/route.{ts,tsx}",
    "**/app/**/route.{ts,tsx}",
    "**/pages/api/**/*.{ts,tsx}",
    "**/routes/**/*.{ts,tsx}",
    "**/server/**/*.{ts,tsx}",
    "**/actions/**/*.{ts,tsx}",
    "**/actions.{ts,tsx}",
    "**/*.{ts,tsx}",
  ],
  match(content, filePath) {
    if (/\.(test|spec|mock|stub)\./i.test(filePath)) return [];
    if (/node_modules|\.next|dist\//.test(filePath)) return [];

    // Must be a route handler or server action
    const isRouteHandler =
      /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/.test(content) ||
      /export\s+(const|let)\s+(GET|POST|PUT|PATCH|DELETE)\s*=/.test(content) ||
      /export\s+default\s+(async\s+)?function/.test(content);
    const isServerAction = /['"]use server['"]/.test(content);

    if (!isRouteHandler && !isServerAction) return [];

    // Detect expensive API usage
    const expensivePatterns: { regex: RegExp; label: string }[] = [
      // AI SDK
      { regex: /\bgenerateText\s*\(/, label: "AI SDK generateText" },
      { regex: /\bstreamText\s*\(/, label: "AI SDK streamText" },
      { regex: /\bgenerateObject\s*\(/, label: "AI SDK generateObject" },
      { regex: /\bstreamObject\s*\(/, label: "AI SDK streamObject" },
      { regex: /\bembed\s*\(/, label: "AI SDK embed" },
      { regex: /\bembedMany\s*\(/, label: "AI SDK embedMany" },
      // OpenAI direct
      { regex: /openai\.chat\.completions\.create/, label: "OpenAI chat completion" },
      { regex: /openai\.completions\.create/, label: "OpenAI completion" },
      { regex: /openai\.embeddings\.create/, label: "OpenAI embedding" },
      { regex: /openai\.images\.generate/, label: "OpenAI image generation" },
      // Anthropic direct
      { regex: /anthropic\.messages\.create/, label: "Anthropic messages" },
      { regex: /anthropic\.completions\.create/, label: "Anthropic completion" },
      // AI gateway
      { regex: /ai-gateway\.vercel\.sh/, label: "Vercel AI Gateway" },
      // Generic LLM patterns
      { regex: /\/v1\/chat\/completions/, label: "Chat completions API" },
      { regex: /\/v1\/completions/, label: "Completions API" },
      { regex: /\/v1\/embeddings/, label: "Embeddings API" },
      { regex: /\/v1\/images\/generations/, label: "Image generation API" },
      // Paid service APIs
      { regex: /\bsendgrid\b.*\.send\b/i, label: "SendGrid email" },
      { regex: /\bresend\b.*\.send\b/i, label: "Resend email" },
      { regex: /\btwilio\b.*\.create\b/i, label: "Twilio SMS" },
      { regex: /\bstripe\b.*\.create\b/i, label: "Stripe API" },
    ];

    const matches: CandidateMatch[] = [];
    const lines = content.split("\n");

    for (const { regex, label } of expensivePatterns) {
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          matches.push({
            vulnSlug: "expensive-api-abuse",
            lineNumbers: [i + 1],
            snippet: lines.slice(start, end).join("\n"),
            matchedPattern: `Expensive API call: ${label} — check for abuse protection (auth, rate limit, captcha)`,
          });
          break; // One match per pattern per file
        }
      }
    }

    return matches;
  },
};
