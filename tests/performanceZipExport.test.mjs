import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { buildPerformanceArchive } from '../src/components/performance/performanceExportArchive.ts';
import { buildPerformanceHtml, downloadPerformanceZip } from '../src/components/performance/performanceExport.ts';
import { DEFAULT_PERFORMANCE_REVIEWS } from '../src/components/performance/performanceData.mjs';
import { SELF_PREFIX, serializeSelfAssessment, serializeManagerAssessment } from '../src/components/performance/rd2Assessment.mjs';

const attachment = (id, name, bytes = Buffer.from('Outlook test mail')) => ({ id, name, size: bytes.length,
  mimeType: 'message/rfc822', dataUrl: `data:message/rfc822;base64,${bytes.toString('base64')}` });
const person = (name = '甲同仁', number = '001') => ({ ...DEFAULT_PERFORMANCE_REVIEWS[0], employeeName: name,
  employeeId: number, contentLoaded: true, department: '研發部', role: '工程師', status: 'approved',
  selfFeedback: serializeSelfAssessment({ employeeNumber: number, grade: '23', sections: {
    IDP: { selfScore: 95, entries: [{ id: 'idp-1', text: '我建立工具，節省 80% 時間。', links: ['https://example.com/evidence'],
      attachments: [attachment('mail-1', '../../報告.eml'), attachment('mail-2', '../../報告.eml', Buffer.from('Second mail'))] }],
      images: [{ id: 'image-1', name: '測試圖片.png', dataUrl: 'data:image/png;base64,AQIDBA==' }] },
    OKR: { entries: [{ id: 'okr-1', text: '我改善跨部門流程。', attachments: [attachment('mail-3', '報告.eml', Buffer.from('Third mail'))] }] },
    KPI: { entries: [{ id: 'kpi-1', text: '我完成驗證。' }] },
  } }),
  managerFeedback: serializeManagerAssessment({ feedback: '主管整體回覆', workInstructions: '下一期工作指示',
    attachments: [attachment('overall', 'PRIVATE_OVERALL_ATTACHMENT.eml', Buffer.from('PRIVATE_OVERALL_BYTES'))],
    entryReviews: {
      IDP: { 'idp-1': { feedback: '目前正常回覆', returnRequested: false, attachments: [attachment('normal', '正常回覆.eml', Buffer.from('Normal manager mail'))] } },
      OKR: { 'okr-1': { feedback: 'PRIVATE_CURRENT_RETURN', returnRequested: true, attachments: [attachment('pending-return', 'PRIVATE_PENDING_RETURN.eml', Buffer.from('PRIVATE_PENDING_BYTES'))] } },
      KPI: { 'kpi-1': { feedback: '退回後重設旗標', returnRequested: false, attachments: [attachment('past-return', 'PRIVATE_HISTORY_ATTACHMENT.eml', Buffer.from('PRIVATE_HISTORY_BYTES'))] } },
    }, returnHistory: [{ id: 'return-event', returnedAt: '2026-10-01T12:00:00Z', reviewerName: '主管',
      overallFeedback: 'PRIVATE_RETURN_HISTORY', entries: [{ category: 'KPI', entryId: 'kpi-1', text: 'PRIVATE_OLD_STAR', feedback: 'PRIVATE_OLD_REASON',
        attachments: [attachment('past-return', 'PRIVATE_HISTORY_ATTACHMENT.eml', Buffer.from('PRIVATE_HISTORY_BYTES'))] }] }],
  }),
});

async function unzip(reviews, options = {}) {
  const blob = await buildPerformanceArchive(reviews, '2026-q3', options);
  assert.equal(blob.type, 'application/zip');
  return JSZip.loadAsync(await blob.arrayBuffer());
}
const filePaths = zip => Object.keys(zip.files).filter(path => !zip.files[path].dir);

