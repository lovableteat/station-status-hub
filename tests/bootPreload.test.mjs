// Start-up speed (2026-11-21): the files of the signed-in shell are asked for early, chunk names survive a deploy, and
// the other workspaces' code is fetched in idle time. These are the pure parts; causes, numbers and how to measure are
// in docs/performance-startup.md.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  BOOT_PRELOAD_APPLICATION, BOOT_PRELOAD_HOME, BOOT_PRELOAD_KEY_SOURCE, BOOT_PRELOAD_MODULES, BOOT_PRELOAD_SESSION_POINTER,
  bootPreloadScript, buildBootPreloadTable, placeBootPreloadScript,
} from '../scripts/bootPreloadPlugin.ts';
import { STABLE_CHUNK_HUBS, chunksImportingHubs, layersFromProbe } from '../scripts/stableChunks.ts';
import { allowsBackgroundPreload, requestCodePreload, scheduleIdleLoads } from '../src/lib/idlePreload.ts';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');
const indexSource = read('src/pages/Index.tsx');
const applicationSource = read('src/components/auth/AuthenticatedApplication.tsx');
const keyOf = new Function(`return ${BOOT_PRELOAD_KEY_SOURCE}`)();

test('the preload table lists what the shell and each workspace add, never what the entry already loads', () => {
  const chunks = [
    { fileName: 'assets/index.js', isEntry: true, facadeModuleId: '/r/src/main.tsx', imports: ['assets/core.js'], css: ['assets/index.css'] },
    { fileName: 'assets/core.js', imports: [], css: ['assets/core.css'] },
    { fileName: 'assets/Auth.js', facadeModuleId: '/r/src/components/auth/AuthenticatedApplication.tsx', imports: ['assets/core.js', 'assets/shell.js'] },
    { fileName: 'assets/shell.js', imports: ['assets/core.js'] },
    // A Windows build spells module ids with backslashes.
    { fileName: 'assets/Index.js', facadeModuleId: 'C:\\r\\src\\pages\\Index.tsx', imports: ['assets/core.js', 'assets/shell.js', 'assets/home.js'], css: ['assets/Index.css'] },
    { fileName: 'assets/home.js', imports: ['assets/shell.js'] },
    { fileName: 'assets/Material.js', facadeModuleId: '/r/src/components/material-requests/MaterialRequestPage.tsx?v=1', imports: ['assets/core.js', 'assets/home.js', 'assets/table.js'], css: ['assets/Material.css'] },
    { fileName: 'assets/table.js', imports: ['assets/core.js'] },
    // Not the facade of its chunk: found through the modules the chunk holds.
    { fileName: 'assets/Tracker.js', facadeModuleId: null, moduleIds: ['/r/src/other.ts', '/r/src/pages/TestTrackerPage.tsx'], imports: ['assets/shell.js', 'assets/home.js'] },
  ];
  const table = buildBootPreloadTable(chunks);
  const names = (group) => group.map((at) => table.files[at]);
  assert.deepEqual(names(table.application), ['assets/Auth.js', 'assets/shell.js']);
  assert.deepEqual(names(table.home), ['assets/Index.js', 'assets/home.js', 'assets/Index.css']);
  assert.deepEqual(names(table.keys['material-requests']), ['assets/Material.js', 'assets/table.js', 'assets/Material.css'], 'only what the workspace adds to the home page');
  assert.deepEqual(names(table.keys['route:test-tracker']), ['assets/Tracker.js', 'assets/home.js'], 'a hash route replaces the home page, so it lists what the home page would have brought');
  assert.ok(!table.files.some((file) => /index\.(js|css)$|core\.(js|css)$/.test(file)), 'nothing the entry script already loads');
  assert.equal(table.keys.performance, undefined, 'a workspace the build does not have is left out, not guessed');
  assert.equal(new Set(table.files).size, table.files.length);
});

