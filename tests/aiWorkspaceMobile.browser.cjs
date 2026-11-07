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

async function tapVisible(locator) {
  await locator.waitFor();
  const target = await locator.evaluate(async node => {
    const measureTarget = () => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        top: rect.top, bottom: rect.bottom,
        visibleTop: visualViewport.offsetTop, visibleBottom: visualViewport.offsetTop + visualViewport.height,
        hit: node.contains(hit),
        blockedBy: node.contains(hit) ? null : hit?.outerHTML.slice(0, 180),
      };
    };
    // Give the outgoing sheet a frame to release its modal backdrop.
    let result = measureTarget();
    const end = performance.now() + 500;
    while ((!result.hit || result.top < result.visibleTop || result.bottom > result.visibleBottom) && performance.now() < end) {
      await new Promise(requestAnimationFrame);
      result = measureTarget();
    }
    return result;
  });
  assert.ok(target.top >= target.visibleTop && target.bottom <= target.visibleBottom && target.hit,
    `button is visible and directly tappable ${await locator.textContent()} ${JSON.stringify(target)}`);
  await locator.tap();
}

async function checkPanels(page, width, height) {
  await page.goto(origin + '/?mobile&qaReference&qaEmptyPrompts');
  await page.getByRole('heading', { name: '先說結論' }).waitFor();
  const composer = page.getByRole('textbox', { name: inputLabel });
  const openLibrary = page.getByRole('button', { name: '開啟共享提示詞庫' });
  const library = page.getByRole('dialog', { name: '共享提示詞庫' });
  const closeLibrary = library.getByRole('button', { name: '關閉共享提示詞庫' });
  const createConversation = page.getByRole('button', { name: '建立新對話', exact: true });
  const reset = page.getByRole('dialog', { name: '建立新對話' });
  await composer.fill('保留這份草稿');
  await composer.blur();
  await createConversation.tap();
  await shot(page, `mobile-ai-new-chat-${width}x${height}`);
  await tapVisible(reset.getByRole('button', { name: '取消' }));
  assert.equal(await composer.inputValue(), '保留這份草稿');
  await openLibrary.tap();
  await library.getByText('尚未建立共享提示詞').waitFor();
  await shot(page, `mobile-ai-prompt-library-${width}x${height}`);
  await tapVisible(library.getByRole('button', { name: '建立第一個提示詞' }));
  const form = page.getByRole('dialog', { name: '建立共享提示詞' });
  await form.waitFor();
  await shot(page, `mobile-ai-prompt-form-${width}x${height}`);
  if (width !== 390) {
    await tapVisible(form.getByRole('button', { name: '取消' }));
    await createConversation.tap();
    await tapVisible(reset.getByRole('button', { name: '確認建立' }));
    assert.equal(await composer.inputValue(), '');
    return;
  }

  await form.getByLabel('分類', { exact: true }).fill('規格');
  await form.getByLabel('提示詞名稱').fill('規格欄位確認');
  await form.getByLabel('提示詞內容').fill('請列出額定電流與規格來源');
  await page.evaluate(() => window.qaSetVisualViewport(410, 20));
  await tapVisible(form.getByRole('button', { name: '儲存到提示詞庫' }));
  await form.waitFor({ state: 'hidden' });
  await page.evaluate(() => window.qaSetVisualViewport(null));

  await composer.tap();
  await page.evaluate(() => window.qaSetVisualViewport(430, 20));
  await waitForSendAboveKeyboard(page);
  await openLibrary.tap();
  await tapVisible(closeLibrary);
  await library.waitFor({ state: 'hidden' });
  await page.evaluate(() => window.qaSetVisualViewport(null));

  await openLibrary.tap();
  const search = library.getByRole('textbox', { name: '搜尋名稱或提示詞內容' });
  await search.tap();
  await page.evaluate(() => window.qaSetVisualViewport(400, 20));
  await search.fill('找不到的字');
  await library.getByText('找不到符合的提示詞').waitFor();
  await shot(page, 'mobile-ai-library-keyboard-390x844', { x: 0, y: 20, width, height: 400 });
  await tapVisible(library.getByRole('button', { name: '清除提示詞搜尋' }));
  await page.evaluate(() => window.qaSetVisualViewport(null));
  await library.getByRole('combobox', { name: '提示詞分類' }).tap();
  await page.getByRole('option', { name: '規格', exact: true }).tap();
  await library.getByRole('button', { name: '清除提示詞分類' }).waitFor();
  await tapVisible(library.getByRole('button', { name: '全部清除' }));

  await library.getByRole('button', { name: '編輯提示詞：規格欄位確認' }).tap();
  const edit = page.getByRole('dialog', { name: '編輯提示詞' });
  assert.equal(await edit.getByLabel('提示詞名稱').inputValue(), '規格欄位確認');
  await tapVisible(edit.getByRole('button', { name: '取消' }));
  await openLibrary.tap();
  await library.getByRole('button', { name: '調整後套用：規格欄位確認' }).tap();
  const adjust = page.getByRole('dialog', { name: '套用共享提示詞' });
  await adjust.getByLabel('本次要套用的內容').fill('只列出額定電流');
  await tapVisible(adjust.getByRole('button', { name: '放入輸入框' }));
  assert.equal(await composer.inputValue(), '只列出額定電流');
  await openLibrary.tap();
  await library.getByRole('button', { name: /規格欄位確認/ }).filter({ hasText: '規格欄位確認' }).tap();
  assert.equal(await composer.inputValue(), '請列出額定電流與規格來源');
  await composer.blur();

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '上傳 PDF、PPT、Excel、Word 或圖片' }).tap(),
  ]);
  await chooser.setFiles({ name: 'qa-panel.txt', mimeType: 'text/plain', buffer: Buffer.from('隔離測試') });
  const pendingAttachment = page.getByRole('button', { name: '移除附件 1' });
  await pendingAttachment.waitFor();
  await createConversation.tap();
  await reset.getByText('未送出的附件會移除。').waitFor();
  await tapVisible(reset.getByRole('button', { name: '確認建立' }));
  assert.equal(await composer.inputValue(), '');
  await pendingAttachment.waitFor({ state: 'hidden' });

  const openHistory = page.getByRole('button', { name: /開啟最近對話/ });
  const history = page.getByRole('dialog', { name: '最近對話' });
  await openHistory.tap();
  await shot(page, 'mobile-ai-history-390x844');
  await history.getByRole('button', { name: '編輯對話名稱：手機問答版面' }).tap();
  const rename = page.getByRole('dialog', { name: '編輯對話名稱' });
  await rename.getByRole('textbox', { name: '對話名稱' }).fill('手機介面確認');
  await tapVisible(rename.getByRole('button', { name: '儲存名稱' }));
  await openHistory.tap();
  await history.getByRole('button', { name: /手機介面確認.*gpt-5\.4/ }).tap();
  await history.waitFor({ state: 'hidden' });
  assert.equal(await composer.inputValue(), '請列出額定電流與規格來源');
  await page.getByRole('heading', { name: '先說結論' }).waitFor();

  const model = page.getByRole('combobox', { name: '選擇 API 金鑰與模型' });
  await model.tap();
  await page.getByRole('option', { name: /gpt-6\.1-sol.*單次使用/ }).tap();
  await model.getByText('gpt-6.1-sol', { exact: true }).waitFor();

  const openTools = page.getByRole('button', { name: '對話工具' });
  const tools = page.getByRole('dialog', { name: '對話工具' });
  await openTools.tap();
  await tools.getByRole('switch', { name: '啟用機台維修紀錄來源' }).tap();
  await tools.getByRole('button', { name: '選擇維修資料專案範圍' }).tap();
  const scope = page.getByRole('dialog', { name: '查詢專案範圍' });
  await scope.getByRole('button', { name: '全部選取' }).tap();
  await scope.getByRole('checkbox', { name: '選取專案 隔離測試專案' }).waitFor();
  assert.equal(await scope.getByRole('checkbox', { name: '選取專案 隔離測試專案' }).getAttribute('data-state'), 'checked');
  await tapVisible(scope.getByRole('button', { name: '完成選擇專案範圍' }));
  await tools.getByText('已選 1 個專案').waitFor();
  await tools.getByRole('button', { name: '製作 PPT' }).tap();
  const presentation = page.getByRole('dialog', { name: '製作 PPT' });
  await presentation.getByLabel('貼上文字或表格').fill('隔離測試的簡報來源');
  assert.ok(await presentation.getByRole('button', { name: '產生簡報' }).isEnabled());
  await shot(page, 'mobile-ai-presentation-390x844');
  await tapVisible(presentation.getByRole('button', { name: 'Close' }));
  await openTools.tap();
  await tools.getByRole('button', { name: '清空對話' }).tap();
  await tapVisible(reset.getByRole('button', { name: '取消' }));
  assert.equal(await composer.inputValue(), '請列出額定電流與規格來源');
}

