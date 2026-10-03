import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
const child = spawn(process.execPath, ["--test", ...files], { cwd: root, stdio: "inherit" });
child.on("error", error => { console.error(error); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
