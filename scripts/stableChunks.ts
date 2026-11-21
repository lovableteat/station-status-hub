// Chunk layout that lets a deploy rename only the files whose code changed.
//
// A built file's name carries a hash of its content, and its content names the files it imports. Rollup puts whatever
// the entry needs into the entry chunk, so every other chunk imported the entry chunk; the entry chunk in turn names
// (through the lazy imports) every page, so its hash moved with any change anywhere, and with it the name of nearly
// every file: one edited page made browsers download the whole application again, exceljs and three.js included
// (measured 2026-11-21: 126 of 159 scripts renamed after a three-file change).
//
// The three modules that hold the lazy imports (the "hubs": the entry, the signed-in shell, the home page) therefore
// get chunks of their own, and what Rollup had put next to each of them goes into a layer chunk that names no page:
//
//   entry (main + App) ──▶ core          AuthenticatedApplication ──▶ shell ──▶ core          Index ──▶ home ──▶ shell
//
// Nothing imports a hub chunk statically, so an edited workspace renames that workspace, the hubs (small) and nothing
// else.
//
// The layout is Rollup's own, with only the hubs taken out. An ordinary build is run first (not written, not
// minified); the second build then tells Rollup, for every module, the chunk the first one put it in, and leaves the
// hub modules to themselves. Naming only the three layers looked simpler and was wrong twice (2026-11-21): a manual
// chunk drags in every static dependency of its modules that has no chunk assigned, and
// `import { Bell } from "lucide-react"` reaches every icon through the package's index, so all 259 icons the
// application uses anywhere landed in the login page's chunk (+21 KB gzip), and a page that used a new icon renamed
// everything again. With every module assigned, nothing is left to drag.
import path from "node:path";
import { build, type Plugin, type ResolvedConfig } from "vite";

export const STABLE_CHUNK_HUBS = {
  entry: ["src/main.tsx", "src/App.tsx"],
  shell: ["src/components/auth/AuthenticatedApplication.tsx"],
  home: ["src/pages/Index.tsx"],
} as const;

/** Set while the first, ordinary build runs: the plugins stay out of its way, and it cannot start a third one. */
export const STABLE_CHUNK_PROBE_ENV = "STATION_CHUNK_PROBE";

export interface ProbeChunk {
  fileName: string;
  /** Rollup's name for the chunk ("MaterialRequestPage", "select", "index"…), without the hash. */
  name: string;
  moduleIds: readonly string[];
  /** For an entry chunk: its entry module (index.html), which has to stay where Rollup puts entries. */
  entryModuleId?: string | null;
}

