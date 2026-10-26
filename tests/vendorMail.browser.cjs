// Real vendor-mail UI; account/contact adapters below it are entirely local.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

(async () => {
  const bundled = await require('esbuild').build({
    entryPoints: ['tests/support/vendorMailFixture.jsx'], bundle: true, write: false,
    jsx: 'automatic', format: 'iife', platform: 'browser',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.BASE_URL': '"/"' },
    plugins: [{ name: 'vendor-mail-fixture', setup(build) {
      build.onResolve({ filter: /^@\/(components\/auth\/UserContext|integrations\/supabase\/client)$/ }, () => ({ path: path.resolve('tests/support/vendorMailMock.js') }));
      build.onResolve({ filter: /^@\// }, args => build.resolve(path.resolve('src', args.path.slice(2)), { resolveDir: process.cwd(), kind: args.kind }));
    } }],
  });
  const { default: postcssConfig } = await import('../postcss.config.js');
  const style = await require('postcss')(postcssConfig.plugins).process(
    fs.readFileSync('src/index.css', 'utf8').replace(/@import url\([^\n]+\n/g, ''),
    { from: path.resolve('src/index.css') },
  );
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'");
    if (req.url === '/fixture.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(bundled.outputFiles[0].text);
    } else if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>供應商信件隔離驗證</title><style>${style.css}</style></head><body style="margin:0;height:100dvh"><div id="root" style="height:100dvh"></div><script src="/fixture.js"></script></body></html>`);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(8094, '127.0.0.1', () => console.log('Isolated vendor mail QA: http://127.0.0.1:8094 (fake contacts only; no network/provider requests)'));
})().catch(error => { console.error(error); process.exitCode = 1; });
