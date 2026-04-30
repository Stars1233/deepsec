import fs from "node:fs";
import path from "node:path";
import type { FileRecord, Finding, Severity } from "@deepsec/core";
import { loadAllFileRecords, readProjectConfig, reportJsonPath, reportMdPath } from "@deepsec/core";
import { BOLD, RESET, severityColor } from "../formatters.js";

function discoverProjects(): string[] {
  const dataDir = path.resolve("data");
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dataDir, e.name, "project.json")))
    .map((e) => e.name);
}

function generateMarkdown(records: FileRecord[], projectId: string): string {
  const allFindings: (Finding & { filePath: string })[] = [];
  for (const r of records) {
    for (const f of r.findings) {
      allFindings.push({ ...f, filePath: r.filePath });
    }
  }

  const bySeverity: Record<Severity, typeof allFindings> = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    HIGH_BUG: [],
    BUG: [],
    LOW: [],
  };
  for (const f of allFindings) {
    bySeverity[f.severity].push(f);
  }

  const analyzedCount = records.filter((r) => r.status === "analyzed").length;

  let md = `# Vulnerability Scan Report\n\n`;
  md += `| Field | Value |\n|-------|-------|\n`;
  md += `| Project | ${projectId} |\n`;
  md += `| Date | ${new Date().toISOString()} |\n`;
  md += `| Files tracked | ${records.length} |\n`;
  md += `| Files analyzed | ${analyzedCount} |\n`;
  md += `| Total findings | ${allFindings.length} |\n`;
  md += `\n`;

  md += `## Summary\n\n`;
  md += `| Severity | Count |\n|----------|-------|\n`;
  md += `| CRITICAL | ${bySeverity.CRITICAL.length} |\n`;
  md += `| HIGH | ${bySeverity.HIGH.length} |\n`;
  md += `| MEDIUM | ${bySeverity.MEDIUM.length} |\n`;
  md += `| HIGH_BUG | ${bySeverity.HIGH_BUG.length} |\n`;
  md += `| BUG | ${bySeverity.BUG.length} |\n\n`;

  for (const severity of ["CRITICAL", "HIGH", "MEDIUM", "HIGH_BUG", "BUG"] as Severity[]) {
    const findings = bySeverity[severity];
    if (findings.length === 0) continue;

    md += `## ${severity} (${findings.length})\n\n`;
    for (const f of findings) {
      md += `### ${f.title}\n\n`;
      const record = records.find((r) => r.filePath === f.filePath);
      md += `- **File:** \`${f.filePath}\`\n`;
      if (record?.gitInfo?.recentCommitters?.length) {
        const committers = record.gitInfo.recentCommitters
          .map((c) => `${c.name} <${c.email}>`)
          .join(", ");
        md += `- **Recent committers:** ${committers}\n`;
      }
      md += `- **Lines:** ${f.lineNumbers.join(", ")}\n`;
      md += `- **Slug:** ${f.vulnSlug}\n`;
      md += `- **Confidence:** ${f.confidence}\n`;
      if (f.revalidation) {
        const v = f.revalidation;
        const icon =
          v.verdict === "true-positive"
            ? "confirmed"
            : v.verdict === "false-positive"
              ? "~~false positive~~"
              : "uncertain";
        md += `- **Revalidation:** ${icon}\n`;
        md += `- **Reasoning:** ${v.reasoning}\n`;
      }
      md += `\n${f.description}\n\n`;
      md += `**Recommendation:** ${f.recommendation}\n\n`;
      md += `---\n\n`;
    }
  }

  return md;
}

export async function reportCommand(opts: { projectId?: string; runId?: string }) {
  const projectIds = opts.projectId ? [opts.projectId] : discoverProjects();

  let records: FileRecord[] = [];
  for (const pid of projectIds) {
    try {
      readProjectConfig(pid);
      records.push(...loadAllFileRecords(pid));
    } catch {}
  }

  // Filter to specific run if requested
  if (opts.runId) {
    records = records.filter((r) => r.analysisHistory.some((a) => a.runId === opts.runId));
  }

  // Only include records that have been analyzed
  records = records.filter((r) => r.status === "analyzed");

  if (records.length === 0) {
    console.log("No analyzed files found. Run the processor first.");
    return;
  }

  if (!opts.projectId) {
    console.log("JSON/Markdown reports require --project-id.");
    return;
  }

  const allFindings = records.flatMap((r) => r.findings);
  const bySeverity = {
    CRITICAL: allFindings.filter((f) => f.severity === "CRITICAL"),
    HIGH: allFindings.filter((f) => f.severity === "HIGH"),
    MEDIUM: allFindings.filter((f) => f.severity === "MEDIUM"),
    HIGH_BUG: allFindings.filter((f) => f.severity === "HIGH_BUG"),
    BUG: allFindings.filter((f) => f.severity === "BUG"),
  };

  // Write JSON report
  const jsonPath = reportJsonPath(opts.projectId, opts.runId);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  const reportData = {
    projectId: opts.projectId,
    generatedAt: new Date().toISOString(),
    runId: opts.runId ?? null,
    summary: {
      filesAnalyzed: records.length,
      totalFindings: allFindings.length,
      critical: bySeverity.CRITICAL.length,
      high: bySeverity.HIGH.length,
      medium: bySeverity.MEDIUM.length,
      highBug: bySeverity.HIGH_BUG.length,
      bug: bySeverity.BUG.length,
    },
    files: records.map((r) => ({
      filePath: r.filePath,
      findings: r.findings,
      analysisHistory: r.analysisHistory,
    })),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2) + "\n");

  // Write markdown report
  const mdPath = reportMdPath(opts.projectId, opts.runId);
  const markdown = generateMarkdown(records, opts.projectId);
  fs.writeFileSync(mdPath, markdown);

  // Print summary
  console.log(`${BOLD}Report generated${RESET}`);
  console.log();
  for (const severity of ["CRITICAL", "HIGH", "MEDIUM", "HIGH_BUG", "BUG"] as const) {
    const count = bySeverity[severity].length;
    if (count > 0) {
      console.log(`  ${severityColor(severity)}${severity}${RESET}: ${count}`);
    }
  }
  console.log();
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);
}