async function checkModelSwitchNotice(page, width, height) {
  await page.goto(origin + '/?mobile&qaContext&qaMobile&qaMixedModels');
  await page.getByRole('heading', { name: '規格比對結果' }).waitFor({ state: 'attached' });
  const picker = page.getByRole('combobox', { name: '選擇 API 金鑰與模型' });
  const message = '已切換 API 金鑰與模型';
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: message });
  const mobile = width < 1024;
  const appearance = () => picker.evaluate(async element => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const style = getComputedStyle(element);
    return { border: style.borderColor, background: style.backgroundColor, shadow: style.boxShadow };
  });
  const idleAppearance = mobile ? await appearance() : null;
  const pick = async name => {
    const option = page.getByRole('option', { name });
    if (mobile) { await tapVisible(picker); await option.tap(); }
    else { await picker.click(); await option.click(); }
  };

  await pick(/隔離測試 OpenAI.*gpt-5\.4/);
  await picker.getByText(/gpt-5\.4/).waitFor();
  await page.getByText(message, { exact: true }).waitFor({ timeout: 2500 });
  if (!mobile) { await toast.waitFor(); return; }

  assert.equal(await toast.count(), 0, 'switching models should not show an overlapping toast on mobile');
  const notice = page.locator('[data-mobile-ai-model-notice]');
  const toolbar = page.locator('[data-mobile-ai-command-bar]');
  const reading = page.locator('[data-ai-reading-area]');
  const [row, banner, content] = await Promise.all([toolbar.boundingBox(), notice.boundingBox(), reading.boundingBox()]);
  assert.ok(row.y + row.height <= banner.y && banner.y + banner.height <= content.y + 1, 'notice stays between the toolbar and the reading area');
  await shot(page, `mobile-ai-model-notice-${width}x${height}`);
  assert.deepEqual(await appearance(), idleAppearance, 'the model picker loses its glow when the touch selection closes');

  if (width === 390) {
    const input = page.getByRole('textbox', { name: inputLabel });
    await input.tap();
    await input.fill('切換後保留這份草稿');
    await page.evaluate(() => window.qaSetVisualViewport(220, 16));
    await waitForSendAboveKeyboard(page);
    assert.equal(await notice.isVisible(), false, 'notice releases space on a short keyboard viewport');
    const { send } = await measure(page);
    assert.ok(send.hit, `send remains tappable with the keyboard open: ${JSON.stringify(send)}`);
    await input.blur();
    await page.evaluate(() => window.qaSetVisualViewport(null));
  }

  await pick(/隔離測試 Gemini.*gemini-3\.5-flash-lite/);
  await picker.getByText('gemini-3.5-flash-lite', { exact: true }).waitFor();
  await tapVisible(notice.getByRole('button', { name: '關閉 API 切換提示' }));
  await notice.waitFor({ state: 'hidden' });
  assert.equal(await picker.textContent(), 'gemini-3.5-flash-lite');
  assert.deepEqual(await appearance(), idleAppearance, 'touch dismissal must not leave a focus ring on the picker');
  if (width === 390) {
    assert.equal(await page.getByRole('textbox', { name: inputLabel }).inputValue(), '切換後保留這份草稿');
    await pick(/隔離測試 OpenAI.*gpt-5\.4/);
    await notice.waitFor();
    await notice.waitFor({ state: 'hidden', timeout: 6000 });
    assert.deepEqual(await appearance(), idleAppearance, 'the picker remains quiet after the notice expires');

    await picker.press('Enter');
    const options = page.getByRole('listbox');
    await options.waitFor();
    await page.keyboard.press('Escape');
    await options.waitFor({ state: 'hidden' });
    const focusedAppearance = await appearance();
    assert.ok(await picker.evaluate(element => document.activeElement === element && element.matches(':focus-visible')), 'keyboard closure restores visible focus');
    assert.notEqual(focusedAppearance.shadow, idleAppearance.shadow, 'the keyboard focus indicator remains visible');
  }
}