const normalize = (id: string) => id.replace(/\\/g, "/").replace(/[?#].*$/, "");

/** A short, stable tag for a set of module paths: two chunks Rollup both calls "index" still get names of their own. */
function tag(values: readonly string[]) {
  let hash = 0x811c9dc5;
  for (const char of [...values].sort().join("|")) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(36);
}

/**
 * module id (as Rollup spells it) → chunk name for the second build: every module keeps the chunk the ordinary build
 * gave it, except that what sat next to a hub goes to core / shell / home and the hub modules (and the entry module)
 * get no name, so Rollup gives them chunks of their own. Null when the hubs do not sit in three different chunks in
 * that build (one renamed, removed, or no longer lazy): the build then keeps Rollup's own layout, which is slower to
 * update but never wrong.
 *
 * A hub's chunk is the one that holds the hub module. Rollup's `facadeModuleId` cannot be used: a chunk that also
 * exports shared modules to other chunks, which is exactly the case here, has none.
 */
export function layersFromProbe(root: string, chunks: readonly ProbeChunk[]): Map<string, string> | null {
  const at = (file: string) => normalize(path.resolve(root, file));
  const base = `${normalize(path.resolve(root))}/`;
  const hubs = new Set<string>(Object.values(STABLE_CHUNK_HUBS).flat().map(at));
  for (const chunk of chunks) if (chunk.entryModuleId) hubs.add(normalize(chunk.entryModuleId));
  const holding = (file: string) => chunks.find(chunk => chunk.moduleIds.some(id => normalize(id) === at(file)));
  const layerOf = new Map<ProbeChunk | undefined, string>([
    [holding(STABLE_CHUNK_HUBS.entry[0]), "core"],
    [holding(STABLE_CHUNK_HUBS.shell[0]), "shell"],
    [holding(STABLE_CHUNK_HUBS.home[0]), "home"],
  ]);
  if (layerOf.has(undefined) || layerOf.size !== 3) return null;
  // The other chunks keep Rollup's name. A name that is taken (several are called "index", one may be called "core")
  // gets a tag of the modules it holds: the same modules, the same name, at every build.
  const taken = new Map<string, number>([["core", 1], ["shell", 1], ["home", 1]]);
  for (const chunk of chunks) if (!layerOf.has(chunk)) taken.set(chunk.name, (taken.get(chunk.name) ?? 0) + 1);
  const layers = new Map<string, string>();
  for (const chunk of chunks) {
    const name = layerOf.get(chunk)
      ?? ((taken.get(chunk.name) ?? 0) > 1 ? `${chunk.name}-${tag(chunk.moduleIds.map(id => normalize(id).replace(base, "")))}` : chunk.name);
    for (const id of chunk.moduleIds) if (!hubs.has(normalize(id)) && !layers.has(id)) layers.set(id, name);
  }
  return layers;
}

/** Chunks (other than hubs) that statically import a hub chunk: with the layout in place there are none. */
export function chunksImportingHubs(root: string, chunks: ReadonlyArray<ProbeChunk & { imports: readonly string[] }>) {
  const at = (file: string) => normalize(path.resolve(root, file));
  const hubs = new Set<string>(Object.values(STABLE_CHUNK_HUBS).flat().map(at));
  const isHub = (chunk: ProbeChunk) => chunk.moduleIds.some(id => hubs.has(normalize(id)));
  const hubFiles = new Set(chunks.filter(isHub).map(chunk => chunk.fileName));
  return chunks.filter(chunk => !isHub(chunk) && chunk.imports.some(name => hubFiles.has(name))).map(chunk => chunk.fileName);
}

export function stableChunksPlugin(): Plugin {
  let resolved: ResolvedConfig | undefined;
  let layers: Map<string, string> | null = null;
  let probed = false;
  const probing = () => process.env[STABLE_CHUNK_PROBE_ENV] === "1";
  return {
    name: "station-stable-chunks",
    apply: "build",
    config() {
      // Installed up front (Rollup reads the option before buildStart); it answers once the first build is in.
      // minifyInternalExports off: Rollup otherwise hands out the short export names ("a", "b"…) in the order the other
      // chunks first use them, so one new import in a page reshuffled the names in core and renamed every file again
      // (measured: a page that used one new icon renamed 129 of 251 files). Real names do not depend on that order.
      return { build: { rollupOptions: { output: { manualChunks: (id: string) => (probing() ? undefined : layers?.get(id)), minifyInternalExports: false } } } };
    },
    configResolved(config) {
      if (!probing()) resolved = config;
    },
    async buildStart() {
      if (probing() || probed || !resolved) return;
      probed = true;
      process.env[STABLE_CHUNK_PROBE_ENV] = "1";
      try {
        const inline = resolved.inlineConfig;
        const result = await build({
          ...inline,
          configFile: resolved.configFile ?? false,
          mode: resolved.mode,
          logLevel: "silent",
          // watch: null — under `vite build --watch` the first build must still be a single build, not a second watcher.
          build: { ...inline.build, watch: null, write: false, minify: false, cssMinify: false, reportCompressedSize: false, sourcemap: false },
        });
        const outputs = Array.isArray(result) ? result : [result];
        const chunks: ProbeChunk[] = [];
        for (const output of outputs) {
          if (!("output" in output)) continue;
          for (const item of output.output) {
            if (item.type === "chunk") chunks.push({ fileName: item.fileName, name: item.name, moduleIds: item.moduleIds, entryModuleId: item.isEntry ? item.facadeModuleId : null });
          }
        }
        layers = layersFromProbe(resolved.root, chunks);
        if (!layers) this.warn("stable chunks: the hub modules are not in three chunks of their own; keeping Rollup's layout (every deploy renames most files). See scripts/stableChunks.ts.");
      } catch (error) {
        layers = null;
        this.warn(`stable chunks: the first build failed (${error instanceof Error ? error.message : String(error)}); keeping Rollup's layout.`);
      } finally {
        delete process.env[STABLE_CHUNK_PROBE_ENV];
      }
    },
    generateBundle(_options, bundle) {
      if (probing() || !layers || !resolved) return;
      const chunks = Object.values(bundle).flatMap(item => (item.type === "chunk"
        ? [{ fileName: item.fileName, name: item.name, moduleIds: item.moduleIds, imports: item.imports }] : []));
      const offenders = chunksImportingHubs(resolved.root, chunks);
      if (offenders.length) this.warn(`stable chunks: ${offenders.length} chunk(s) import a hub chunk statically, so they are renamed at every deploy: ${offenders.slice(0, 5).join(", ")}`);
    },
  };
}
