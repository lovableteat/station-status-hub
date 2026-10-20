import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

// `npm run dev` runs lovable-tagger before vite:react-swc. The tagger inserts
// attributes right after a JSX tag name, so syntax it does not expect (such as
// explicit type arguments, `<ReactFlow<Node, Edge> …>`) turns into a parse
// error that only shows up in dev — production builds skip the tagger.
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(join(root, "package.json"));
const swc = require("@swc/core");

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  }));
  return files.flat();
}

test("every component still parses after the dev component tagger runs", async () => {
  const { componentTagger } = await import(pathToFileURL(require.resolve("lovable-tagger")).href);
  const tagger = componentTagger();
  const context = { warn() {}, error(error) { throw error; } };
  await tagger.configResolved?.call(context, { root, command: "serve", mode: "development" });
  const files = await collect(join(root, "src"));
  assert.ok(files.length > 0);
  const failures = [];
  for (const file of files) {
    const code = await readFile(file, "utf8");
    const result = await tagger.transform.call(context, code, file.replace(/\\/g, "/"));
    const tagged = typeof result === "string" ? result : result?.code ?? code;
    try {
      swc.parseSync(tagged, { syntax: "typescript", tsx: true });
    } catch (error) {
      failures.push(`${file.slice(root.length)}: ${String(error.message ?? error).replace(/\x1B\[[0-9;]*m/g, "").split("\n").find(line => line.includes("x ")) ?? error}`);
    }
  }
  assert.deepEqual(failures, []);
});