test('one ZIP contains linked Excel homepage, HTML, copy text and exact selected evidence bytes without any network', async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = () => { networkCalls++; throw new Error('No external links should be fetched'); };
  try {
    const progress = [];
    const zip = await unzip([person('甲同仁')], { includeOverview: true, onProgress: message => progress.push(message) });
    assert.equal(networkCalls, 0);
    assert.ok(zip.file('績效考核.xlsx'));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await zip.file('績效考核.xlsx').async('uint8array'));
    assert.equal(workbook.worksheets[0].name, '人員總覽');
    const link = workbook.worksheets[0].getCell('A5').value;
    assert.equal(link.text, '甲同仁');
    const target = /^#'((?:[^']|'')+)'!A1$/.exec(link.hyperlink)[1].replaceAll("''", "'");
    assert.ok(workbook.getWorksheet(target));
    const html = await zip.file('績效考核.html').async('string');
    assert.match(html, /主管整體回覆|下一期工作指示/);
    assert.match(html, /https:\/\/example\.com\/evidence/);
    assert.doesNotMatch(html, /PRIVATE_/);
    const copy = await zip.file('一鍵複製_全部自評.txt').async('string');
    for (const category of ['IDP', 'OKR', 'KPI']) assert.ok(copy.includes(`【${category}】`));
    assert.match(copy, /我建立工具，節省 80% 時間/);
    assert.doesNotMatch(copy, /主管整體回覆|下一期工作指示|PRIVATE_/);
    const files = filePaths(zip);
    const evidence = files.filter(path => path.startsWith('佐證檔案/'));
    assert.equal(evidence.length, 4);
    const first = evidence.find(path => path.includes('實績-1/01-') && path.includes('/IDP/'));
    const second = evidence.find(path => path.includes('實績-1/02-'));
    assert.notEqual(first, second);
    assert.deepEqual(await zip.file(first).async('uint8array'), Uint8Array.from(Buffer.from('Outlook test mail')));
    assert.deepEqual(await zip.file(second).async('uint8array'), Uint8Array.from(Buffer.from('Second mail')));
    assert.deepEqual(await zip.file(evidence.find(path => path.endsWith('測試圖片.png'))).async('uint8array'), Uint8Array.from([1, 2, 3, 4]));
    assert.ok(files.every(path => !path.includes('\\') && !path.split('/').includes('..') && !path.startsWith('/')));
    const managerFiles = files.filter(path => path.startsWith('主管回覆附件/'));
    assert.equal(managerFiles.length, 1);
    assert.deepEqual(await zip.file(managerFiles[0]).async('uint8array'), Uint8Array.from(Buffer.from('Normal manager mail')));
    assert.doesNotMatch(files.join('\n'), /PRIVATE_/);
    assert.match(await zip.file('檔案索引與使用說明.txt').async('string'), /未下載外部網站/);
    assert.ok(progress.some(message => message.includes('壓縮檔案')));
  } finally { globalThis.fetch = originalFetch; }
});

test('self-only ZIP has no supervisor data and does not accidentally export an unselected person', async () => {
  const selected = person('../同仁/<>', '001');
  const unselected = person('UNSELECTED_PERSON', '002');
  assert.equal(unselected.contentLoaded, true);
  const zip = await unzip([selected], { selfOnly: true, includeOverview: true });
  const files = filePaths(zip);
  assert.ok(zip.file('員工自評.xlsx'));
  assert.ok(!files.some(path => path.startsWith('主管回覆附件/')));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await zip.file('員工自評.xlsx').async('uint8array'));
  assert.equal(workbook.worksheets.length, 1);
  assert.doesNotMatch(JSON.stringify(workbook.worksheets[0].getSheetValues()), /主管整體回覆|工作指示|PRIVATE_|UNSELECTED_PERSON/);
  for (const path of files.filter(path => /\.(txt|html)$/.test(path))) {
    assert.doesNotMatch(await zip.file(path).async('string'), /主管整體回覆|下一期工作指示|PRIVATE_|UNSELECTED_PERSON/);
  }
});

test('same employee names and duplicate file names keep separate safe member folders', async () => {
  const zip = await unzip([person('同名', '001'), person('同名', '001')]);
  const evidence = filePaths(zip).filter(path => path.startsWith('佐證檔案/'));
  assert.equal(evidence.length, 8);
  const folders = new Set(evidence.map(path => path.split('/')[1]));
  assert.equal(folders.size, 2);
  const copies = filePaths(zip).filter(path => path.startsWith('一鍵複製/'));
  assert.equal(copies.length, 2);
});

test('long evidence names retain usable file extensions after safe path truncation', async () => {
  const review = person();
  review.selfFeedback = serializeSelfAssessment({ sections: { IDP: { entries: [{ id: 'long', text: '成果',
    attachments: [attachment('long-file', `${'測'.repeat(180)}.eml`)] }] } } });
  const zip = await unzip([review]);
  const path = filePaths(zip).find(name => name.startsWith('佐證檔案/'));
  assert.ok(path.endsWith('.eml'));
  assert.ok(path.split('/').at(-1).length <= 123);
});