test('URL to preload key follows the page that the application opens for that URL', () => {
  // The two functions of Index.tsx that decide the first workspace, run as they are.
  const cut = (name) => indexSource.match(new RegExp(`function ${name}\\([^]*?\\n}\\n`))?.[0] ?? assert.fail(`${name} not found in Index.tsx`);
  const stationIds = [...indexSource.match(/const stationModuleItems[^]*?\n\];/)[0].matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
  const compiled = ts.transpileModule(`${cut('getInitialWorkspace')}\n${cut('getInitialStationModule')}\nmodule.exports = { getInitialWorkspace, getInitialStationModule };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { module: { exports: {} }, URLSearchParams, window: { location: { search: '' } }, stationModuleItems: stationIds.map((id) => ({ id })) };
  vm.runInNewContext(compiled, sandbox);
  const { getInitialWorkspace, getInitialStationModule } = sandbox.module.exports;

  const workspaces = [null, 'station-status', 'file-uploads', 'comparison', 'material-requests', 'data-center', 'pcb-designer', 'user-management', 'ai-chat', 'performance', 'unknown'];
  const modules = [null, ...stationIds, 'monitor', 'test-plan', 'comparison', 'users', 'collaboration', 'api-management', 'ai-chat', 'material-requests', 'unknown'];
  let checked = 0;
  for (const workspace of workspaces) for (const module of modules) {
    const search = `?${new URLSearchParams({ ...(workspace ? { workspace } : {}), ...(module ? { module } : {}) })}`;
    const opened = getInitialWorkspace(search);
    const expected = opened === null ? null : opened === 'station-status' ? `station:${getInitialStationModule(search)}` : opened;
    assert.equal(keyOf(search, ''), expected, search);
    assert.equal(keyOf(search, '#/'), expected, `${search} with the home hash`);
    checked += 1;
  }
  assert.equal(checked, workspaces.length * modules.length);
  assert.equal(keyOf('?workspace=material-requests', '#/test-tracker'), 'route:test-tracker');
  assert.equal(keyOf('', '#/api-management?x=1'), 'route:api-management');
  assert.equal(keyOf('?workspace=material-requests', '#/nowhere'), null, 'an unknown route preloads no workspace');
});

test('every preload key points at a module the application really loads lazily, and every workspace has a key', () => {
  const lazy = `${indexSource}\n${applicationSource}`;
  for (const [key, file] of Object.entries(BOOT_PRELOAD_MODULES)) {
    assert.ok(existsSync(new URL(file, root)), `${key}: ${file} exists`);
    assert.ok(lazy.includes(`import("@/${file.replace(/^src\//, '').replace(/\.tsx$/, '')}")`), `${key}: ${file} is a lazy import of the shell`);
  }
  for (const file of [BOOT_PRELOAD_APPLICATION, BOOT_PRELOAD_HOME]) assert.ok(existsSync(new URL(file, root)), file);
  const union = (name) => [...indexSource.match(new RegExp(`type ${name} =([^;]+);`))[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  for (const workspace of union('WorkspaceId')) if (workspace !== 'station-status') assert.ok(BOOT_PRELOAD_MODULES[workspace], `workspace ${workspace} has a preload key`);
  for (const module of union('StationModuleId')) assert.ok(BOOT_PRELOAD_MODULES[`station:${module}`], `維修中心 ${module} has a preload key`);
});

function runBootScript({ session = false, connection, search = '?workspace=material-requests', hash = '' } = {}) {
  const table = { files: ['assets/Auth.js', 'assets/Index.js', 'assets/Index.css', 'assets/Material.js', 'assets/Tracker.js', 'assets/Pcb.js', 'assets/Pcb.css'], application: [0], home: [1, 2], keys: { 'material-requests': [3], 'route:test-tracker': [4], 'pcb-designer': [5, 6, 1] } };
  const links = []; const listeners = {}; const idle = [];
  const store = new Map(session ? [[BOOT_PRELOAD_SESSION_POINTER, 'bringup-auth:tab'], ['bringup-auth:tab', '{"access_token":"x"}']] : []);
  const window = {
    location: { search, hash },
    sessionStorage: { getItem: (key) => store.get(key) ?? null },
    addEventListener: (name, listener) => { listeners[name] = listener; },
    requestIdleCallback: (callback) => { idle.push(callback); },
    setTimeout,
  };
  vm.runInNewContext(bootPreloadScript(table, '/station-status-hub/'), { window, document: { createElement: () => ({}), head: { appendChild: (link) => links.push(link) } }, navigator: { connection }, URLSearchParams });
  return { window, links, listeners, idle, hrefs: () => links.map((link) => link.href) };
}

test('a signed-in tab asks for the shell and its workspace at once; a signed-out one waits for an idle login page', () => {
  const signedIn = runBootScript({ session: true });
  assert.deepEqual(signedIn.hrefs(), ['/station-status-hub/assets/Auth.js', '/station-status-hub/assets/Index.js', '/station-status-hub/assets/Index.css', '/station-status-hub/assets/Material.js']);
  // Vite's own preloader skips a file that already has a link with exactly its href; the script link must be a modulepreload.
  assert.deepEqual(signedIn.links.map((link) => [link.rel, link.as ?? null, link.crossOrigin]), [['modulepreload', null, ''], ['modulepreload', null, ''], ['preload', 'style', ''], ['modulepreload', null, '']]);
  assert.ok(signedIn.links.every((link) => link.fetchPriority === undefined), 'files the page is waiting for keep their normal priority');

  const route = runBootScript({ session: true, hash: '#/test-tracker' });
  assert.deepEqual(route.hrefs(), ['/station-status-hub/assets/Auth.js', '/station-status-hub/assets/Tracker.js'], 'a hash route does not fetch the home page');

  const signedOut = runBootScript();
  assert.equal(signedOut.links.length, 0, 'nothing next to the login page while it loads');
  signedOut.listeners['station-app-ready']();
  assert.equal(signedOut.links.length, 0, 'not before the browser is idle');
  // requestIdleCallback hands its callback a deadline object: that must not be read as "with styles".
  signedOut.idle[0]({ didTimeout: false, timeRemaining: () => 10 });
  assert.deepEqual(signedOut.hrefs(), ['/station-status-hub/assets/Auth.js', '/station-status-hub/assets/Index.js', '/station-status-hub/assets/Material.js'], 'scripts only: a style nobody uses for a while is a console warning');
  assert.ok(signedOut.links.every((link) => link.fetchPriority === 'low'), 'nobody is waiting for them yet');

  for (const connection of [{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }]) {
    const slow = runBootScript({ connection });
    assert.equal(slow.listeners['station-app-ready'], undefined, `no idle preload on ${JSON.stringify(connection)}`);
    assert.equal(runBootScript({ session: true, connection }).links.length, 4, 'a signed-in tab needs the files anyway');
  }
  // Storage that throws (blocked cookies) is a signed-out tab, never an error on the page.
  assert.doesNotThrow(() => vm.runInNewContext(bootPreloadScript({ files: [], application: [], home: [], keys: {} }, '/'), { window: { location: { search: '', hash: '' }, get sessionStorage() { throw new Error('blocked'); }, addEventListener() {} }, document: {}, navigator: {}, URLSearchParams }));
});

test('the page can ask for one more workspace: its scripts are fetched once, never run, and nothing throws', () => {
  const page = runBootScript({ session: true });
  const before = page.links.length;
  page.window.__STATION_PRELOAD__('pcb-designer');
  assert.deepEqual(page.hrefs().slice(before), ['/station-status-hub/assets/Pcb.js'], 'the workspace script, without its style and without the home page that is already asked for');
  assert.ok(page.links.slice(before).every((link) => link.rel === 'modulepreload'), 'a modulepreload downloads and compiles, it does not run the module');
  assert.ok(page.links.slice(before).every((link) => link.fetchPriority === 'low'), 'a background download does not compete with the page on screen');
  page.window.__STATION_PRELOAD__('pcb-designer');
  page.window.__STATION_PRELOAD__('material-requests');
  assert.equal(page.links.length, before + 1, 'asked twice, or already asked at start: no second link');
  assert.doesNotThrow(() => page.window.__STATION_PRELOAD__('no-such-workspace'));
  assert.equal(page.links.length, before + 1);

  // The application side: a no-op where the table does not exist (dev server, tests).
  const previous = globalThis.window;
  const asked = [];
  try {
    globalThis.window = {};
    assert.doesNotThrow(() => requestCodePreload('pcb-designer'));
    globalThis.window = { __STATION_PRELOAD__: (key) => asked.push(key) };
    requestCodePreload('pcb-designer');
    assert.deepEqual(asked, ['pcb-designer']);
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  }
});

test('the private shell is still imported only after verification, revealed in one step, and the rest is only downloaded', () => {
  const app = read('src/App.tsx');
  assert.match(app, /recoverableLazy\(\(\) =>\s*import\("@\/components\/auth\/AuthenticatedApplication"\)\.then\(async \(module\) => \{\s*await module\.prepareAuthenticatedShell\?\.\(\);\s*return module;/);
  assert.doesNotMatch(app, /\.preload\(\)/, 'the entry never starts the private import by itself');
  assert.match(applicationSource, /export function prepareAuthenticatedShell\(\): Promise<void>/);
  assert.match(applicationSource, /Promise\.race\(\[page, new Promise<void>/, 'a slow first page cannot hold the shell back for good');
  assert.match(indexSource, /export function prepareInitialWorkspace\(\) \{\s*void preloadWorkspace\(getInitialWorkspace\(\), getInitialStationModule\(\)\)\.catch/);
  // Background preload: fetch-only, and keyed by the list of workspaces (the catalog object is rebuilt at every
  // permission refresh, which restarted the schedule for ever).
  assert.match(indexSource, /return scheduleIdleLoads\(keys\.map\(\(key\) => \(\) => requestCodePreload\(key\)\)\);\s*\}, \[permissionsLoading, preloadableWorkspaces\]\);/);
  assert.doesNotMatch(indexSource, /scheduleIdleLoads\([^;]*preloadWorkspace/, 'the background never imports (runs) a workspace');
  assert.match(indexSource, /useUnifiedData\(\{ demand: false \}\)/, 'the shell watches the test rows without loading them');
  // Where the inline script goes: after the charset declaration (a browser looks for it in the first 1024 bytes
  // only), before the style sheet link (an inline script after it waits for the sheet).
  const page = '<!DOCTYPE html>\n<html lang="zh-TW">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width" />\n    <script type="module" crossorigin src="/a/index.js"></script>\n    <link rel="stylesheet" crossorigin href="/a/core.css">\n  </head>\n  <body></body>\n</html>';
  const placed = placeBootPreloadScript(page, 'BOOT();');
  assert.ok(placed.indexOf('<meta charset') < placed.indexOf('<script>BOOT();</script>'));
  assert.ok(placed.indexOf('<script>BOOT();</script>') < placed.indexOf('<meta name="viewport"'));
  assert.ok(placed.indexOf('<script>BOOT();</script>') < placed.indexOf('rel="stylesheet"'));
  assert.equal(placed.replace('\n    <script>BOOT();</script>', ''), page, 'nothing else on the page changes');
  assert.match(placeBootPreloadScript('<html><head><title>x</title></head></html>', 'BOOT();'), /<head>\s*<script>BOOT\(\);<\/script><title>/, 'no charset declaration: first in the head');
  assert.match(read('index.html'), /<head>\s*<meta charset="UTF-8" \/>/, 'index.html declares its charset first');
});

test('lazy imports live only in the three hub modules, so no shared chunk names a page', () => {
  // Everything a hub statically needs is built into a layer chunk (scripts/stableChunks.ts). A dynamic import there
  // would write a page's hashed file name into the layer, and every deploy would rename every file again.
  const rootPath = fileURLToPath(root);
  const hubs = Object.values(STABLE_CHUNK_HUBS).flat().map((file) => path.resolve(rootPath, file));
  assert.equal(hubs.length, 4);
  for (const hub of hubs) assert.ok(existsSync(hub), `${hub} exists (a renamed hub silently restores the old chunk layout)`);
  const seen = new Set(); const offenders = [];
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    if (!hubs.includes(file)) {
      const walk = (node) => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) offenders.push(`${path.relative(rootPath, file)}: ${node.getText(source).slice(0, 80)}`);
        ts.forEachChild(node, walk);
      };
      walk(source);
    }
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || statement.importClause?.isTypeOnly || statement.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
      const base = specifier.startsWith('@/') ? path.resolve(rootPath, 'src', specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      const dependency = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`].find((candidate) => existsSync(candidate) && !candidate.endsWith('.css'));
      if (dependency && /\.(ts|tsx|js|mjs)$/.test(dependency)) visit(dependency);
    }
  };
  for (const hub of hubs) visit(hub);
  assert.ok(seen.size > 60, `walked the shell's static imports (${seen.size} modules)`);
  assert.deepEqual(offenders, [], 'a dynamic import() in a module the shell statically imports');
});

