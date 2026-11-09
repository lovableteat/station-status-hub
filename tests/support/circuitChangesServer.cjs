const { randomUUID } = require('node:crypto');

function createCircuitChangesServer() {
  const state = { sets: new Map(), items: new Map(), events: new Map(), files: new Map(), failedNames: new Set(), calls: [], conflictItem: null, sseDelivered: 0, pdfRegistries: new Map(), pdfVersions: new Map(), pdfOfficials: new Map(), pdfs: new Map(), pdfWrites: 0, pdfConflicts: 0, pdfWriteDelay: 0 };
  Object.assign(state, { inkRows: new Map(), inkCalls: [], inkWrites: 0, inkFailWrites: false, inkWriteDelay: 0 });
  const clients = new Set();
  let lastStamp = Date.now();
  const clone = value => structuredClone(value);
  const stamp = () => new Date(lastStamp = Math.max(Date.now(), lastStamp + 1)).toISOString();
  const actor = account => ({ id: account === 'B' || account === 'view' ? '00000000-0000-4000-8000-000000000002' : '00000000-0000-4000-8000-000000000001', name: account === 'B' ? 'QA 第二位同仁' : account === 'view' ? 'QA 唯讀' : 'QA 目前使用者' });
  const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
  const getItem = id => state.items.get(id) || fail(404, '找不到修改項目');
  function publish(setId) {
    const set = state.sets.get(setId);
    if (!set) return;
    set.updatedAt = stamp();
    for (const client of clients) {
      if (client.seriesId === set.seriesId && (!client.setId || client.setId === setId)) { client.res.write(`data: ${JSON.stringify({ setId, at: set.updatedAt })}\n\n`); state.sseDelivered++; }
    }
  }
  function record(item, type, account, note = '') {
    const who = actor(account), id = randomUUID();
    state.events.set(id, { id, itemId: item.id, setId: item.setId, type, actorId: who.id, actorName: who.name, revision: item.revision, note, snapshot: clone(item), createdAt: item.updatedAt });
    publish(item.setId);
  }
  const summary = item => ({ ...clone(item), content: { ...clone(item.content), images: [] }, imageCount: item.content.images.length });
  const metadata = event => { const { snapshot, ...data } = event; return clone(data); };
  function run(method, args, account) {
    state.calls.push({ method, args: clone(args), account });
    const writes = ['createCircuitChangeSet', 'saveCircuitChangeItem', 'actOnCircuitChangeItem', 'setCircuitChangeItemRemoved'];
    if (writes.includes(method) && account === 'view') fail(403, '目前帳號沒有料號申請編輯權限');
    if (method === 'listCircuitChangeSets') return [...state.sets.values()].filter(set => set.seriesId === args[0]).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
    if (method === 'createCircuitChangeSet') {
      const [context, title, fromLabel, toLabel] = args;
      if (!title?.trim()) fail(400, '請填寫批次名稱');
      const id = randomUUID(), at = stamp();
      const set = { id, seriesId: context.seriesId, workspaceId: context.workspaceId, projectId: context.projectId || null, title: title.trim(), fromLabel, toLabel, createdAt: at, updatedAt: at, createdBy: actor(account).id };
      state.sets.set(id, set); publish(id); return clone(set);
    }
    if (method === 'listCircuitChangeItems') return [...state.items.values()].filter(item => item.setId === args[0]).sort((a,b) => a.number - b.number).map(summary);
    if (method === 'getCircuitChangeItem') return clone(getItem(args[0]));
    if (method === 'saveCircuitChangeItem') {
      const [setId, id, expected, content] = args;
      if (!state.sets.has(setId)) fail(404, '找不到修改批次');
      const old = state.items.get(id);
      if (old?.removedAt) fail(409, '此修改已移除，請先還原後再操作');
      if (state.conflictItem === true || state.conflictItem === id) {
        state.conflictItem = null;
        fail(409, '這個修改項目已由其他人更新；你的草稿仍保留，請先對照最新內容。');
      }
      if ((old && (old.revision !== expected || old.setId !== setId)) || (!old && expected !== 0)) fail(409, '這個修改項目已由其他人更新；你的草稿仍保留，請先對照最新內容。');
      const at = stamp(), who = actor(account).id;
      const item = { id, setId, number: old?.number || Math.max(0, ...[...state.items.values()].filter(item => item.setId === setId).map(item => item.number)) + 1,
        content: clone(content), status: 'draft', revision: (old?.revision || 0) + 1,
        createdAt: old?.createdAt || at, updatedAt: at, createdBy: old?.createdBy || who, updatedBy: who };
      state.items.set(id, item); record(item, old ? 'edited' : 'created', account); return clone(item);
    }
    if (method === 'actOnCircuitChangeItem') {
      const [id, expected, action, note = ''] = args, item = getItem(id);
      if (item.removedAt) fail(409, '此修改已移除，請先還原後再操作');
      if (item.revision !== expected) fail(409, '這個修改項目已由其他人更新；你的草稿仍保留，請先對照最新內容。');
      if (action === 'submit') {
        if (!item.content.title.trim() || (!item.content.description.trim() && !item.content.images.some(image => image.side === 'after'))) fail(400, '送出 Review 前請填寫標題及修改說明，或加入修改後圖片');
        item.status = 'in_review';
      } else if (action === 'approve' || action === 'request_changes') {
        if (item.status !== 'in_review') fail(409, '此項目目前不在待 Review 狀態');
        if (action === 'request_changes' && !note.trim()) fail(400, '請填寫退回原因');
        item.status = action === 'approve' ? 'approved' : 'needs_changes';
      } else if (action !== 'comment' || !note.trim()) fail(400, '請填寫留言內容');
      item.revision++; item.updatedAt = stamp(); item.updatedBy = actor(account).id;
      record(item, ({submit:'submitted',approve:'approved',request_changes:'request_changes',comment:'comment'})[action], account, note);
      return clone(item);
    }
    if (method === 'setCircuitChangeItemRemoved') {
      const [id, expected, removed] = args, item = getItem(id);
      if (typeof removed !== 'boolean') fail(400, '移除或還原動作不正確');
      if (item.revision !== expected) fail(409, '這個修改項目已由其他人更新；請先對照最新內容。');
      if (Boolean(item.removedAt) === removed) return clone(item);
      item.removedAt = removed ? stamp() : undefined;
      item.removedBy = removed ? actor(account).id : undefined;
      item.revision++; item.updatedAt = stamp(); item.updatedBy = actor(account).id;
      record(item, removed ? 'removed' : 'restored', account); return clone(item);
    }
    if (method === 'listCircuitChangeEvents') return [...state.events.values()].filter(event => event.itemId === args[0]).sort((a,b) => b.revision - a.revision).map(metadata);
    if (method === 'getCircuitChangeEvent') return clone(state.events.get(args[0]) || fail(404, '找不到歷史修訂'));
    if (method === 'loadCircuitChangeItemsForExport') return args[0].map(id => clone(getItem(id)));
    if (method === 'loadCircuitChangeEventsForExport') return [...state.events.values()].filter(event => args[0].includes(event.itemId)).sort((a,b) => b.revision - a.revision).map(metadata);
    fail(404, `未知的 QA 方法 ${method}`);
  }
  async function body(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); }
  function json(res, status, value) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); }
  async function middleware(req, res, next) {
    const url = new URL(req.url, 'http://qa.local');
    if (!url.pathname.startsWith('/__circuit/')) return next();
    const account = String(req.headers['x-qa-account'] || url.searchParams.get('account') || 'A');
    try {
      if (url.pathname === '/__circuit/events') {
        res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' });
        res.write(': isolated circuit fixture\n\n');
        const client = { res, seriesId:url.searchParams.get('seriesId'), setId:url.searchParams.get('setId') || '' };
        clients.add(client); req.on('close', () => clients.delete(client)); return;
      }
      if (url.pathname === '/__circuit/api') {
        const { method, args = [] } = JSON.parse((await body(req)).toString());
        return json(res, 200, { data: run(method, args, account) });
      }
      if (url.pathname === '/__circuit/ink-preference') {
        const input = JSON.parse((await body(req)).toString()), {method,key,payload,version} = input;
        if (!String(key).startsWith('circuit-pdf-ink:')) fail(400, 'Invalid isolated ink preference key');
        state.inkCalls.push({method,key,account});
        const row = state.inkRows.get(key);
        if (method === 'select') return json(res, 200, {data:clone(row || null),error:null});
        if (account === 'view') return json(res, 200, {data:null,error:{code:'42501',message:'QA no ink edit permission'}});
        if (state.inkFailWrites) return json(res, 200, {data:null,error:{code:'QA503',message:'QA simulated ink save failure'}});
        if (state.inkWriteDelay) await new Promise(resolve=>setTimeout(resolve,state.inkWriteDelay));
        if (method === 'insert') {
          if (state.inkRows.has(key)) return json(res, 200, {data:null,error:{code:'23505',message:'QA ink row exists'}});
          state.inkRows.set(key,{...clone(payload),updated_at:stamp()}); state.inkWrites++;
          return json(res, 200, {data:null,error:null});
        }
        if (method === 'update') {
          if (state.inkRows.get(key)?.updated_at !== version) return json(res, 200, {data:[],error:null});
          state.inkRows.set(key,{...clone(payload),table_key:key}); state.inkWrites++;
          return json(res, 200, {data:[{table_key:key}],error:null});
        }
        fail(400,'Unknown isolated ink preference method');
      }
      if (url.pathname === '/__circuit/state') return json(res, 200, { sets:[...state.sets.values()], items:[...state.items.values()], events:[...state.events.values()], files:[...state.files.keys()],pdfRegistries:Object.fromEntries(state.pdfRegistries),pdfOfficials:Object.fromEntries(state.pdfOfficials),pdfs:[...state.pdfs.keys()],pdfWrites:state.pdfWrites,pdfConflicts:state.pdfConflicts, objects:[...state.files].map(([path,file])=>({path,size:file.bytes.length,type:file.mime})), calls:state.calls, sseDelivered:state.sseDelivered });
      if (url.pathname === '/__circuit/control') {
        const input = JSON.parse((await body(req)).toString() || '{}');
        if (input.action === 'reset') { for (const key of ['sets','items','events','files','pdfRegistries','pdfVersions','pdfOfficials','pdfs']) state[key].clear(); state.pdfWrites = 0; state.pdfConflicts = 0; state.pdfWriteDelay = 0; state.failedNames.clear(); state.calls.length = 0; state.conflictItem = null; state.sseDelivered = 0; }
        if (input.action === 'conflict_next_save') state.conflictItem = input.itemId || true;
        if (input.action === 'reset') { state.inkRows.clear(); state.inkCalls.length=0; state.inkWrites=0; state.inkFailWrites=false; state.inkWriteDelay=0; }
        if (input.action === 'pdf_write_delay') state.pdfWriteDelay = Number(input.ms) || 0;
        if (input.action === 'ink_fail_writes') state.inkFailWrites = Boolean(input.fail);
        if (input.action === 'ink_write_delay') state.inkWriteDelay = Number(input.ms) || 0;
        if (input.action === 'bump') { const item = getItem(input.itemId); item.content = {...item.content, ...(input.patch || {})}; item.revision++; item.updatedAt=stamp(); record(item,'edited','B'); }
        return json(res, 200, {ok:true});
      }
      if (url.pathname === '/__circuit/pdf-official') {
        const seriesId = url.searchParams.get('seriesId') || '';
        if (req.method === 'PUT') {
          if (account === 'view') fail(403, '目前帳號沒有設定官方基準權限');
          const { documentId } = JSON.parse((await body(req)).toString());
          const document = state.pdfRegistries.get(seriesId)?.documents?.find(row => row.id === documentId && !row.removedAt && !row.localOnly && row.path);
          if (!document) fail(400, '官方基準必須是這塊板子已儲存的 PDF');
          const who = actor(account), official = { documentId, document: clone(document), at: stamp(), by: who.id, byName: who.name, revision: (state.pdfOfficials.get(seriesId)?.revision || 0) + 1 };
          state.pdfOfficials.set(seriesId, official); return json(res, 200, { data: official });
        }
        return json(res, 200, { data: clone(state.pdfOfficials.get(seriesId) || null) });
      }
      // Schematic PDFs: the shared version list per board and the PDF files, like the preference row and the SPEC bucket.
      if (url.pathname === '/__circuit/pdf-registry') {
        const seriesId = url.searchParams.get('seriesId') || '';
        if (req.method === 'PUT') {
          if (account === 'view') fail(403, '目前帳號沒有料號申請編輯權限');
          const current = state.pdfVersions.get(seriesId) || 0;
          if (Number(url.searchParams.get('version')) !== current) { state.pdfConflicts++; fail(409, 'QA PDF 清單已被他人更新'); }
          // Optional delay between the check and the write, to make two saves overlap on purpose.
          const delay = state.pdfWriteDelay; if (delay) await new Promise(resolve => setTimeout(resolve, delay));
          if ((state.pdfVersions.get(seriesId) || 0) !== current) { state.pdfConflicts++; fail(409, 'QA PDF 清單已被他人更新'); }
          state.pdfRegistries.set(seriesId, JSON.parse((await body(req)).toString())); state.pdfVersions.set(seriesId, current + 1); state.pdfWrites++;
          return json(res, 200, { ok: true });
        }
        return json(res, 200, { data: state.pdfRegistries.has(seriesId) ? clone(state.pdfRegistries.get(seriesId)) : null, version: state.pdfVersions.get(seriesId) || 0 });
      }
      if (url.pathname === '/__circuit/pdf-object') {
        const path = url.searchParams.get('path') || '';
        if (!/^circuit-pdf\/[^/]+\/[^/]+\.pdf$/.test(path)) fail(400, 'QA PDF 路徑不符合儲存區規則');
        if (req.method === 'PUT') {
          if (account === 'view') fail(403, '目前帳號沒有上傳權限');
          if (state.pdfs.has(path)) fail(409, 'QA PDF 不得覆寫');
          state.pdfs.set(path, await body(req)); return json(res, 200, { data: { path } });
        }
        if (req.method === 'DELETE') { if (account === 'view') fail(403, '目前帳號沒有刪除權限'); state.pdfs.delete(path); return json(res, 200, { ok: true }); }
        const bytes = state.pdfs.get(path); if (!bytes) fail(404, '找不到 QA PDF');
        res.statusCode = 200; res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Cache-Control', 'no-store'); res.end(bytes); return;
      }
      if (url.pathname === '/__circuit/object') {
        const path = url.searchParams.get('path');
        if (!path) fail(400, 'Missing path');
        if (req.method === 'PUT') {
          if (account === 'view') fail(403, '目前帳號沒有圖片上傳權限');
          const [setId,itemId] = path.split('/');
          if (!state.sets.has(setId) || state.items.get(itemId)?.setId !== setId) fail(403,'QA 圖片必須屬於已建立的修改項目');
          const name = decodeURIComponent(String(req.headers['x-file-name'] || ''));
          if (name.startsWith('fail-once') && !state.failedNames.has(name)) { state.failedNames.add(name); fail(503, `QA 模擬上傳失敗 ${name}`); }
          if (state.files.has(path)) fail(409, 'QA 原檔不得覆寫');
          state.files.set(path, { bytes:await body(req), mime:String(req.headers['content-type'] || 'image/png') });
          return json(res,200,{data:{path}});
        }
        const file = state.files.get(path); if (!file) fail(404, '找不到 QA 圖片');
        res.statusCode = 200; res.setHeader('Content-Type',file.mime); res.setHeader('Cache-Control','no-store'); res.end(file.bytes); return;
      }
      fail(404,'QA endpoint not found');
    } catch (error) { json(res,error.status || 500,{error:error.message}); }
  }
  return { middleware, state, close() { for (const client of clients) client.res.end(); clients.clear(); } };
}
module.exports = { createCircuitChangesServer };
