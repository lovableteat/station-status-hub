// Build-time half of the boot preload: index.html learns which files the signed-in shell and each workspace need, and a
// small inline script asks the browser for them while the entry script is still downloading.
//
// Why: the app loads in a chain (entry → session check → shell → page → workspace), each link discovered only after the
// one before it ran, so a cold start paid one network round trip per link. The files are public static assets; fetching
// them early changes nothing about what runs. The private shell is still imported, and rendered, only after the session
// is verified (tests/authenticatedApplicationLoading.test.mjs): <link rel="modulepreload"> downloads and compiles a
// module but does not run it.
import type { Plugin } from "vite";

/** Preload key → the source module whose chunk (with everything it statically needs) that key loads. */
export const BOOT_PRELOAD_MODULES: Record<string, string> = {
  "file-uploads": "src/components/test-plan/TestPlanWorkspace.tsx",
  comparison: "src/components/comparison/ComparisonWorkspace.tsx",
  "material-requests": "src/components/material-requests/MaterialRequestPage.tsx",
  "data-center": "src/components/data-center/DeploymentPlanningCenter.tsx",
  "pcb-designer": "src/components/pcb-designer/PcbDesignerWorkspace.tsx",
  "user-management": "src/components/admin/AdminPanel.tsx",
  "ai-chat": "src/components/api-management/ApiChatWorkspacePage.tsx",
  performance: "src/components/performance/PerformanceAppraisalPage.tsx",
  "station:issues": "src/components/maintenance/MaintenanceWorkspace.tsx",
  "station:dashboard": "src/components/maintenance/MaintenanceDashboard.tsx",
  "station:test-tracker": "src/components/maintenance/MaintenanceHistory.tsx",
  "station:flow-info": "src/components/maintenance/MaintenanceHistory.tsx",
  "station:tools": "src/components/tools/ToolsManagement.tsx",
  "route:test-tracker": "src/pages/TestTrackerPage.tsx",
  "route:api-management": "src/components/api-management/ApiManagementPage.tsx",
};
/** What every signed-in page needs before anything shows: the providers, then the page that hosts the workspaces. */
export const BOOT_PRELOAD_APPLICATION = "src/components/auth/AuthenticatedApplication.tsx";
export const BOOT_PRELOAD_HOME = "src/pages/Index.tsx";

export interface BootPreloadChunk {
  fileName: string;
  facadeModuleId?: string | null;
  moduleIds?: readonly string[];
  imports: readonly string[];
  isEntry?: boolean;
  css?: readonly string[];
}

export interface BootPreloadTable {
  /** Every file once; the groups below point into this list. */
  files: string[];
  /** AuthenticatedApplication and what it statically imports. */
  application: number[];
  /** The home page (Index) on top of the application. */
  home: number[];
  /** Per preload key: what that workspace adds. */
  keys: Record<string, number[]>;
}

