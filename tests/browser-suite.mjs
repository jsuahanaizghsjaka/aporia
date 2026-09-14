import { spawnSync } from "node:child_process";
for (const file of ["tests/browser.mjs", "tests/stages7-10-browser.mjs"]) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", file],
    { stdio: "inherit", env: process.env },
  );
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
