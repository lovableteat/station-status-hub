// Run with tests/aiWorkspace.browser.cjs serving the isolated fixture.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const playwright = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const browserName = process.env.AI_QA_BROWSER || 'chromium';

const origin = process.env.AI_QA_URL || 'http://127.0.0.1:8093';
const screenshots = process.env.AI_QA_SCREENSHOTS_DIR;
const sendLabel = '送出查詢';
const inputLabel = '輸入查詢內容';
const viewportCases = [
  { width: 390, height: 844, minimumReading: 460 },
  { width: 320, height: 568, minimumReading: 200 },
  { width: 568, height: 320, minimumReading: 65 },
];

async function installVisualViewport(page) {
  await page.addInitScript(() => {
    let visual = null;
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => visual?.height ?? innerHeight },
      width: { get: () => innerWidth },
      offsetTop: { get: () => visual?.top ?? 0 },
      offsetLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, 'visualViewport', { get: () => viewport });
    window.qaSetVisualViewport = (height, top = 0) => {
      visual = height === null ? null : { height, top };
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
  });
}

async function measure(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[data-mobile-ai-command-bar]');
    const composer = document.querySelector('[data-mobile-ai-composer]');
    const send = document.querySelector('[aria-label="送出查詢"]');
    const sendRect = send.getBoundingClientRect();
    const sendHit = document.elementFromPoint(sendRect.x + sendRect.width / 2, sendRect.y + sendRect.height / 2);
    const scroller = document.querySelector('[data-ai-message-scroller]');
    return {
      width: innerWidth,
      docWidth: document.documentElement.scrollWidth,
      visibleBottom: visualViewport.height + visualViewport.offsetTop,
      toolbar: toolbar.getBoundingClientRect().height,
      composer: composer.getBoundingClientRect().height,
      reading: scroller?.clientHeight ?? 0,
      send: { width: sendRect.width, height: sendRect.height, bottom: sendRect.bottom, hit: !!sendHit && send.contains(sendHit), blockedBy: send.contains(sendHit) ? null : sendHit?.outerHTML.slice(0, 180) },
    };
  });
}

async function shot(page, name, clip) {
  if (screenshots) await page.screenshot({ path: path.join(screenshots, name + '.png'), animations: 'disabled', clip });
}

async function isInReadingArea(locator) {
  return locator.evaluate(node => {
    const parent = node.closest('[data-ai-message-scroller]').getBoundingClientRect();
    const bounds = node.getBoundingClientRect();
    return bounds.top >= parent.top && bounds.bottom <= parent.bottom;
  });
}

async function waitForSendAboveKeyboard(page) {
  await page.waitForFunction(() => {
    const send = document.querySelector('[aria-label="送出查詢"]');
    const gap = visualViewport.height + visualViewport.offsetTop - send.getBoundingClientRect().bottom;
    return gap >= 0 && gap < 24;
  }, undefined, { timeout: 3000 });
}

async function checkReferenceLayout(page, width, height) {
  await page.goto(origin + '/?mobile&qaReference');
  await page.getByRole('heading', { name: '先說結論' }).waitFor();
  assert.equal(await page.locator('[data-mobile-app-header]').isVisible(), false, 'the phone opens directly onto the chat header');
  const title = await page.getByRole('heading', { name: 'AI 問答', exact: true }).boundingBox();
  const model = await page.getByRole('combobox', { name: '選擇 API 金鑰與模型' }).boundingBox();
  assert.ok(title.height >= 16 && title.x + title.width <= model.x && title.y >= model.y && title.y + title.height <= model.y + model.height);
  const table = page.getByRole('table');
  assert.ok(await table.evaluate(node => node.parentElement.scrollWidth === node.parentElement.clientWidth), 'both columns are visible without scrolling sideways');
  assert.equal(await table.getByRole('cell', { name: '36', exact: true }).evaluate(node => getComputedStyle(node).textAlign), 'right');
  const send = page.getByRole('button', { name: sendLabel });
  assert.equal(await send.evaluate(node => getComputedStyle(node).borderRadius), '50%');
  await shot(page, `mobile-ai-reference-${width}x${height}`);
  if (width !== 390) return;

  const modelPicker = page.getByRole('combobox', { name: '選擇 API 金鑰與模型' });
  await modelPicker.tap();
  await page.getByRole('option', { name: /gpt-6\.1-sol.*單次使用/ }).tap();
  await modelPicker.getByText('gpt-6.1-sol', { exact: true }).waitFor();
  await modelPicker.tap();
  await page.getByRole('option', { name: /gpt-5\.4/ }).tap();
  await modelPicker.getByText('gpt-5.4', { exact: true }).waitFor();

  await page.getByRole('button', { name: '更多', exact: true }).tap();
  await page.getByRole('button', { name: '帳號與密碼' }).tap();
  await page.getByRole('dialog', { name: '測試帳號設定' }).getByRole('button', { name: '完成' }).tap();

  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.qaCopiedReply = text; } } }));
  const copy = page.getByRole('button', { name: '複製回覆' });
  const copyTarget = await copy.boundingBox();
  assert.ok(copyTarget.width >= 44 && copyTarget.height >= 44);
  await copy.tap();
  assert.match(await page.evaluate(() => window.qaCopiedReply), /先說結論/);
  const input = page.getByRole('textbox', { name: inputLabel });
  const reuse = page.getByRole('button', { name: '重填這個問題' });
  await input.fill('保留這份草稿');
  assert.ok(await reuse.isDisabled(), 'reuse cannot replace a draft');
  await input.fill('');
  await reuse.tap();
  assert.equal(await input.inputValue(), 'QA-731 的欄位要怎麼填？');
  assert.ok(await page.getByRole('heading', { name: '先說結論' }).isVisible());
}