test('layer chunks come from where an ordinary build put the modules; hubs keep chunks of their own', () => {
  // Module ids as a build spells them on this machine (with a drive letter on Windows).
  const base = path.resolve('/r').replace(/\\/g, '/');
  const at = (file) => `${base}/${file}`;
  const probe = [
    // The entry chunk of an ordinary build: main and App with everything they really use (one icon, not the package).
    { fileName: 'assets/index-a.js', name: 'index', entryModuleId: at('index.html'), moduleIds: [at('index.html'), at('src/lib/history.ts'), at('node_modules/react/index.js'), at('node_modules/lucide-react/icons/log-in.js'), at('src/auth/UserContext.tsx'), at('src/App.tsx'), at('src/main.tsx')] },
    // The shell and home chunks also export shared modules to other chunks, so Rollup gives them no facadeModuleId:
    // a hub's chunk is found by the module it holds.
    { fileName: 'assets/Auth.js', name: 'AuthenticatedApplication', moduleIds: [at('src/hooks/usePermissions.ts'), at('src/components/auth/AuthenticatedApplication.tsx')] },
    { fileName: 'assets/Index.js', name: 'Index', moduleIds: [at('src/layout/Header.tsx'), at('node_modules/lucide-react/icons/bell.js'), `${at('src/pages/Index.tsx')}?v=1`] },
    { fileName: 'assets/Material.js', name: 'MaterialRequestPage', moduleIds: [at('node_modules/lucide-react/icons/boxes.js'), at('src/material/MaterialRequestPage.tsx')] },
    { fileName: 'assets/select.js', name: 'select', moduleIds: [at('src/ui/select.tsx')] },
    // Two shared chunks Rollup both calls "index", and one it happens to call "core".
    { fileName: 'assets/index-b.js', name: 'index', moduleIds: [at('node_modules/a/index.js')] },
    { fileName: 'assets/index-c.js', name: 'index', moduleIds: [at('node_modules/b/index.js')] },
    { fileName: 'assets/core-x.js', name: 'core', moduleIds: [at('node_modules/c/core.js')] },
  ];
  const layers = layersFromProbe(base, probe);
  const of = (name) => [...layers].filter(([, layer]) => layer === name).map(([id]) => id.replace(`${base}/`, '')).sort();
  assert.deepEqual(of('core'), ['node_modules/lucide-react/icons/log-in.js', 'node_modules/react/index.js', 'src/auth/UserContext.tsx', 'src/lib/history.ts']);
  assert.deepEqual(of('shell'), ['src/hooks/usePermissions.ts']);
  assert.deepEqual(of('home'), ['node_modules/lucide-react/icons/bell.js', 'src/layout/Header.tsx']);
  for (const hub of Object.values(STABLE_CHUNK_HUBS).flat()) assert.equal(layers.get(at(hub)), undefined, `${hub} keeps a chunk of its own`);
  assert.equal(layers.get(`${at('src/pages/Index.tsx')}?v=1`), undefined, 'a hub is a hub whatever query its id carries');
  assert.equal(layers.get(at('index.html')), undefined, 'the entry module stays with the entry: a named chunk that held it would become the entry chunk again');
  // Every other module is told the chunk Rollup gave it: a module left without one would be dragged into the first
  // named chunk that imports it (how every icon once ended up in the login page's chunk).
  assert.equal(layers.get(at('node_modules/lucide-react/icons/boxes.js')), 'MaterialRequestPage', 'an icon only a workspace uses stays with that workspace');
  assert.equal(layers.get(at('src/material/MaterialRequestPage.tsx')), 'MaterialRequestPage');
  assert.equal(layers.get(at('src/ui/select.tsx')), 'select');
  const shared = [layers.get(at('node_modules/a/index.js')), layers.get(at('node_modules/b/index.js')), layers.get(at('node_modules/c/core.js'))];
  assert.equal(new Set([...shared, 'core', 'shell', 'home']).size, 6, `chunks that share a name, or use a layer's, get names of their own: ${shared}`);
  assert.ok(shared.every((name) => /^(index|core)-[0-9a-z]+$/.test(name)), String(shared));
  assert.deepEqual([...layersFromProbe(base, [...probe].reverse())].sort(), [...layers].sort(), 'the names do not depend on the order of the chunks');
  assert.equal([...layers.keys()].length, probe.reduce((sum, chunk) => sum + chunk.moduleIds.length, 0) - 5, 'every module but the four hubs and the entry module has a chunk');
  // A hub that is gone, or no longer lazy (it sits in another hub's chunk): no layout at all rather than a wrong one.
  assert.equal(layersFromProbe(base, probe.filter((chunk) => chunk.fileName !== 'assets/Index.js')), null);
  assert.equal(layersFromProbe(base, [{ ...probe[0], moduleIds: [...probe[0].moduleIds, ...probe[1].moduleIds] }, probe[2], probe[3]]), null);

  // After the layout: who still imports a hub chunk statically (reported as a build warning).
  const built = [
    { ...probe[0], moduleIds: [at('src/App.tsx'), at('src/main.tsx')], imports: ['assets/core.js'] },
    { fileName: 'assets/core.js', name: 'core', moduleIds: [at('src/lib/history.ts')], imports: [] },
    { ...probe[1], imports: ['assets/core.js', 'assets/shell.js'] },
    { ...probe[2], imports: ['assets/core.js', 'assets/home.js'] },
    { ...probe[3], imports: ['assets/core.js', 'assets/home.js'] },
  ];
  assert.deepEqual(chunksImportingHubs(base, built), []);
  assert.deepEqual(chunksImportingHubs(base, [...built, { fileName: 'assets/Stray.js', name: 'Stray', moduleIds: [at('src/stray.ts')], imports: ['assets/Index.js'] }]), ['assets/Stray.js']);
});

