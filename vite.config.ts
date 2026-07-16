import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