(async () => {
  const browser = await playwright[browserName].launch({
    headless: true,
    ...(browserName === 'chromium' && process.platform === 'win32' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}),
  });
  try {
    for (const { width, height, minimumReading } of viewportCases) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      try {
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await installVisualViewport(page);
        if (width <= 390) await checkReferenceLayout(page, width, height);
        await page.goto(origin + '/?mobile&qaContext&qaMobile');
        const replyHeading = page.getByRole('heading', { name: '規格比對結果', exact: true });
        await replyHeading.waitFor({ state: 'attached' });
        const input = page.getByRole('textbox', { name: inputLabel });
        const send = page.getByRole('button', { name: sendLabel });
        await shot(page, `mobile-ai-after-${width}x${height}`);
        await input.fill('請確認額定電流');
        await input.blur();
        const normal = await measure(page);
        assert.equal(normal.docWidth, width, 'chat has no page-level horizontal overflow');
        assert.ok(normal.toolbar <= 60, `model and tools fit one row: ${JSON.stringify(normal)}`);
        assert.ok(normal.composer <= 84 && normal.reading >= minimumReading, `chat keeps usable reading space: ${JSON.stringify(normal)}`);
        assert.ok(normal.send.height >= 44 && normal.send.width >= 44 && normal.send.hit, JSON.stringify(normal));
        assert.ok(await isInReadingArea(replyHeading), 'a long reply starts at its heading');

        if (width === 390) {
          const end = page.getByRole('heading', { name: '規格查核結尾', exact: true });
          const scroller = page.locator('[data-ai-message-scroller]');
          if (browserName === 'webkit') {
            await scroller.evaluate(node => node.scrollBy(0, 700));
          } else {
            await scroller.hover();
            await page.mouse.wheel(0, 700);
          }
          await page.waitForFunction(() => {
            const end = document.querySelector('[data-ai-message-scroller] h3');
            return end && end.getBoundingClientRect().bottom <= end.closest('[data-ai-message-scroller]').getBoundingClientRect().bottom;
          });
          assert.ok(await isInReadingArea(end), 'the end of a long reply is reachable within the reading scroller');
          assert.equal(await page.evaluate(() => window.scrollY), 0);

          const initialInputHeight = (await input.boundingBox()).height;
          await input.fill('這是第一行\n這是第二行\n這是第三行');
          assert.ok((await input.boundingBox()).height > initialInputHeight, 'multi-line drafts expand the composer');
          await input.fill('請確認額定電流');
          assert.equal((await input.boundingBox()).height, initialInputHeight);

          const model = page.getByRole('combobox', { name: '選擇 API 金鑰與模型' });
          await model.tap();
          await page.getByRole('option', { name: /gemini-3\.5-flash-lite/ }).tap();
          await model.getByText('gemini-3.5-flash-lite', { exact: true }).waitFor({ timeout: 3000 });
          await page.getByRole('button', { name: /開啟最近對話/ }).tap();
          await page.getByRole('button', { name: '編輯對話名稱：PDF 與上文接續驗證' }).waitFor();
          await page.getByRole('button', { name: '關閉最近對話' }).tap();
          const tools = page.getByRole('button', { name: '對話工具' });
          await tools.tap();
          const sheet = page.getByRole('dialog', { name: '對話工具' });
          await sheet.getByRole('button', { name: '製作 PPT' }).tap();
          await page.getByRole('dialog', { name: '製作 PPT' }).getByRole('button', { name: 'Close' }).tap();
          await tools.tap();
          await sheet.getByRole('button', { name: /聊天室.*3 則未讀/ }).tap();
          assert.equal(await page.getByLabel('聊天室開啟次數').textContent(), '1');
          await tools.tap();
          const maintenance = sheet.getByRole('switch', { name: '啟用機台維修紀錄來源' });
          const material = sheet.getByRole('switch', { name: '啟用料號與 SPEC 來源' });
          await maintenance.tap();
          await sheet.getByRole('button', { name: '選擇維修資料專案範圍' }).tap();
          const project = page.getByRole('checkbox', { name: '選取專案 隔離測試專案' });
          await project.waitFor();
          await page.getByRole('button', { name: '完成選擇專案範圍' }).tap();
          await project.waitFor({ state: 'hidden' });
          await material.tap();
          await sheet.getByRole('option', { name: '隔離測試 BOM' }).waitFor({ state: 'attached' });
          assert.ok(await sheet.getByRole('button', { name: '更新全員 API 用量' }).isEnabled());
          await shot(page, 'mobile-ai-tools-390x844');
          await sheet.getByRole('button', { name: '關閉對話工具' }).tap();
          await page.getByText('已啟用 維修資料、料號／SPEC', { exact: true }).waitFor();
          await tools.tap();
          await maintenance.tap();
          await material.tap();
          await sheet.getByRole('button', { name: '清空對話' }).tap();
          const reset = page.getByRole('dialog', { name: '建立新對話' });
          await reset.getByRole('button', { name: '取消' }).tap();

          await page.getByRole('button', { name: '開啟共享提示詞庫' }).tap();
          await page.getByText('共享提示詞庫', { exact: true }).waitFor();
          await page.getByRole('button', { name: '關閉共享提示詞庫' }).tap();
          const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.getByRole('button', { name: '上傳 PDF、PPT、Excel、Word 或圖片' }).tap(),
          ]);
          await chooser.setFiles({ name: 'qa-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('隔離測試') });
          await page.getByRole('button', { name: '移除附件 1' }).tap();

          await input.tap();
          await input.fill('延續前面的料件和 PDF，請確認額定電流');
          await page.evaluate(() => window.qaSetVisualViewport(220, 16));
          await waitForSendAboveKeyboard(page);
          const shortKeyboard = await measure(page);
          assert.equal(shortKeyboard.toolbar, 0);
          assert.ok(shortKeyboard.send.hit && shortKeyboard.send.bottom <= shortKeyboard.visibleBottom, JSON.stringify(shortKeyboard));
          await page.evaluate(() => window.qaSetVisualViewport(480, 20));
          await waitForSendAboveKeyboard(page);
          const keyboard = await measure(page);
          assert.ok(keyboard.send.hit && keyboard.send.bottom <= keyboard.visibleBottom, JSON.stringify(keyboard));
          await shot(page, 'mobile-ai-keyboard-390x844', { x: 0, y: 20, width, height: 480 });
          await input.blur();
          assert.ok((await measure(page)).send.bottom <= keyboard.visibleBottom, 'send must stay reachable during keyboard dismissal');
          await send.tap();
          await page.evaluate(() => window.qaSetVisualViewport(null));
          await page.getByText(/本次請求已包含第 1 則資料、先前 PDF 原檔及後續追問/).waitFor();
          assert.ok(await isInReadingArea(page.getByRole('heading', { name: '續問驗證完成' })));
          assert.equal(await page.locator('[data-ai-chat-keyboard]').count(), 0);
          console.log('390px: visual-only keyboard resize, reachable send and real chat flow through the isolated provider');
        }
        assert.deepEqual(errors, []);
        console.log(`${browserName} ${width}×${height}: ${normal.reading}px reading area, ${normal.composer}px composer`);
      } finally {
        await context.close();
      }
    }
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await desktop.goto(origin + '/?mobile&qaReference');
    await desktop.getByRole('heading', { name: '先說結論' }).waitFor();
    assert.ok(await desktop.locator('[data-mobile-app-header]').isVisible());
    assert.ok(await desktop.locator('[data-ai-composer-toolbar]').isVisible());
    assert.equal(await desktop.getByRole('button', { name: '複製回覆' }).count(), 0);
    await desktop.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
