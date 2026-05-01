import { getConfig } from "@deepsec/core";

/**
 * Resolve a project id from CLI input or the loaded config.
 *
 * Precedence:
 *   1. The `--project-id` value the user passed (always wins).
 *   2. The single entry of `projects[]` if the config has exactly one.
 *
 * Throws with actionable guidance when neither path resolves to a unique
 * project — i.e. config has zero projects, or has multiple and the user
 * didn't disambiguate.
 */
export function resolveProjectId(provided: string | undefined): string {
  if (provided) return provided;

  const config = getConfig();
  const projects = config?.projects ?? [];

  if (projects.length === 1) return projects[0].id;

  if (projects.length === 0) {
    throw new Error(
      `No --project-id specified and no projects found in deepsec.config.ts.\n` +
        `  Run \`deepsec init\` to scaffold a workspace, or add an entry to\n` +
        `  the projects[] array in your existing deepsec.config.ts.`,
    );
  }

  const ids = projects.map((p) => p.id).join(", ");
  throw new Error(
    `Multiple projects in deepsec.config.ts: ${ids}.\n` + `  Pass --project-id <id> to pick one.`,
  );
}
