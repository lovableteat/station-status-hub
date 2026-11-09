import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return entry.isFile() && /\.test\.(mjs|ts)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}
const files = (await Promise.all(["src", "tests"].map(directory => collect(join(root, directory))))).flat().sort();
if (!files.length) throw new Error("No unit or contract tests found");
// Pass paths relative to the root: absolute ones overflow Windows' 32,767-character command line in a deep checkout
// such as a git worktree, and spawn fails with ENAMETOOLONG before any test runs.
const tests = files.map(file => relative(root, file).split(sep).join("/"));
const child = spawn(process.execPath, ["--test", ...tests], { cwd: root, stdio: "inherit" });
child.on("error", error => { console.error(error); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
