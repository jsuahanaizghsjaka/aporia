// Maintainer packaging; never run by the Windows installer.
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const source = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  root = dirname(source);
const files = [];
function walk(dir, rel = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") &&
      ![".env.example", ".gitignore"].includes(entry.name)
    )
      continue;
    if (
      [
        "node_modules",
        "test-results",
        "playwright-report",
        "tsconfig.tsbuildinfo",
        "next-env.d.ts",
      ].includes(entry.name)
    )
      continue;
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(join(dir, entry.name), path);
    else if (entry.isFile())
      files.push({
        path,
        sha256: createHash("sha256")
          .update(readFileSync(join(source, path)))
          .digest("hex"),
      });
  }
}
walk(source);
files.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(
  join(root, "manifest.json"),
  JSON.stringify({ version: 1, files }, null, 2),
);
copyFileSync(
  join(source, "scripts/install-source-update.mjs"),
  join(root, "install.mjs"),
);
copyFileSync(join(source, "docs/STAGES_21_23.md"), join(root, "INSTALL_RU.md"));
const output = resolve(root, "../aporia-stages21-23-update.zip");
// zip updates existing archives; use a new temporary archive to exclude stale entries.
const temporary = resolve(root, `../aporia-package-${Date.now()}.zip`);
execFileSync(
  "zip",
  [
    "-q",
    temporary,
    "install.mjs",
    "manifest.json",
    "INSTALL_RU.md",
    ...files.map((f) => `source/${f.path}`),
  ],
  { cwd: root },
);
copyFileSync(temporary, output);
console.log(
  JSON.stringify({ output, files: files.length, previous: existsSync(output) }),
);
