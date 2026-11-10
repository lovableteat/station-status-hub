// Run materialWorkspace.browser.cjs first. Requests and edits stay in its isolated fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const origin = new URL(process.env.MATERIAL_QA_URL || 'http://127.0.0.1:8096').origin;
const evidence = path.resolve(process.env.MATERIAL_B_EVIDENCE_DIR || '../material-mobile-controls-evidence');
const rows = page => page.getByTestId('material-mobile-list-row');
const rowIds = page => rows(page).evaluateAll(elements => elements.map(element => element.dataset.recordId));

async function measure(page) {
  return page.evaluate(() => {
    const box = element => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; };
    const visible = element => element.getBoundingClientRect().width > 0;
    const records = [...document.querySelectorAll('[data-testid="material-mobile-list-row"]')];
    const controls = [...document.querySelectorAll('.material-mobile-titlebar button, .material-mobile-column-filters button')].filter(visible);
    const status = record => [...record.querySelector('[data-testid="material-mobile-row-tracking"]').children].map(element => {
      const r = box(element), row = box(record); return { x:r.x-row.x, y:r.y-row.y, w:r.w, h:r.h };
    });
    return { width:innerWidth, pageWidth:document.documentElement.scrollWidth,
      controls:controls.map(element => ({ name:element.getAttribute('aria-label') || element.innerText, ...box(element),
        hit:element.contains(document.elementFromPoint(box(element).x+box(element).w/2, box(element).y+box(element).h/2)) })),
      rows:records.map(element => ({ h:box(element).h, status:status(element),
        manufacturer:element.querySelector('.material-mobile-list-manufacturer')?.textContent,
        name:element.querySelector('.material-mobile-list-name')?.textContent })),
      contextStyle:(() => { const e=document.querySelector('.material-mobile-context'),s=getComputedStyle(e);return { border:s.borderTopWidth, background:s.backgroundColor }; })() };
  });
}

async function filter(page, name, option) {
  await page.getByRole('button', { name, exact:true }).tap();
  const panel = page.getByTestId('material-column-filter-panel');
  await panel.waitFor();
  await panel.getByRole('button', { name:'全不選', exact:true }).tap();
  const options=await panel.locator('label[style]').evaluateAll(elements=>elements.map(element=>({top:element.offsetTop,h:element.getBoundingClientRect().height})));
  assert.ok(options.length>0&&options.every((option,index)=>option.h===44&&(!index||option.top>=options[index-1].top+44)),JSON.stringify(options));
  await page.screenshot({path:path.join(evidence,`filter-${name.includes('Manufacturer')?'manufacturer':'status'}-${page.viewportSize().width}.png`)});
  const choice = option ? panel.getByRole('checkbox', { name:option, exact:true }) : panel.getByRole('checkbox').nth(1);
  await choice.check();
  const selected = await choice.getAttribute('aria-label');
  await panel.getByRole('button', { name:'確定', exact:true }).tap();
  await panel.waitFor({ state:'hidden' });
  await rows(page).first().waitFor();
  return selected;
}