async function checkMoreLayout(page, width, height) {
  await page.goto(origin + '/?mobile&qaReference&qaMoreLayout');
  const dock = page.getByRole('navigation', { name: '手機工作區導覽' });
  const more = dock.getByRole('button', { name: '更多' });
  const sheet = page.getByRole('dialog', { name: '更多工作區' });
  const close = sheet.getByRole('button', { name: '關閉更多工作區' });
  const result = page.getByTestId('more-selection');
  await tapVisible(more);
  await sheet.waitFor();
  await shot(page, `more-workspaces-${width}x${height}`);

  const rowSpacing = await sheet.locator('[data-mobile-more-item]').evaluateAll(rows => rows.map(row => {
    const bounds = row.getBoundingClientRect();
    const icon = row.firstElementChild.getBoundingClientRect();
    const label = row.children[1].getBoundingClientRect();
    return { height: bounds.height, topGap: icon.top - bounds.top, bottomGap: bounds.bottom - icon.bottom, textFits: label.top >= bounds.top && label.bottom <= bounds.bottom };
  }));
  assert.equal(rowSpacing.length, 5);
  assert.ok(rowSpacing.every(row => row.height >= 54 && row.topGap >= 6 && row.bottomGap >= 6 && row.textFits), `every row leaves space around its icon and copy: ${JSON.stringify(rowSpacing)}`);
  const actions = sheet.getByRole('region', { name: '帳號與協作' });
  const first = await actions.getByRole('button', { name: '通知' }).boundingBox();
  const next = await actions.getByRole('button', { name: '線上人員' }).boundingBox();
  assert.ok(first.y === next.y && first.x + first.width < next.x, 'account and collaboration actions are grouped in two columns');

  const credentials = actions.getByRole('button', { name: '帳號與密碼' });
  await credentials.scrollIntoViewIfNeeded();
  await tapVisible(close);
  await sheet.waitFor({ state: 'hidden' });
  for (const [id, label] of width === 390 ? [
    ['file-uploads', '檔案上傳'], ['comparison', '比對系統'], ['data-center', 'Data Center'], ['pcb-designer', 'PCB Designer'], ['performance', '績效考核'],
  ] : [['performance', '績效考核']]) {
    await tapVisible(more);
    const workspace = sheet.getByRole('button', { name: new RegExp(label) });
    await workspace.scrollIntoViewIfNeeded();
    await tapVisible(workspace);
    await sheet.waitFor({ state: 'hidden' });
    assert.equal(await result.textContent(), `${id}/`);
  }
  await tapVisible(dock.getByRole('button', { name: 'AI 問答' }));
  if (width === 390) {
    for (const [id, label] of [
      ['notifications', '通知'], ['online', '線上人員'], ['admin-workspace', '後台管理'],
      ['assessment-backups', '我的自評備份'], ['personal-profile', '編輯大頭貼'], ['logout', '登出'],
    ]) {
      await tapVisible(more);
      const action = actions.getByRole('button', { name: label, exact: true });
      await action.scrollIntoViewIfNeeded();
      await tapVisible(action);
      await sheet.waitFor({ state: 'hidden' });
      assert.equal(await result.textContent(), `ai-chat/${id}`);
    }
  }
  await tapVisible(more);
  await credentials.scrollIntoViewIfNeeded();
  await tapVisible(credentials);
  const account = page.getByRole('dialog', { name: '測試帳號設定' });
  await tapVisible(account.getByRole('button', { name: '完成' }));
  await sheet.waitFor({ state: 'hidden' });
  assert.equal(await result.textContent(), 'ai-chat/own-credentials');
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
        if (process.argv.includes('--more-layout')) {
          await checkMoreLayout(page, width, height);
          assert.deepEqual(errors, []);
          console.log(`${browserName} ${width}×${height}: More workspace layout and actions`);
          continue;
        }
        if (process.argv.includes('--model-notice')) {
          await checkModelSwitchNotice(page, width, height);
          assert.deepEqual(errors, []);
          console.log(`${browserName} ${width}×${height}: dismissible API model notice`);
          continue;
        }
        if (process.argv.includes('--panels')) {
          await checkPanels(page, width, height);
          assert.deepEqual(errors, []);
          console.log(`${browserName} ${width}×${height}: mobile AI panels`);
          continue;
        }
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
    if (process.argv.includes('--more-layout')) return;
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    if (process.argv.includes('--model-notice')) {
      await checkModelSwitchNotice(desktop, 1440, 900);
      console.log(`${browserName} desktop: API model toast`);
      return;
    }
    await desktop.goto(origin + '/?mobile&qaReference');
    await desktop.getByRole('heading', { name: '先說結論' }).waitFor();
    if (process.argv.includes('--panels')) {
      await desktop.getByRole('button', { name: '開啟共享提示詞庫' }).click();
      const popover = desktop.locator('[data-ui="popover"]').filter({ hasText: '共享提示詞庫' });
      const prompt = popover.getByRole('button', { name: /附件重點整理/ }).filter({ hasText: '附件重點整理' });
      await prompt.hover();
      await desktop.getByTestId('prompt-hover-preview').getByText('完整提示詞').waitFor();
      await prompt.click();
      assert.equal(await desktop.getByRole('textbox', { name: inputLabel }).inputValue(), '請列出附件的主要重點');
      console.log(`${browserName} desktop: existing anchored prompt library`);
      return;
    }
    assert.ok(await desktop.locator('[data-mobile-app-header]').isVisible());
    assert.ok(await desktop.locator('[data-ai-composer-toolbar]').isVisible());
    assert.equal(await desktop.getByRole('button', { name: '複製回覆' }).count(), 0);
    await desktop.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