const normalize = (id: string) => id.replace(/\\/g, "/").replace(/[?#].*$/, "");

/** The chunk that holds a source module: the one it is the facade of, else any chunk that contains it. */
export function findChunk(chunks: readonly BootPreloadChunk[], sourcePath: string) {
  const matches = (id: string | null | undefined) => Boolean(id) && normalize(id!).endsWith(`/${sourcePath}`);
  return chunks.find(chunk => matches(chunk.facadeModuleId)) ?? chunks.find(chunk => chunk.moduleIds?.some(matches));
}

/** A chunk with every chunk it statically imports, and their style sheets, in load order. */
export function chunkClosure(chunks: readonly BootPreloadChunk[], start: BootPreloadChunk) {
  const byName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
  const scripts: string[] = [];
  const styles: string[] = [];
  const visit = (chunk: BootPreloadChunk) => {
    if (scripts.includes(chunk.fileName)) return;
    scripts.push(chunk.fileName);
    for (const css of chunk.css ?? []) if (!styles.includes(css)) styles.push(css);
    for (const name of chunk.imports) { const next = byName.get(name); if (next) visit(next); }
  };
  visit(start);
  return { scripts, styles };
}

/**
 * The table the inline script reads. Files the entry already loads are left out; a workspace lists only what it adds to
 * the home page, and a key whose module is not in the build (renamed, removed) is simply missing: that page then loads
 * as it did before, never wrongly.
 */
export function buildBootPreloadTable(chunks: readonly BootPreloadChunk[], modules: Record<string, string> = BOOT_PRELOAD_MODULES): BootPreloadTable {
  const entry = chunks.find(chunk => chunk.isEntry);
  const loaded = new Set(entry ? [...chunkClosure(chunks, entry).scripts, ...chunkClosure(chunks, entry).styles] : []);
  const files: string[] = [];
  const index = (file: string) => { let at = files.indexOf(file); if (at < 0) at = files.push(file) - 1; return at; };
  const group = (sourcePath: string, skip: ReadonlySet<string>) => {
    const chunk = findChunk(chunks, sourcePath);
    if (!chunk) return null;
    const { scripts, styles } = chunkClosure(chunks, chunk);
    return [...scripts, ...styles].filter(file => !loaded.has(file) && !skip.has(file));
  };
  const application = group(BOOT_PRELOAD_APPLICATION, new Set()) ?? [];
  const home = group(BOOT_PRELOAD_HOME, new Set(application)) ?? [];
  const shell = new Set([...application, ...home]);
  const keys: Record<string, number[]> = {};
  for (const [key, sourcePath] of Object.entries(modules)) {
    // The two hash routes replace the home page, so they only skip what the application already brings.
    const added = group(sourcePath, key.startsWith("route:") ? new Set(application) : shell);
    if (added) keys[key] = added.map(index);
  }
  return { files, application: application.map(index), home: home.map(index), keys };
}

/**
 * URL → preload key, as the inline script runs it (plain ES5, no imports). It mirrors getInitialWorkspace and
 * getInitialStationModule in src/pages/Index.tsx; tests/bootPreload.test.mjs holds the two together. A wrong key can
 * only cost a missed or an unused download.
 */
export const BOOT_PRELOAD_KEY_SOURCE = `function(search, hash) {
  var path = (hash || "").replace(/^#/, "").split("?")[0];
  if (path === "/test-tracker") return "route:test-tracker";
  if (path === "/api-management") return "route:api-management";
  if (path && path !== "/") return null;
  var params = new URLSearchParams(search || "");
  var workspace = params.get("workspace");
  var module = params.get("module");
  var station = ["dashboard", "test-tracker", "flow-info", "issues", "tools"];
  if (module === "test-plan" || workspace === "file-uploads") return "file-uploads";
  if (module === "comparison") return "comparison";
  if (module === "users" || module === "collaboration" || module === "api-management") return "user-management";
  if (module === "ai-chat") return "ai-chat";
  if (module === "monitor") return "station:test-tracker";
  if (station.indexOf(module) >= 0) return "station:" + module;
  if (workspace === "station-status") return "station:issues";
  if (["comparison", "material-requests", "data-center", "pcb-designer", "user-management", "ai-chat", "performance"].indexOf(workspace) >= 0) return workspace;
  return null;
}`;

/** sessionStorage keys of the Supabase client (src/integrations/supabase/client.ts): the pointer names this tab's session entry. */
export const BOOT_PRELOAD_SESSION_POINTER = "bringup-auth-active-storage-key";

/**
 * The inline script. Signed in (this tab holds a session): ask for the shell and the workspace in the URL at once, next
 * to the entry script. Signed out: nothing until the login page is up and the browser is idle, then the same scripts
 * (no style sheets: Chrome warns about a preloaded style nobody uses within seconds), so the wait after pressing 登入
 * is the session check and not the downloads. Links carry exactly the href Vite's own preloader uses, so the later
 * import() finds them instead of fetching again.
 *
 * It also leaves `window.__STATION_PRELOAD__(key)` for the application: fetch (never run) the code of one more
 * workspace, used for the background preload of the other workspaces (src/lib/idlePreload.ts).
 */
export function bootPreloadScript(table: BootPreloadTable, base: string) {
  return `(function () {
  try {
    var table = ${JSON.stringify(table)};
    var base = ${JSON.stringify(base)};
    var keyOf = ${BOOT_PRELOAD_KEY_SOURCE};
    var seen = {};
    var add = function (group, styles, background) {
      for (var i = 0; i < (group || []).length; i += 1) {
        var file = table.files[group[i]];
        if (!file || seen[file]) continue;
        var style = /\\.css$/.test(file);
        if (style && !styles) continue;
        seen[file] = true;
        var link = document.createElement("link");
        link.rel = style ? "preload" : "modulepreload";
        if (style) link.as = "style";
        link.crossOrigin = "";
        // A download nobody is waiting for must not compete with the page on screen.
        if (background) link.fetchPriority = "low";
        link.href = base + file;
        document.head.appendChild(link);
      }
    };
    var run = function (styles, background) {
      var key = keyOf(window.location.search, window.location.hash);
      add(table.application, styles, background);
      if (!key || key.indexOf("route:") !== 0) add(table.home, styles, background);
      if (key) add(table.keys[key], styles, background);
    };
    window.__STATION_PRELOAD__ = function (key) {
      try { add(table.keys[key], false, true); } catch (error) { /* an optimisation only */ }
    };
    var signedIn = false;
    try {
      var pointer = window.sessionStorage.getItem(${JSON.stringify(BOOT_PRELOAD_SESSION_POINTER)});
      signedIn = Boolean(pointer && window.sessionStorage.getItem(pointer));
    } catch (error) { signedIn = false; }
    if (signedIn) { run(true, false); return; }
    var connection = navigator.connection;
    if (connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ""))) return;
    window.addEventListener("station-app-ready", function () {
      var later = function () { run(false, true); };
      if (window.requestIdleCallback) window.requestIdleCallback(later, { timeout: 4000 });
      else window.setTimeout(later, 1500);
    }, { once: true });
  } catch (error) { /* Preloading is an optimisation: the app loads the same files itself. */ }
})();`;
}

/**
 * Puts the inline script right after `<meta charset>`: before the style sheet link (an inline script placed after it
 * waits for that sheet, and the preloads would start late instead of next to the entry script), and not before the
 * charset declaration, which a browser only looks for in the first 1024 bytes when the server sends none.
 */
export function placeBootPreloadScript(html: string, script: string) {
  const tag = `<script>${script}</script>`;
  const charset = /<meta\s+charset=[^>]*>/i.exec(html);
  if (charset) return `${html.slice(0, charset.index + charset[0].length)}\n    ${tag}${html.slice(charset.index + charset[0].length)}`;
  const head = /<head[^>]*>/i.exec(html);
  return head ? `${html.slice(0, head.index + head[0].length)}\n    ${tag}${html.slice(head.index + head[0].length)}` : html;
}

export function bootPreloadPlugin(): Plugin {
  let base = "/";
  return {
    name: "station-boot-preload",
    apply: "build",
    configResolved(config) { base = config.base; },
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        if (!context.bundle) return html;
        const chunks: BootPreloadChunk[] = [];
        for (const output of Object.values(context.bundle)) {
          if (output.type !== "chunk") continue;
          chunks.push({
            fileName: output.fileName, facadeModuleId: output.facadeModuleId, moduleIds: output.moduleIds, imports: output.imports, isEntry: output.isEntry,
            css: [...((output as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss ?? [])],
          });
        }
        const table = buildBootPreloadTable(chunks);
        if (!table.application.length) return html;
        return placeBootPreloadScript(html, bootPreloadScript(table, base));
      },
    },
  };
}
