// A production build of the real application with the measurement mock in place of the Supabase client.
// usage: node scripts/perf/build.mjs [label]   → output/perf/dist-<label>  (output/ is not committed)
// The build uses vite.config.ts as it is, so chunking and the boot preload are what a deploy would ship.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, loadConfigFromFile, mergeConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const label = process.argv[2] ?? "current";
process.chdir(root);
process.env.VITE_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.VITE_SUPABASE_ANON_KEY ||= "isolated-test-key";
const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, path.join(root, "vite.config.ts"), root);
await build(mergeConfig(loaded.config, {
  root, configFile: false, envFile: false, logLevel: "warn",
  resolve: { alias: [{ find: "@/integrations/supabase/client", replacement: path.join(here, "startupMock.mjs") }] },
  build: { outDir: path.join(root, "output/perf", `dist-${label}`), emptyOutDir: true, reportCompressedSize: false },
}));
console.log(`built output/perf/dist-${label}`);
