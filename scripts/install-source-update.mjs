// The delivery includes this script as install.mjs beside manifest.json and source/.
// No Git, npm, SQL, deployment or deletion operations.
import { createHash } from "node:crypto";
import { dirname, join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  lstatSync,
  realpathSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
} from "node:fs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  const root = dirname(fileURLToPath(import.meta.url));
  const index = process.argv.indexOf("--project");
  if (index < 0 || !process.argv[index + 1])
    throw new Error("Use: node install.mjs --project <existing Aporia folder>");
  const project = realpathSync(process.argv[index + 1]),
    source = realpathSync(join(root, "source"));
  if (
    basename(project).toLowerCase() !== "aporia" ||
    JSON.parse(readFileSync(join(project, "package.json"), "utf8")).name !==
      "aporia"
  )
    throw new Error("Select the existing Aporia folder.");
  if (
    !relative(project, source).startsWith("..") ||
    !relative(source, project).startsWith("..")
  )
    throw new Error("Extract the update outside your working project.");
  const manifest = JSON.parse(
    readFileSync(join(root, "manifest.json"), "utf8"),
  );
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length
  )
    throw new Error("Invalid manifest.");
  const seen = new Set();
  const files = manifest.files
    .map((entry) => {
      const name = entry.path;
      if (
        typeof name !== "string" ||
        name.includes("\\") ||
        name.includes(":") ||
        name.startsWith("/") ||
        name
          .split("/")
          .some(
            (p) =>
              !p ||
              p === ".." ||
              (p.startsWith(".") &&
                ![".env.example", ".gitignore"].includes(p)),
          ) ||
        seen.has(name)
      )
        throw new Error("Unsafe or duplicate update path.");
      seen.add(name);
      const from = join(source, name),
        to = join(project, name);
      if (!lstatSync(from).isFile() || lstatSync(from).isSymbolicLink())
        throw new Error("Invalid source: " + name);
      const bytes = readFileSync(from);
      if (sha(bytes) !== entry.sha256)
        throw new Error("Damaged update file: " + name + ". Nothing copied.");
      let cursor = project;
      for (const part of name.split("/")) {
        cursor = join(cursor, part);
        if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink())
          throw new Error("Linked target: " + name);
      }
      if (existsSync(to) && !lstatSync(to).isFile())
        throw new Error("Target is not a file: " + name);
      const previous = existsSync(to) ? readFileSync(to) : null;
      return { name, from, to, bytes, previous };
    })
    .filter((f) => !f.previous?.equals(f.bytes));
  if (!files.length) {
    console.log("This source update is already installed. Nothing changed.");
    process.exit(0);
  }
  const backupRoot = join(project, ".aporia-backups");
  if (existsSync(backupRoot) && lstatSync(backupRoot).isSymbolicLink())
    throw new Error("Backup folder must not be a link.");
  mkdirSync(backupRoot, { recursive: true });
  const backup = mkdtempSync(join(backupRoot, "before-stages21-23-"));
  for (const f of files)
    if (f.previous) {
      const path = join(backup, f.name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, f.previous);
    }
  writeFileSync(
    join(backup, "restore.json"),
    JSON.stringify(
      {
        overwritten: files.filter((f) => f.previous).map((f) => f.name),
        added: files.filter((f) => !f.previous).map((f) => f.name),
      },
      null,
      2,
    ),
  );
  for (const f of files) {
    const current = existsSync(f.to) ? readFileSync(f.to) : null;
    if (
      (current === null) !== (f.previous === null) ||
      (current && !current.equals(f.previous))
    )
      throw new Error("File changed during backup: " + f.name);
  }
  console.log("Backup: " + backup);
  for (const f of files) {
    mkdirSync(dirname(f.to), { recursive: true });
    copyFileSync(f.from, f.to);
  }
  console.log(`Updated ${files.length} files in ${project}`);
  console.log(
    "Preserved .git, .env.local and unrelated files. No commit, push or database changes.",
  );
  console.log(
    "Next: npm ci; npm run verify. Apply missing migration 010 after 001-009 in Supabase. See INSTALL_RU.md.",
  );
} catch (error) {
  console.error("Update stopped: " + error.message);
  process.exitCode = 1;
}
