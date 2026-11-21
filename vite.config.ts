import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { bootPreloadPlugin } from "./scripts/bootPreloadPlugin.ts";
import { stableChunksPlugin } from "./scripts/stableChunks.ts";

export default defineConfig(({ mode }) => ({
  base: "/station-status-hub/",
  server: {
    host: "::",
    port: 8080,
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["occt-wasm"],
  },
  build: {
    target: "es2020",
  },
  // bootPreloadPlugin: index.html asks for the signed-in shell early. stableChunksPlugin: a deploy renames only the
  // files whose code changed. Both are this repository's own build helpers (scripts/).
  plugins: [react(), mode === "development" && componentTagger(), bootPreloadPlugin(), stableChunksPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
