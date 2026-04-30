import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const oauthFlowMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "oauth-flow",
  description: "OAuth authorize/callback endpoints and token-bearing redirects",
  filePatterns: [
    "**/oauth/**/*.{ts,tsx}",
    "**/auth/**/*.{ts,tsx}",
    "**/callback/**/*.{ts,tsx}",
    "**/app/api/**/*.{ts,tsx}",
    "**/api/**/*.{ts,tsx}",
  ],
  match(content, filePath) {
    if (/\.(test|spec)\./i.test(filePath)) return [];

    const isOAuthPath = /oauth|callback|authorize/i.test(filePath);
    const hasOAuthCode =
      /redirect_uri|authorization_code|code_verifier|state=|code=|access_token/.test(content);

    if (!isOAuthPath && !hasOAuthCode) return [];

    return regexMatcher(
      "oauth-flow",
      [
        { regex: /redirect_uri/, label: "OAuth redirect_uri handling" },
        { regex: /authorization_code|grant_type/, label: "OAuth authorization code flow" },
        { regex: /code_verifier|code_challenge/, label: "PKCE flow" },
        { regex: /state=.*redirect|redirect.*state=/, label: "OAuth state + redirect" },
        { regex: /\?code=|&code=/, label: "Authorization code in URL" },
        { regex: /access_token.*redirect|redirect.*access_token/, label: "Token in redirect URL" },
        { regex: /callback.*token|token.*callback/, label: "Token in callback" },
      ],
      content,
    );
  },
};
