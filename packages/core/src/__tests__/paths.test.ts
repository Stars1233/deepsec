import { describe, expect, it } from "vitest";
import { fileRecordPath, filesDir, runMetaPath, runsDir } from "../paths.js";

describe("paths", () => {
  it("filesDir follows convention", () => {
    expect(filesDir("myapp")).toBe("data/myapp/files");
  });

  it("fileRecordPath follows convention", () => {
    expect(fileRecordPath("myapp", "src/api/users.ts")).toBe(
      "data/myapp/files/src/api/users.ts.json",
    );
  });

  it("runsDir follows convention", () => {
    expect(runsDir("myapp")).toBe("data/myapp/runs");
  });

  it("runMetaPath is flat file", () => {
    expect(runMetaPath("myapp", "run1")).toBe("data/myapp/runs/run1.json");
  });
});
