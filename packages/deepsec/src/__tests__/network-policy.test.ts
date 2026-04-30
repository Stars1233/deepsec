import { describe, expect, it } from "vitest";
import { buildWorkerNetworkPolicy } from "../sandbox/setup.js";

function allowed(p: ReturnType<typeof buildWorkerNetworkPolicy>): string[] {
  if (typeof p === "string") throw new Error("expected custom policy, got " + p);
  const a = p.allow;
  if (!a) throw new Error("expected allow list");
  if (Array.isArray(a)) return a;
  return Object.keys(a);
}

describe("buildWorkerNetworkPolicy", () => {
  it("uses ANTHROPIC_UPSTREAM_BASE_URL host on the claude path", () => {
    const policy = buildWorkerNetworkPolicy(
      { ANTHROPIC_UPSTREAM_BASE_URL: "https://ai-gateway.vercel.sh" },
      "claude-agent-sdk",
    );
    expect(allowed(policy)).toEqual(["ai-gateway.vercel.sh"]);
  });

  it("uses OPENAI_BASE_URL host on the codex path", () => {
    const policy = buildWorkerNetworkPolicy(
      { OPENAI_BASE_URL: "https://ai-gateway.vercel.sh/v1" },
      "codex",
    );
    expect(allowed(policy)).toEqual(["ai-gateway.vercel.sh"]);
  });

  it("ignores ANTHROPIC_UPSTREAM_BASE_URL when agentType is codex", () => {
    const policy = buildWorkerNetworkPolicy(
      {
        ANTHROPIC_UPSTREAM_BASE_URL: "https://api.anthropic.com",
        OPENAI_BASE_URL: "https://api.openai.com",
      },
      "codex",
    );
    expect(allowed(policy)).toEqual(["api.openai.com"]);
  });

  it("falls back to documented hosts when no upstream URL is set", () => {
    const policy = buildWorkerNetworkPolicy({}, "claude-agent-sdk");
    expect(allowed(policy).sort()).toEqual([
      "ai-gateway.vercel.sh",
      "api.anthropic.com",
      "api.openai.com",
    ]);
  });

  it("falls back when the URL is unparseable", () => {
    const policy = buildWorkerNetworkPolicy(
      { ANTHROPIC_UPSTREAM_BASE_URL: "not a url" },
      "claude-agent-sdk",
    );
    expect(allowed(policy)).toContain("ai-gateway.vercel.sh");
  });

  it("merges extraAllowedHosts with the derived host", () => {
    const policy = buildWorkerNetworkPolicy(
      { ANTHROPIC_UPSTREAM_BASE_URL: "https://ai-gateway.vercel.sh" },
      "claude-agent-sdk",
      ["telemetry.example.com"],
    );
    expect(allowed(policy).sort()).toEqual(["ai-gateway.vercel.sh", "telemetry.example.com"]);
  });

  it("dedupes when extras overlap with the derived host", () => {
    const policy = buildWorkerNetworkPolicy(
      { ANTHROPIC_UPSTREAM_BASE_URL: "https://api.anthropic.com" },
      "claude-agent-sdk",
      ["api.anthropic.com"],
    );
    expect(allowed(policy)).toEqual(["api.anthropic.com"]);
  });
});
