// Run the copy shipped alongside update-manifest.json from the user's Aporia root.
// Only working-tree files change. No install, SQL, staging, commit or push.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, basename } from "node:path";
import {
  readFileSync,
  existsSync,
  realpathSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  writeFileSync,
  lstatSync,
} from "node:fs";

function fail(message) {
  console.error(message);
  process.exit(1);
}
const root = realpathSync(process.cwd());
const packageDir = dirname(fileURLToPath(import.meta.url));
function git(args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
}
try {
  if (
    basename(root).toLowerCase() !== "aporia" ||
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name !==
      "aporia"
  )
    fail("Open the terminal in your existing Desktop/Aporia project first.");
  const top = git(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0 || realpathSync(top.stdout.trim()) !== root)
    fail(
      "The current folder must be the root of the existing Aporia Git repository.",
    );
  const manifest = JSON.parse(
    readFileSync(join(packageDir, "update-manifest.json"), "utf8"),
  );
  const safePath = (name) =>
    typeof name === "string" &&
    /^[a-zA-Z0-9_./()\[\]-]+$/.test(name) &&
    !name.startsWith("/") &&
    !name.split("/").some((part) => part === ".." || part.startsWith("."));
  if (manifest.version !== 1 || !manifest.files.every(safePath))
    fail("Invalid update manifest. Nothing changed.");
  const patches = manifest.patches.map(({ file, sha256 }) => {
    if (!safePath(file)) fail("Invalid patch path. Nothing changed.");
    const path = resolve(packageDir, file);
    if (
      createHash("sha256").update(readFileSync(path)).digest("hex") !== sha256
    )
      fail("The downloaded patch is damaged. Nothing changed. Download again.");
    return path;
  });
  if (
    patches.some(
      (path) =>
        git(["apply", "--reverse", "--check", "--ignore-space-change", path])
          .status === 0,
    )
  ) {
    console.log("This update is already present. Nothing changed.");
    process.exit(0);
  }
  const selected = patches.find(
    (path) =>
      git(["apply", "--check", "--ignore-space-change", path]).status === 0,
  );
  if (!selected)
    fail(
      "Your files differ from the supported snapshots. Nothing changed. Send git status --short and this message; do not reset or force the patch.",
    );
  const backupRoot = join(root, ".aporia-backups");
  mkdirSync(backupRoot, { recursive: true });
  const backup = mkdtempSync(join(backupRoot, "stages7-10-")),
    originals = [],
    newFiles = [];
  for (const file of manifest.files) {
    const source = join(root, file);
    if (!existsSync(source)) {
      newFiles.push(file);
      continue;
    }
    if (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink())
      fail("A target is not a regular file. Nothing applied.");
    const destination = join(backup, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    originals.push(file);
  }
  writeFileSync(
    join(backup, "restore.json"),
    JSON.stringify({ originals, newFiles }, null, 2),
  );
  // Recheck after the backup in case an editor changed a file meanwhile.
  const checked = git(["apply", "--check", "--ignore-space-change", selected]);
  if (checked.status !== 0)
    fail(
      "Files changed during preparation. Nothing applied. Close editing tasks and retry.",
    );
  const result = git(["apply", "--ignore-space-change", selected]);
  if (result.status !== 0)
    fail(`Update failed. Keep this backup: ${backup}\n${result.stderr}`);
  console.log(`Updated this Aporia folder. Backup: ${backup}`);
  console.log(
    "Next: npm ci; npm run verify. Then apply migration 006 in Supabase as described in docs/STAGES_7_10.md.",
  );
  console.log("No staging, commit, push or database changes were performed.");
} catch (error) {
  fail(`Update stopped: ${error.message}`);
}
