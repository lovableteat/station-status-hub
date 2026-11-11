const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const { chromium } = qa('playwright');
const lightboxCss = fs.readFileSync(require.resolve('yet-another-react-lightbox/styles.css'), 'utf8');

(async () => {
  // Actual application editor, only synthetic in-memory text, with no service client.
  const bundle = await require('esbuild').build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { RichTextEditor } from './src/components/ui/rich-text-editor';
      const initial = '<p><strong>原始段落</strong></p><table><tbody><tr><td><p>保留表格</p></td></tr></tbody></table><img src="https://fixture.supabase.invalid/storage/v1/object/public/issue-attachments/fixture/old.png" alt="原圖">';
      window.changes = [];
      function Fixture() {
        const [content, setContent] = useState(initial);
        return <RichTextEditor content={content} disableImageUpload onChange={value => { window.changes.push(value); setContent(value); }} />;
      }
      createRoot(document.getElementById('root')).render(<Fixture />);
    `, resolveDir: process.cwd(), loader: 'jsx' },
    bundle: true, write: false, jsx: 'automatic', format: 'iife', platform: 'browser',
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'source-alias', setup(build) {
      build.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, () => ({ path: 'fixture-client', namespace: 'isolated-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'isolated-fixture' }, () => ({ loader: 'js', contents: `
        export const SUPABASE_URL = 'https://fixture.supabase.invalid';
        const listeners = new Set();
        let signedIn = true;
        window.fixtureSignOut = () => { signedIn = false; for (const callback of listeners) callback('SIGNED_OUT', null); };
        window.fixtureSignIn = () => { signedIn = true; for (const callback of listeners) callback('SIGNED_IN', { user: { id: 'fixture' } }); };
        export const supabase = {
          auth: { onAuthStateChange(callback) { listeners.add(callback); return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } }; } },
          storage: { from() { return { async createSignedUrl() {
            if (!signedIn) return { error: new Error('fixture signed out') };
            return { data: { signedUrl: window.location.origin + '/signed-fixture.png?token=fixture' }, error: null };
          } }; } },
        };
      ` }));
      build.onResolve({ filter: /^@\// }, args => build.resolve(path.resolve('src', args.path.slice(2)), { resolveDir: process.cwd(), kind: args.kind }));
    } }],
  });
  if (process.env.AUDIT_BUILD_ONLY === '1') { console.log('PASS isolated rich-text browser fixture bundle'); return; }
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
    if (req.url.startsWith('/signed-fixture.png')) { res.setHeader('Content-Type', 'image/png'); res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Isolated rich text compatibility</title><style>' + lightboxCss + 'body{margin:20px}button{padding:8px}svg{width:18px;height:18px}[role=dialog]:not(.yarl__root){background:white;border:1px solid black;padding:20px;position:fixed;top:20px;left:20px;z-index:100}td{border:1px solid gray}</style><div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = process.env.AUDIT_CHROMIUM_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const editor = page.locator('.tiptap');
    await editor.waitFor();
    assert.equal(await editor.locator('strong').innerText(), '原始段落');
    assert.equal(await editor.locator('table').count(), 1);
    assert.equal(await editor.locator(':scope > p').count(), 1, 'no trailing paragraph is added to an existing document');
    assert.equal(await page.evaluate(() => window.changes.length), 0, 'opening the editor does not rewrite saved content');
    const before = await editor.innerHTML();
    await editor.locator('img').click();
    await page.locator('.yarl__slide img').waitFor();
    assert.match(await page.locator('.yarl__slide img').getAttribute('src'), /signed-fixture/);
    await page.evaluate(() => window.fixtureSignOut());
    await page.waitForFunction(() => !document.querySelector('.yarl__slide img'));
    await page.evaluate(() => window.fixtureSignIn());
    await page.locator('.yarl__slide img').waitFor();
    const closePreview = page.getByRole('button', { name: '關閉圖片預覽', exact: true });
    assert.equal(await closePreview.evaluate(button => button.closest('[inert]') === null), true, 'preview close remains in the interactive modal');
    if (process.env.AUDIT_SCREENSHOT_PATH) await page.screenshot({ path: process.env.AUDIT_SCREENSHOT_PATH.replace(/\.png$/, '-preview.png') });
    await closePreview.click();
    await page.waitForFunction(() => !document.querySelector('.yarl__slide img'));
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: '插入連結', exact: true }).click();
      await page.getByLabel('連結文字', { exact: true }).fill('未儲存內容');
      await page.getByLabel('連結網址', { exact: true }).fill('https://example.invalid');
      await page.getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(await editor.innerHTML(), before, 'cancelling repeated link dialogs retains content');
    }
    await editor.locator('strong').click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('更新');
    await page.waitForFunction(() => window.changes.at(-1)?.includes('更新'));
    assert.match(await page.evaluate(() => window.changes.at(-1)), /保留表格/);
    await page.getByRole('button', { name: '復原', exact: true }).click();
    await page.waitForFunction(() => !window.changes.at(-1)?.includes('更新'));
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await page.waitForFunction(() => window.changes.at(-1)?.includes('更新'));
    await editor.locator('td p').click();
    await page.getByRole('button', { name: '在下方插入行', exact: true }).click();
    assert.equal(await editor.locator('tr').count(), 2);
    assert.match(await page.evaluate(() => window.changes.at(-1)), /原始段落.*保留表格/);
    assert.deepEqual(errors, []);
    if (process.env.AUDIT_SCREENSHOT_PATH) await page.screenshot({ path: process.env.AUDIT_SCREENSHOT_PATH, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await editor.locator('img').click();
    await page.locator('.yarl__slide img').waitFor();
    assert.equal(await closePreview.evaluate(button => button.closest('[inert]') === null), true);
    if (process.env.AUDIT_SCREENSHOT_PATH) await page.screenshot({ path: process.env.AUDIT_SCREENSHOT_PATH.replace(/\.png$/, '-mobile-preview.png') });
    await closePreview.click();
    await page.waitForFunction(() => !document.querySelector('.yarl__slide img'));
    assert.deepEqual(errors, []);
    console.log('PASS actual RichTextEditor in Chromium: initial content, no mount write, private preview sign-out/in, desktop/mobile accessible close, repeated cancel, editing, undo/redo, table rows');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
