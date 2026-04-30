import type { FileRecord, MatcherPlugin } from "@deepsec/core";

// Re-export for backwards compat with consumers that import from @deepsec/scanner.
export type { MatcherPlugin, NoiseTier } from "@deepsec/core";

export interface ScanProgress {
  type: "file_scanned" | "matcher_started" | "matcher_done";
  message: string;
  filePath?: string;
  matcherSlug?: string;
  matchCount?: number;
}

export interface ScannerDriver {
  scan(params: {
    root: string;
    matchers: MatcherPlugin[];
    projectId: string;
    runId: string;
    /** Extra ignore globs merged with the driver's built-in defaults */
    ignorePaths?: string[];
  }): AsyncGenerator<ScanProgress, FileRecord[]>;
}
