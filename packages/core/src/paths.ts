import path from "node:path";

function getDataRoot(): string {
  return process.env.DEEPSEC_DATA_ROOT || "data";
}

export function dataDir(projectId: string): string {
  return path.join(getDataRoot(), projectId);
}

export function projectConfigPath(projectId: string): string {
  return path.join(dataDir(projectId), "project.json");
}

// --- File records (permanent per-file mirror) ---

export function filesDir(projectId: string): string {
  return path.join(dataDir(projectId), "files");
}

export function fileRecordPath(projectId: string, filePath: string): string {
  return path.join(filesDir(projectId), filePath + ".json");
}

// --- Runs (lightweight metadata) ---

export function runsDir(projectId: string): string {
  return path.join(dataDir(projectId), "runs");
}

export function runMetaPath(projectId: string, runId: string): string {
  return path.join(runsDir(projectId), runId + ".json");
}

// --- Reports ---

export function reportsDir(projectId: string): string {
  return path.join(dataDir(projectId), "reports");
}

export function reportJsonPath(projectId: string, runId?: string): string {
  const name = runId ? `report-${runId}.json` : "report.json";
  return path.join(reportsDir(projectId), name);
}

export function reportMdPath(projectId: string, runId?: string): string {
  const name = runId ? `report-${runId}.md` : "report.md";
  return path.join(reportsDir(projectId), name);
}

export function reportCsvPath(projectId: string, runId?: string): string {
  const name = runId ? `report-${runId}.csv` : "report.csv";
  return path.join(reportsDir(projectId), name);
}
