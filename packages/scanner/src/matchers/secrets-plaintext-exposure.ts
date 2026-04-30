import type { CandidateMatch } from "@deepsec/core";
import type { MatcherPlugin } from "../types.js";

/**
 * Decrypted-plaintext value flowing into a log line, HTTP response body, or
 * error message. Common shapes:
 *   - `logger.info({ plaintext })`, `console.log(decrypted)`
 *   - `res.json({ value: decryptResponse.plaintext })`
 *   - `throw new Error(\`failed: \${plaintext}\`)`
 *   - `span.setAttribute('secret', plaintext)`
 *   - `return plaintext` from an HTTP handler without an intermediate owner check
 *
 * Flags any line where a .plaintext / decrypted* / decryptedValue reference
 * sits inside a logger/response/error/span call.
 */
export const secretsPlaintextExposureMatcher: MatcherPlugin = {
  noiseTier: "precise" as const,
  slug: "secrets-plaintext-exposure",
  description: "Decrypted plaintext flowing into logs, HTTP responses, errors, or traces",
  filePatterns: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs", "**/*.go"],
  match(content, filePath) {
    if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) return [];
    if (/_test\.go$/.test(filePath)) return [];
    if (/\.d\.ts$/.test(filePath)) return [];
    if (/(?:^|\/)__(?:tests|mocks)__\//.test(filePath)) return [];

    const lines = content.split("\n");
    const hitLines: number[] = [];
    const snippets: string[] = [];

    // Plaintext-ish identifiers on the call-argument side
    const PLAINTEXT =
      /\b(?:plaintext|decryptedValue|decryptedSecret|decryptedEnv|decryptResponse\.plaintext|nowDecryptResponse\.plaintext|decrypted\w*)\b/;

    // Sinks that shouldn't receive secrets
    const SINK =
      /\b(?:console\.(?:log|info|warn|error|debug)|logger\.(?:info|warn|error|debug|fatal|trace)|log\.(?:Info|Warn|Error|Debug|Printf|Println)|ngx\.log|zap\.(?:String|Any|Error)|fmt\.(?:Errorf|Printf|Println)|span\.(?:setAttribute|setAttributes|addEvent|recordException)|res\.(?:send|json|write|end)|response\.(?:send|json|write|end)|reply\.(?:send|code)|ctx\.(?:body|reply)|throw\s+new\s+\w*Error|new\s+Error)\s*\(/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!SINK.test(line)) continue;
      // Check this line + up to 3 continuation lines
      const span = lines.slice(i, i + 4).join("\n");
      if (!PLAINTEXT.test(span)) continue;
      // Exclude obvious legitimate uses: `length`, `.substring`, property names
      if (/plaintext\s*\.\s*length\b/.test(span) && !/plaintext\s*[,)]/.test(span)) continue;

      hitLines.push(i + 1);
      const s = Math.max(0, i - 1);
      const e = Math.min(lines.length, i + 4);
      snippets.push(lines.slice(s, e).join("\n"));
    }

    if (hitLines.length === 0) return [];
    const match: CandidateMatch = {
      vulnSlug: "secrets-plaintext-exposure",
      lineNumbers: hitLines,
      snippet: snippets[0],
      matchedPattern: "plaintext reference inside logger/response/error/span call",
    };
    return [match];
  },
};