test('background loads: one at a time, in order, a failure is skipped, cancel stops the rest, slow or metered connections are left alone', async () => {
  assert.equal(allowsBackgroundPreload(undefined), true, 'a desktop browser that does not report its connection');
  assert.equal(allowsBackgroundPreload(undefined, true), false, 'a phone or tablet that does not report it (iOS) may be on mobile data');
  assert.equal(allowsBackgroundPreload({ effectiveType: '4g' }), true);
  assert.equal(allowsBackgroundPreload({ effectiveType: '4g' }, true), true, 'a phone that reports a fast connection');
  for (const connection of [{ saveData: true }, { effectiveType: '3g' }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }]) assert.equal(allowsBackgroundPreload(connection), false, JSON.stringify(connection));

  const previous = globalThis.window;
  const host = (coarse) => ({ requestIdleCallback: (callback) => setTimeout(callback, 0), cancelIdleCallback: clearTimeout, matchMedia: () => ({ matches: coarse }) });
  try {
    globalThis.window = host(false);
    const order = [];
    let running = 0; let overlap = false;
    const finished = new Promise((resolve, reject) => {
      const load = (name, fail = false, last = false) => async () => {
        running += 1; if (running > 1) overlap = true;
        await new Promise((done) => setTimeout(done, 5));
        order.push(name); running -= 1;
        if (last) resolve();
        if (fail) throw new Error('offline');
      };
      scheduleIdleLoads([load('a'), load('b', true), load('c', false, true)], { startDelayMs: 0, gapMs: 0 });
      setTimeout(() => reject(new Error(`the loads did not finish: ${order}`)), 5000).unref();
    });
    await finished;
    assert.deepEqual(order, ['a', 'b', 'c']);
    assert.equal(overlap, false);

    const cancelled = [];
    const cancel = scheduleIdleLoads([async () => { cancelled.push(1); }, async () => { cancelled.push(2); }], { startDelayMs: 20, gapMs: 20 });
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.deepEqual(cancelled, [], 'nothing starts after cancel');

    // A touch device whose browser does not report the connection: nothing is scheduled at all.
    globalThis.window = host(true);
    const touch = [];
    scheduleIdleLoads([async () => { touch.push(1); }], { startDelayMs: 0, gapMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.deepEqual(touch, []);
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  }
});