test('offline HTML offers selectable combined self text, safely escaping textarea and script boundaries', () => {
  const review = person('姓名 "> <script>');
  review.selfFeedback = serializeSelfAssessment({ sections: { IDP: { entries: [{ id: 'xss',
    text: '實績第一行\n</textarea><script>alert("secret")</script>\n成果第三行' }] }, OKR: { entries: [{ id: 'okr', text: '跨組成果' }] }, KPI: { entries: [{ id: 'kpi', text: '基本成果' }] } } });
  const html = buildPerformanceHtml([review], '2026-q3', { selfOnly: true });
  assert.match(html, /一鍵複製全部實績/);
  assert.match(html, /<details class="copy-text"[^>]*><summary>整合自評文字<\/summary><textarea readonly/);
  assert.match(html, /【IDP】[\s\S]*?【OKR】[\s\S]*?【KPI】/);
  assert.match(html, /實績第一行\n&lt;\/textarea&gt;&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert|<textarea[^>]*>[\s\S]*?<script>/);
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.match(html, /document\.execCommand\('copy'\)/);
  assert.doesNotMatch(/<script type="text\/javascript">([\s\S]*?)<\/script>/.exec(html)[1], /alert\(|window\.open\(/);
});

test('offline HTML copy reports success only after clipboard succeeds and selects inline text on denied copy', async () => {
  const html = buildPerformanceHtml([person()], '2026-q3', { selfOnly: true });
  const script = /<script type="text\/javascript">([\s\S]*?)<\/script>/.exec(html)[1];
  for (const clipboardWorks of [true, false]) {
    let handler, copiedText, focused = false, selected = false;
    const button = { disabled: false, getAttribute: () => 'performance-paste-0', addEventListener: (_event, callback) => { handler = callback; } };
    const field = { value: '【IDP】\n成果\n【OKR】\n成果\n【KPI】\n成果', focus() { focused = true; }, select() { selected = true; } };
    const status = { textContent: '' }, details = { open: false };
    const document = { querySelectorAll: () => [button], getElementById: id => id.endsWith('-status') ? status : id.endsWith('-details') ? details : field,
      execCommand: () => false };
    const navigator = { clipboard: { writeText: async value => { if (!clipboardWorks) throw new Error('denied'); copiedText = value; } } };
    runInNewContext(script, { document, navigator });
    await handler();
    assert.equal(button.disabled, false);
    if (clipboardWorks) { assert.equal(copiedText, field.value); assert.match(status.textContent, /已複製/); }
    else { assert.equal(focused, true); assert.equal(selected, true); assert.equal(details.open, true); assert.match(status.textContent, /請選取下方文字/); assert.doesNotMatch(status.textContent, /已複製/); }
  }
});

test('unloaded, malformed, missing or inconsistent evidence fails before any file download', async () => {
  const expected = person();
  const originalCreate = URL.createObjectURL;
  let downloads = 0;
  URL.createObjectURL = () => { downloads++; return 'blob:unexpected'; };
  try {
    await assert.rejects(downloadPerformanceZip([{ ...expected, contentLoaded: false }], '2026-q3'), /尚未讀取/);
    await assert.rejects(downloadPerformanceZip([], '2026-q3'), /沒有可匯出/);
    await assert.rejects(downloadPerformanceZip([{ ...expected, selfFeedback: SELF_PREFIX + '{invalid' }], '2026-q3'), /不完整/);
    for (const broken of [
      { ...attachment('missing', '不存在.eml'), dataUrl: '' },
      { ...attachment('bad-base64', '壞檔.eml'), dataUrl: 'data:message/rfc822;base64,dGVzd===' },
      { ...attachment('bad-size', '大小錯誤.eml'), size: 99 },
    ]) {
      const raw = { sections: { IDP: { entries: [{ id: 'bad-entry', text: '成果', attachments: [broken] }] } } };
      await assert.rejects(downloadPerformanceZip([{ ...expected, selfFeedback: SELF_PREFIX + JSON.stringify(raw) }], '2026-q3'), /無法讀取|不完整|不一致/);
    }
    const invalidImage = { sections: { IDP: { images: [{ id: 'bad', name: '壞圖片.png', dataUrl: 'https://example.com/image.png' }] } } };
    await assert.rejects(downloadPerformanceZip([{ ...expected, selfFeedback: SELF_PREFIX + JSON.stringify(invalidImage) }], '2026-q3'), /無法讀取/);
    assert.equal(downloads, 0);
  } finally { URL.createObjectURL = originalCreate; }
});

test('privacy revocation before generation and during compression prevents downloads', async () => {
  const originalCreate = URL.createObjectURL;
  let downloads = 0;
  URL.createObjectURL = () => { downloads++; return 'blob:unexpected'; };
  try {
    await assert.rejects(downloadPerformanceZip([person()], '2026-q3', { canDownload: () => false }), /資料保護/);
    for (const phase of ['建立 Excel', '壓縮檔案 ']) {
      let allowed = true;
      await assert.rejects(downloadPerformanceZip([person()], '2026-q3', { canDownload: () => allowed,
        onProgress: message => { if (message.startsWith(phase)) allowed = false; } }), /資料保護/);
    }
    assert.equal(downloads, 0);
  } finally { URL.createObjectURL = originalCreate; }
});

test('download action emits exactly one ZIP instead of separate report and attachment downloads', async () => {
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL, document: globalThis.document };
  let downloads = 0, clicks = 0, blob, filename;
  URL.createObjectURL = value => { downloads++; blob = value; return 'blob:zip-test'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = { createElement: () => ({ set download(value) { filename = value; }, click() { clicks++; }, remove() {} }), body: { appendChild() {} } };
  try {
    await downloadPerformanceZip([person()], '2026-q3');
    assert.equal(downloads, 1);
    assert.equal(clicks, 1);
    assert.match(filename, /^績效考核-2026-q3\.zip$/);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    assert.equal(filePaths(zip).filter(path => /\.(xlsx|html)$/.test(path)).length, 2);
  } finally { URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; globalThis.document = original.document; }
});
