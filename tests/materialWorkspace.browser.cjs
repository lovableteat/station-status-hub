// Real page and editors with local-only storage, permissions and collaboration adapters.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
(async () => {
  const mock = path.resolve('tests/support/materialWorkspaceMock.js');
  const bundle = await require('esbuild').build({ entryPoints: ['tests/support/materialWorkspaceFixture.jsx'], bundle: true, write: false, jsx: 'automatic', format: 'iife', platform: 'browser', define: { 'import.meta.env.DEV': 'false', 'import.meta.env.BASE_URL': '"/"' }, plugins: [{ name: 'isolated-material-workspace', setup(build) {
    build.onResolve({ filter: /^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider|integrations\/supabase\/client)$/ }, () => ({ path: mock }));
    build.onResolve({ filter: /^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/ }, () => ({ path: mock }));
    build.onResolve({ filter: /^@\// }, args => build.resolve(path.resolve('src', args.path.slice(2)), { resolveDir: process.cwd(), kind: args.kind }));
  } }] });
  const { default: config } = await import('../postcss.config.js');
  const style = await require('postcss')(config.plugins).process(fs.readFileSync('src/index.css', 'utf8').replace(/@import url\([^\n]+\n/g, ''), { from: path.resolve('src/index.css') });
  const port = Number(process.env.MATERIAL_QA_PORT || 8096);
  http.createServer((req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src data:; base-uri 'none'");
    res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html; charset=utf-8');
    res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : `<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><title>料號工作區隔離驗證</title><style>${style.css}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
  }).listen(port, '127.0.0.1', () => console.log(`Material QA ready: http://127.0.0.1:${port} (no production reads or writes)`));
})().catch(error => { console.error(error); process.exitCode = 1; });