async function run(browser, width) {
  const context = await browser.newContext({ viewport:{ width, height:884 }, deviceScaleFactor:1,
    isMobile:true, hasTouch:true, reducedMotion:'reduce', locale:'zh-TW', timezoneId:'Asia/Taipei' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [], result = { width, checks:[] };
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin + '/?qaMainRows&qaPages');
    await rows(page).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const originalIds = await rowIds(page);
    result.layout = await measure(page);
    assert.equal(result.layout.pageWidth,width);
    assert.ok(result.layout.controls.every(control => control.w >= 44 && control.h >= 44 && control.hit),JSON.stringify(result.layout.controls));
    assert.ok(result.layout.rows.every(row => row.h === 68 && row.manufacturer && row.name));
    assert.ok(result.layout.contextStyle.border !== '0px' && result.layout.contextStyle.background !== 'rgba(0, 0, 0, 0)');
    for (const row of result.layout.rows) assert.deepEqual(row.status,result.layout.rows[0].status,'status columns must stay aligned');
    const controls=result.layout.controls;
    for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++)assert.ok(
      controls[i].x+controls[i].w<=controls[j].x+.5 || controls[j].x+controls[j].w<=controls[i].x+.5 ||
      controls[i].y+controls[i].h<=controls[j].y+.5 || controls[j].y+controls[j].h<=controls[i].y+.5,'controls overlap');
    await page.screenshot({ path:path.join(evidence,`controls-${width}.png`) });
    result.checks.push('44px visible, hit-testable non-overlapping controls; 68px equal rows; aligned statuses and visible manufacturers');

    const switcher=page.getByRole('button',{name:'切換 BOM',exact:true}), picker=page.getByTestId('material-mobile-bom-picker');
    await switcher.tap();await picker.waitFor();
    await picker.locator('.material-mobile-bom-picker-option').filter({hasText:'QA 舊格式 BOM.xlsx'}).tap();await picker.waitFor({state:'hidden'});
    await page.waitForFunction(() => document.querySelector('.material-mobile-context')?.textContent.includes('QA 舊格式 BOM.xlsx'));
    assert.notDeepEqual(await rowIds(page),originalIds);
    await switcher.tap();await picker.locator('.material-mobile-bom-picker-option').filter({hasText:'QA 主板（僅隔離資料）'}).tap();await picker.waitFor({state:'hidden'});
    await page.waitForFunction(() => document.querySelector('.material-mobile-context')?.textContent.includes('QA 主板（僅隔離資料）'));
    assert.deepEqual(await rowIds(page),originalIds);
    await page.getByRole('button',{name:'新增料號',exact:true}).tap();
    const editor=page.locator('.material-record-dialog');await editor.waitFor();
    await editor.getByTestId('material-record-save-footer').getByRole('button',{name:'取消',exact:true}).tap();await editor.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'排序與工具',exact:true}).tap();
    const tools=page.getByTestId('material-mobile-tools');await tools.waitFor();await tools.getByRole('button',{name:'關閉排序與工具',exact:true}).tap();await tools.waitFor({state:'hidden'});
    assert.deepEqual(await rowIds(page),originalIds);result.checks.push('BOM switch changes records and returns; new editor cancel and tools close preserve records');

    await filter(page,'篩選狀態追蹤');
    const chips=page.getByTestId('material-active-filters').filter({visible:true});await chips.waitFor();
    const chipBoxes=await chips.locator('button').evaluateAll(elements=>elements.map(element=>({w:element.getBoundingClientRect().width,h:element.getBoundingClientRect().height})));
    assert.ok(chipBoxes.every(box=>box.w>=44&&box.h>=44),JSON.stringify(chipBoxes));
    await page.screenshot({path:path.join(evidence,`active-filter-${width}.png`)});
    await chips.getByRole('button',{name:/移除篩選：狀態追蹤/}).tap();await chips.waitFor({state:'hidden'});assert.deepEqual(await rowIds(page),originalIds);
    await filter(page,'篩選Manufacturer','QA MAIN CO');
    assert.ok((await rows(page).first().locator('.material-mobile-list-manufacturer').innerText()).includes('QA MAIN CO'));
    await rows(page).first().getByTestId('material-mobile-row-open').tap();
    const detail=page.getByTestId('material-mobile-detail');await detail.waitFor();assert.ok((await detail.innerText()).includes('QA MAIN CO'));
    await detail.getByRole('button',{name:'關閉料件詳情',exact:true}).tap();await detail.waitFor({state:'hidden'});
    await chips.getByRole('button',{name:'全部清除',exact:true}).tap();await chips.waitFor({state:'hidden'});assert.deepEqual(await rowIds(page),originalIds);
    result.checks.push('status and manufacturer filters apply; active chips clear individually/all; detail shows full manufacturer');

    const columns=page.getByTestId('material-column-visibility').filter({visible:true}).first(), settings=page.getByTestId('material-table-settings');
    await columns.tap();await settings.getByRole('checkbox',{name:'Manufacturer',exact:true}).uncheck();
    await settings.getByRole('button',{name:'取消',exact:true}).tap();await settings.waitFor({state:'hidden'});assert.equal(await page.locator('.material-mobile-list-manufacturer').count(),originalIds.length);
    await columns.tap();await settings.getByRole('checkbox',{name:'Manufacturer',exact:true}).uncheck();
    await settings.getByRole('button',{name:'套用設定',exact:true}).tap();await settings.waitFor({state:'hidden'});assert.equal(await page.locator('.material-mobile-list-manufacturer').count(),0);
    await columns.tap();await settings.getByRole('checkbox',{name:'Manufacturer',exact:true}).check();
    await settings.getByRole('button',{name:'套用設定',exact:true}).tap();await settings.waitFor({state:'hidden'});assert.equal(await page.locator('.material-mobile-list-manufacturer').count(),originalIds.length);
    assert.ok((await measure(page)).rows.every(row=>row.h===68));result.checks.push('manufacturer column cancel/apply/hide/show uses existing column settings without changing row height');

    await page.setViewportSize({width,height:500});
    const search=page.getByRole('textbox',{name:'快速搜尋料號',exact:true});await search.focus();await search.fill('QA-PHYSICAL-CAP');
    await page.waitForFunction(()=>document.querySelectorAll('[data-testid="material-mobile-list-row"]').length===1);
    const searchBox=await search.boundingBox();assert.ok(searchBox.y>=0&&searchBox.y+searchBox.height<=500);await search.fill('');await rows(page).first().waitFor();
    await page.getByRole('button',{name:'篩選Manufacturer',exact:true}).tap();
    const panel=page.getByTestId('material-column-filter-panel');await panel.waitFor();
    result.shortViewport=await panel.getByRole('button',{name:'確定',exact:true}).evaluate(element=>{const r=element.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{top:r.top,bottom:r.bottom,h:r.height,hit:element.contains(target)}});
    assert.ok(result.shortViewport.top>=0&&result.shortViewport.bottom<=500&&result.shortViewport.h>=44&&result.shortViewport.hit,JSON.stringify(result.shortViewport));
    await panel.getByRole('button',{name:'取消',exact:true}).tap();await panel.waitFor({state:'hidden'});result.checks.push('500px keyboard-height emulation keeps search and filter footer reachable');
    assert.deepEqual(errors,[]);result.errors=errors;result.result='passed';return result;
  } catch(error) {
    await page.screenshot({path:path.join(evidence,`failure-${width}.png`)}).catch(()=>{});throw error;
  } finally {await context.close();}
}

(async()=>{fs.mkdirSync(evidence,{recursive:true});const browser=await chromium.launch({channel:'chrome'}),report=[];
try{for(const width of[700,629,390])report.push(await run(browser,width));console.log('Mobile controls passed: 700/629/390, real button flows, filter clear/apply, columns and keyboard-height emulation');}
finally{fs.writeFileSync(path.join(evidence,'controls-report.json'),JSON.stringify(report,null,2));await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
