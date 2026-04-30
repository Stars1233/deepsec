import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DeepsecConfig } from "@deepsec/core";
import { setLoadedConfig } from "@deepsec/core";
import { createJiti } from "jiti";

const CONFIG_FILENAMES = [
  "deepsec.config.ts",
  "deepsec.config.mjs",
  "deepsec.config.js",
  "deepsec.config.cjs",
];

/** Walk up from `start` looking for any of the supported config filenames. */
function findConfigFile(start: string): string | undefined {
  let dir = path.resolve(start);
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Discover and load `deepsec.config.{ts,mjs,js,cjs}` starting from `cwd`.
 * Returns `undefined` if no config file is present (operating in default mode).
 *
 * On success, also calls `setLoadedConfig` so `getRegistry()` / `getConfig()`
 * return the merged state to the rest of the CLI.
 */
export async function loadConfig(
  cwd: string = process.cwd(),
): Promise<{ config: DeepsecConfig; path: string } | undefined> {
  const file = findConfigFile(cwd);
  if (!file) return undefined;

  const ext = path.extname(file);
  let mod: { default?: DeepsecConfig } | DeepsecConfig;
  if (ext === ".ts" || ext === ".cjs") {
    const jiti = createJiti(import.meta.url, { interopDefault: true });
    mod = (await jiti.import(file)) as { default?: DeepsecConfig } | DeepsecConfig;
  } else {
    mod = (await import(pathToFileURL(file).href)) as { default?: DeepsecConfig };
  }

  const config: DeepsecConfig | undefined =
    (mod as { default?: DeepsecConfig }).default ?? (mod as DeepsecConfig);

  if (!config || !Array.isArray(config.projects)) {
    throw new Error(
      `${file}: config must export a default with at least a "projects" array. Use defineConfig() from @deepsec/core for type help.`,
    );
  }

  setLoadedConfig(config);
  return { config, path: file };
}
