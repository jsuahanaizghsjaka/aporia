import { spawnSync } from "node:child_process";
for (const file of ["tests/browser.mjs", "tests/stages7-10-browser.mjs"]) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", file],
    { stdio: "inherit", env: process.env },
  );
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
const lessons = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "tests/stages14-16-http.mjs", "--browser"],
  { stdio: "inherit", env: process.env },
);
if (lessons.error || lessons.status !== 0) process.exit(lessons.status || 1);
const projects = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "tests/stages17-20-http.mjs", "--browser"],
  { stdio: "inherit", env: process.env },
);
if (projects.error || projects.status !== 0) process.exit(projects.status || 1);

const history = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "tests/stages21-23-http.mjs", "--browser"],
  { stdio: "inherit", env: process.env },
);
if (history.error || history.status !== 0) process.exit(history.status || 1);
const personal = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "tests/stages24-27-http.mjs", "--browser"],
  { stdio: "inherit", env: process.env },
);
if (personal.error || personal.status !== 0) process.exit(personal.status || 1);
for (const file of [
  "tests/stages31-34-http.mjs",
  "tests/stages35-39-http.mjs",
]) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", file, "--browser"],
    { stdio: "inherit", env: process.env },
  );
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
