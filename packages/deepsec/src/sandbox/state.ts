import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@deepsec/core";
import type { SandboxRunState } from "./types.js";

const RUNS_DIR = "sandbox-runs";

function runsDir(projectId: string): string {
  return path.join(dataDir(projectId), RUNS_DIR);
}

function runPath(projectId: string, runId: string): string {
  return path.join(runsDir(projectId), `${runId}.json`);
}

export function generateRunId(): string {
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const suffix = crypto.randomBytes(2).toString("hex");
  return `sbx-${ts}-${suffix}`;
}

export function saveRunState(state: SandboxRunState): void {
  const dir = runsDir(state.projectId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(runPath(state.projectId, state.runId), JSON.stringify(state, null, 2) + "\n");
}

export function loadRunState(projectId: string, runId: string): SandboxRunState {
  const p = runPath(projectId, runId);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function deleteRunState(projectId: string, runId: string): void {
  try {
    fs.unlinkSync(runPath(projectId, runId));
  } catch {}
}

/** List all sandbox run states for a project, newest first */
export function listRunStates(projectId: string): SandboxRunState[] {
  const dir = runsDir(projectId);
  if (!fs.existsSync(dir)) return [];

  const states: SandboxRunState[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".json")) continue;
    try {
      states.push(JSON.parse(fs.readFileSync(path.join(dir, entry), "utf-8")));
    } catch {}
  }
  return states.sort((a, b) => new Date(b.launchedAt).getTime() - new Date(a.launchedAt).getTime());
}
