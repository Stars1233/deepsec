import type { MatcherPlugin } from "../types.js";
import { regexMatcher } from "./utils.js";

export const goHttpHandlerMatcher: MatcherPlugin = {
  noiseTier: "normal" as const,
  slug: "go-http-handler",
  description: "Go HTTP handler functions — entry points for investigation (weak candidate)",
  filePatterns: ["**/*.go"],
  match(content, filePath) {
    if (/_test\.go$/.test(filePath)) return [];

    return regexMatcher(
      "go-http-handler",
      [
        { regex: /http\.HandleFunc\s*\(/, label: "http.HandleFunc registration" },
        { regex: /http\.Handle\s*\(/, label: "http.Handle registration" },
        { regex: /mux\.Handle(Func)?\s*\(/, label: "mux handler registration" },
        { regex: /\.GET\s*\(|\.POST\s*\(|\.PUT\s*\(|\.DELETE\s*\(/, label: "HTTP method handler" },
        {
          regex: /func\s+\w+\s*\(\s*w\s+http\.ResponseWriter.*r\s+\*http\.Request/,
          label: "HTTP handler function signature",
        },
        { regex: /ServeHTTP\s*\(/, label: "ServeHTTP implementation" },
      ],
      content,
    );
  },
};
