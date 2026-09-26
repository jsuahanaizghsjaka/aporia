import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  copyFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
test("source updater preserves secrets/Git/unrelated work, backs up replacements and rejects damage", async () => {
  const root = await mkdtemp(join(tmpdir(), "aporia-install-test-")),
    project = join(root, "Рабочий стол", "Aporia"),
    update = join(root, "update");
  try {
    await mkdir(join(project, ".git"), { recursive: true });
    await mkdir(join(project, "src"));
    await mkdir(join(update, "source", "src"), { recursive: true });
    await copyFile(
      "scripts/install-source-update.mjs",
      join(update, "install.mjs"),
    );
    const before = "old\r\n",
      after = "new\n";
    for (const [path, text] of [
      ["package.json", '{"name":"aporia"}'],
      ["src/lesson.ts", before],
      [".env.local", "SECRET_SENTINEL"],
      [".git/HEAD", "GIT_SENTINEL"],
      ["my-work.txt", "USER_WORK"],
    ])
      await writeFile(join(project, path), text);
    await writeFile(join(update, "source/src/lesson.ts"), after);
    await writeFile(
      join(update, "manifest.json"),
      JSON.stringify({
        version: 1,
        files: [
          {
            path: "src/lesson.ts",
            sha256: createHash("sha256").update(after).digest("hex"),
          },
        ],
      }),
    );
    const run = () =>
      spawnSync(
        process.execPath,
        [join(update, "install.mjs"), "--project", project],
        { encoding: "utf8" },
      );
    let result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(project, "src/lesson.ts"), "utf8"), after);
    const backups = await readdir(join(project, ".aporia-backups"));
    assert.equal(backups.length, 1);
    assert.equal(
      await readFile(
        join(project, ".aporia-backups", backups[0], "src/lesson.ts"),
        "utf8",
      ),
      before,
    );
    for (const [path, text] of [
      [".env.local", "SECRET_SENTINEL"],
      [".git/HEAD", "GIT_SENTINEL"],
      ["my-work.txt", "USER_WORK"],
    ])
      assert.equal(await readFile(join(project, path), "utf8"), text);
    result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /already installed/);
    await writeFile(join(update, "source/src/lesson.ts"), "damaged");
    assert.equal(run().status, 1);
    assert.equal(await readFile(join(project, "src/lesson.ts"), "utf8"), after);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
