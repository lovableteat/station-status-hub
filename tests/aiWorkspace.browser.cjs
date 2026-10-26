// Serves the real AI UI with isolated account/cloud/provider adapters for browser QA.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
(async () => {
  const bundled = await require('esbuild').build({ entryPoints: ['tests/support/aiWorkspaceFixture.jsx'], bundle: true, write: false, jsx: 'automatic', format: 'iife', platform: 'browser', define: { 'import.meta.env.DEV': 'false' }, plugins: [{ name: 'ai-fixture', setup(build) {
    build.onResolve({ filter: /^@\/(components\/auth\/UserContext|integrations\/supabase\/client)$/ }, () => ({ path: path.resolve('tests/support/aiWorkspaceMock.js') }));
    build.onResolve({ filter: /^@\// }, args => build.resolve(path.resolve('src', args.path.slice(2)), { resolveDir: process.cwd(), kind: args.kind }));
  } }] });
  const { default: postcssConfig } = await import('../postcss.config.js');
  const style = await require('postcss')(postcssConfig.plugins).process(fs.readFileSync('src/index.css', 'utf8').replace(/@import url\([^\n]+\n/g, ''), { from: path.resolve('src/index.css') });
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundled.outputFiles[0].text); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 問答隔離驗證</title><style>${style.css}</style><div id="root"></div><script src="/fixture.js"></script></html>`); }
  });
  server.listen(8093, '127.0.0.1', () => console.log('Isolated AI QA: http://127.0.0.1:8093 (no production data or paid provider requests)'));
})();
