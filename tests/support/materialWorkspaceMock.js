import seed from '../../src/data/materialRequestSeed.json';
import { useSyncExternalStore } from 'react';
import { supplierSearchContacts } from './supplierSearchCases.js';
import { supabase as baseSupabase } from './vendorMailMock';

let user = { userId: '00000000-0000-4000-8000-000000000001', username: 'qa', displayName: 'QA 目前使用者', role: 'admin', access: 'edit' };
const accountListeners = new Set();
const subscribeAccount = listener => { accountListeners.add(listener); return () => accountListeners.delete(listener); };
const getAccount = () => user;
export const setQaMaterialAccount = (access, secondAccount = false) => {
  user = { ...user, access, userId: secondAccount ? '00000000-0000-4000-8000-000000000002' : '00000000-0000-4000-8000-000000000001', displayName: secondAccount ? 'QA 第二位同仁' : 'QA 目前使用者', role: access === 'edit' ? 'admin' : 'engineer' };
  accountListeners.forEach(listener => listener());
};
const project = { id: 'qa-project', name: 'QA 專案', status: 'active' };
const projects = [project];
const editorsByRecordId = new Map();
const files = new Map();
const privateMarks = new Map();
export const useUser = () => ({ user: useSyncExternalStore(subscribeAccount, getAccount), sessionMode: 'authenticated', isRealtimeAuthenticated: true });
export const usePermissions = () => {
  const account = useSyncExternalStore(subscribeAccount, getAccount);
  return { canEditModule: () => account.access === 'edit', canViewModule: () => account.access !== 'none' };
};
export const useTestProject = () => ({ activeProject: project, activeProjectId: project.id, allProjects: projects, projects });
export const useMaterialBomPresence = () => ({ editorsByRecordId, onlineUserCount: 2 });
export const logMaterialRecordChange = () => {};
export const logMaterialReportExport = () => {};
export const logMaterialWorkspaceAction = () => {};
export const supabase = { ...baseSupabase, from(table) {
  if (table === 'material_personal_marks') {
    const filters={}; let method='select',payload;
    const query={select(){return this},eq(key,value){filters[key]=value;return this},in(key,values){filters[key]=values;return this},order(){return this},range(){return this},abortSignal(){return this},
      upsert(row){method='upsert';payload=row;return this},delete(){method='delete';return this},
      then(resolve,reject){return Promise.resolve().then(()=>{
        const rows=Array.isArray(payload)?payload:[payload];
        const owner=rows[0]?.owner_id??filters.owner_id;
        if(owner!==user.userId||user.access==='none')return{data:[],error:new Error('QA owner boundary')};
        const workspace=rows[0]?.workspace_id??filters.workspace_id;
        const key=JSON.stringify([owner,workspace]);const marks=privateMarks.get(key)??new Set();
        if(method==='upsert')rows.forEach(row=>marks.add(row.group_key));
        if(method==='delete')(Array.isArray(filters.group_key)?filters.group_key:[filters.group_key]).forEach(key=>marks.delete(key));
        privateMarks.set(key,marks);return{data:[...marks].map(group_key=>({group_key})),error:null};
      }).then(resolve,reject)}};return query;
  }
  if (table !== 'company_supplier_contacts') return baseSupabase.from(table);
  let range = [0, 499];
  return { select() { return this; }, order() { return this; }, range(a,b) { range=[a,b]; return this; }, abortSignal() { return this; },
    then(resolve,reject) { return Promise.resolve({data:structuredClone(supplierSearchContacts.slice(range[0],range[1]+1)),error:null}).then(resolve,reject); } };
}, rpc: async name => name === "list_active_collaboration_members" ? { data: [{user_id:user.userId, username:user.username, display_name:user.displayName}, {user_id:"00000000-0000-4000-8000-000000000002", username:"ce", display_name:"CE 王同學"}], error:null } : { data: [], error:null }, storage: { from() { return {
  async upload(path, file) { files.set(path, file); return { error: null }; },
  async createSignedUrl(path) { return files.has(path) ? { data: { signedUrl: URL.createObjectURL(files.get(path)) } } : { error: new Error('QA file not found') }; },
  async remove(paths) { paths.forEach(path => files.delete(path)); return { error: null }; },
}; } } };

// Rows 7 and 10 have no part numbers (pending applications); row 8 is owned by CE and mid-application.
const hasPart = (index) => index > 1 && index !== 7 && index !== 10;
const makeRecord = (ref, index, overrides = {}) => ({
  ...seed.records[0], id: `qa-${index}`, level: 2, sourceGroupKey: ref, isGroupStart: true,
  refGroup: ref, refDes: ref, name: index === 5 ? 'IND 3.5uH 0402' : `RES 10K 1% 0402 ${ref}`, qty: 1,
  manufacturer: index % 2 ? 'QA Vendor B' : 'QA Vendor A', manufacturerPartNumber: `QA-MPN-${index}`,
  virtualAlternative: hasPart(index) ? '000-VIRTUAL' : '', partNumber: hasPart(index) ? `000-PHYSICAL-${index}` : '',
  requestOwnerId: index === 8 ? '00000000-0000-4000-8000-000000000002' : undefined, requestOwnerName: index === 8 ? 'CE 王同學' : undefined,
  partName: 'QA 公司料名', partSpec: '10K 1% 0402', assemblyName: 'QA 原始模組', remark: 'QA 原始備註保留',
  trackingStatus: index === 8 ? 'SYMBOL申請中' : index === 0 ? '處理中' : '', trackingHistory: [], trackingNote: '', sourcingStatus: 'Approved', ...overrides,
});
const records = ['R1', 'R1', 'PR1', 'R10', 'R1_C0P1', 'LB48', 'C1', 'J1', 'U1', 'J2', 'J2'].map((ref, index) => makeRecord(ref, index));
if (new URLSearchParams(window.location.search).has('qaMainRows')) {
  const shared={name:'QA MERGED CAP 10uF',partNumber:'QA-PHYSICAL-CAP',virtualAlternative:'QA-VIRTUAL-CAP',manufacturer:'QA MAIN CO',manufacturerPartNumber:'QA-MAIN-CAP',partSpec:'CAP 10uF',pcbFootprint:'C0402'};
  records.push(makeRecord('C101_CP1',101,{...shared,qty:2}),makeRecord('C101_CP1',102,{...shared,isGroupStart:false,manufacturer:'ALT ONLY VENDOR',manufacturerPartNumber:'QA-ALT-VIRTUAL',virtualAlternative:'QA-ALT-VIRTUAL'}),
    makeRecord('C202_CP2',103,{...shared,qty:3}),makeRecord('C202_CP2',104,{...shared,isGroupStart:false,manufacturer:'ALT ONLY VENDOR',manufacturerPartNumber:'QA-ALT-FOOTPRINT',virtualAlternative:''}),
    makeRecord('C202_CP2',105,{...shared,isGroupStart:false,manufacturer:'ALT ONLY VENDOR',manufacturerPartNumber:'QA-ALT-NO-FOOTPRINT',virtualAlternative:'',pcbFootprint:''}),
    makeRecord('C202_CP2',106,{...shared,isGroupStart:false,manufacturer:'ALT ONLY VENDOR',manufacturerPartNumber:'QA-ALT-ODM',partUsageStatus:'新設計產品不建議使用 - ODM'}));
}
if (new URLSearchParams(window.location.search).has('qaPages')) {
  records.push(...Array.from({ length: 30 }, (_, index) => makeRecord(`R${100 + index}`, 11 + index)));
}
records[0].trackingHistory = [
  { id: 'qa-history-old', status: '已發信', createdAt: '2026-10-27T02:13:40Z', createdBy: 'QA 同仁', requestInfo: '等待廠商回覆', note: 'QA 歷史紀錄保留' },
  { id: 'qa-history-latest', status: '文件已收齊', createdAt: '2026-10-30T09:10:56Z', createdBy: 'QA 工程師（跨部門料件申請與追蹤測試）', requestInfo: '文件已收齊，準備申請', note: '' },
];
// V1 of the same board: C1/J1/U1/J2 are missing, R10 had qty 2 and an old vendor, and a tracked U9 was dropped in V2.
const previousRecords = [
  ...['R1', 'R1', 'PR1'].map((ref, index) => makeRecord(ref, index)),
  makeRecord('R10', 3, { qty: 2, manufacturer: 'QA Vendor OLD', manufacturerPartNumber: 'QA-MPN-OLD' }),
  makeRecord('R1_C0P1', 4), makeRecord('LB48', 5),
  makeRecord('U9', 9, { name: 'IC removed in V2', manufacturerPartNumber: 'QA-MPN-U9', partNumber: '000-PHYSICAL-U9', trackingStatus: '處理中', trackingHistory: [{ id: 'tracking-qa-u9', status: '處理中', note: 'QA 追蹤：等待申請', createdAt: '2026-10-01T00:00:00.000Z', createdBy: 'QA' }] }),
];
const seriesId = 'series:qa';
const stamp = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const workspace = {
  id: 'bom:qa-board:v2:qa0002', name: 'QA 主板（僅隔離資料）', updatedAt: stamp(1), project: { projectId: project.id, projectName: project.name },
  payload: { ...seed, sourceFile: 'QA_主板_v2.xlsx', sheetName: 'QA', records, recordCount: records.length }, recordMeta: {},
  version: { seriesId, seriesName: 'QA 主板（僅隔離資料）', versionNumber: 2, label: 'EVT rev B', note: 'QA：移除 U9、新增 C1／J1／U1／J2、R10 改料', uploadedAt: stamp(1), uploadedBy: 'QA 目前使用者', previousWorkspaceId: 'bom:qa-board:v1:qa0001', isCurrent: true, currentChangedAt: stamp(1), carry: { matched: 6, orphaned: 1, manual: 0 } },
};
const previousWorkspace = {
  id: 'bom:qa-board:v1:qa0001', name: 'QA 主板（僅隔離資料）', updatedAt: stamp(9), project: { projectId: project.id, projectName: project.name },
  payload: { ...seed, sourceFile: 'QA_主板_v1.xlsx', sheetName: 'QA', records: [], recordCount: previousRecords.length }, recordMeta: {},
  version: { seriesId, seriesName: 'QA 主板（僅隔離資料）', versionNumber: 1, label: 'EVT rev A', note: '', uploadedAt: stamp(9), uploadedBy: 'QA 目前使用者', isCurrent: false, currentChangedAt: stamp(1) },
};
const legacyWorkspace = {
  id: 'bom:qa-legacy', name: 'QA 舊格式 BOM.xlsx', updatedAt: stamp(20), project: undefined,
  payload: { ...seed, sourceFile: 'QA 舊格式 BOM.xlsx', sheetName: 'Sheet1', records: [], recordCount: 3 }, recordMeta: {},
};
const store = new Map([[workspace.id, workspace], [previousWorkspace.id, previousWorkspace], [legacyWorkspace.id, legacyWorkspace]]);
const fullRecords = new Map([[workspace.id, records], [previousWorkspace.id, previousRecords], [legacyWorkspace.id, previousRecords.slice(0, 3)]]);
const snapshot = (preferredId) => [...store.values()].map(item => structuredClone({ ...item, payload: { ...item.payload, records: item.id === (preferredId ?? workspace.id) ? (fullRecords.get(item.id) ?? []) : [] }, isLoaded: item.id === (preferredId ?? workspace.id) }));
const noteChannel = new URLSearchParams(window.location.search).has('qaLiveNotes') ? new BroadcastChannel('qa-material-notes') : null;
const workspaceListeners = new Set();
function applyQaNote(workspaceId, noteSnapshot) {
  const row = noteSnapshot.record;
  const list = fullRecords.get(workspaceId);
  if (!list) return;
  const index = list.findIndex(item => item.id === row.id);
  if (index === -1) return;
  fullRecords.set(workspaceId, list.map(item => item.id === row.id ? row : item));
  const item = store.get(workspaceId);
  item.recordMeta[row.id] = noteSnapshot.recordMeta;
  return { workspaceId, recordId: row.id, orderIndex: index, snapshot: noteSnapshot };
}
noteChannel?.addEventListener('message', ({ data: { workspaceId, noteSnapshot } }) => {
  const change = applyQaNote(workspaceId, noteSnapshot);
  if (change && !globalThis.__qaMuteNoteUpdates) workspaceListeners.forEach(listener => listener({ workspaceIds: [workspaceId], records: [change] }));
});

export class BomRecordConflictError extends Error {}
export const loadCachedBomWorkspacesDetailed = async () => null;
export const loadBomWorkspacesDetailed = async (preferredId, options = {}) => {
  const result = { mode: 'remote', workspaces: snapshot(store.has(preferredId) ? preferredId : undefined) };
  options.onPreview?.(result);
  return result;
};
export const loadBomWorkspaceArchives = async () => new Map([...store.values()].flatMap(item => (item.archive ? [[item.id, item.archive]] : [])));
export const loadBomWorkspaceProjects = async () => new Map([...store.values()].flatMap(item => (item.project ? [[item.id, item.project]] : [])));
export const loadBomWorkspaceVersions = async () => new Map([...store.values()].flatMap(item => (item.version ? [[item.id, item.version]] : [])));
export const loadBomWorkspaceRecords = async (workspaceId) => { await new Promise(resolve => setTimeout(resolve, 120)); if (!fullRecords.has(workspaceId)) throw new Error('QA：找不到這個版本'); return structuredClone(fullRecords.get(workspaceId)); };
export const subscribeBomWorkspaceChanges = (listener) => {
  workspaceListeners.add(listener);
  return () => workspaceListeners.delete(listener);
};
export const saveBomWorkspace = async (next) => { store.set(next.id, structuredClone({ ...next, payload: { ...next.payload, records: [] } })); fullRecords.set(next.id, structuredClone(next.payload.records)); };
export const saveBomWorkspacePageTracker = async (id, pageTracker) => { const item = store.get(id); if (item) item.pageTracker = pageTracker; };
export const saveBomWorkspaceArchive = async (id, archive) => { const item = store.get(id); if (item) item.archive = archive ?? undefined; };
export const saveBomWorkspaceProject = async (id, nextProject) => { const item = store.get(id); if (item) item.project = nextProject ?? undefined; };
export const saveBomWorkspaceVersion = async (id, version) => { const item = store.get(id); if (item) item.version = structuredClone(version); };
export const saveBomWorkspaceTableColorTheme = async (id, theme) => {
  if (globalThis.__qaFailTableThemeSave) throw new Error('QA simulated save failure');
  const item = store.get(id); if (item) item.tableColorTheme = structuredClone(theme);
};
export const removeBomWorkspace = async (id) => { store.delete(id); fullRecords.delete(id); };
export const saveBomWorkspaceRecord = async (target, record) => {
  const list = fullRecords.get(target.id) ?? [];
  const index = list.findIndex(item => item.id === record.id);
  if (index >= 0) list[index] = structuredClone(record); else list.push(structuredClone(record));
  fullRecords.set(target.id, list);
  return { updatedAt: new Date().toISOString(), updatedBy: user.displayName, version: 1 };
};
export const loadBomWorkspaceNoteRecord = async (workspaceId, recordId) => {
  if (globalThis.__qaFailNoteRead) throw new Error('QA simulated Note read failure');
  const record = fullRecords.get(workspaceId)?.find(item => item.id === recordId);
  return record ? structuredClone({ record, recordMeta: store.get(workspaceId).recordMeta[recordId] }) : null;
};
export const saveBomWorkspaceNote = async (workspaceId, recordId, note, expectedNote, assertWrite = () => {}) => {
  assertWrite();
  if (globalThis.__qaNoteWriteDelay) await new Promise(resolve => setTimeout(resolve, globalThis.__qaNoteWriteDelay));
  assertWrite();
  if (globalThis.__qaFailNoteSave) throw new Error('QA simulated Note save failure');
  const target = store.get(workspaceId);
  if (user.access === 'none' || target.version?.isCurrent === false) throw new Error('Note access denied');
  const current = fullRecords.get(workspaceId)?.find(item => item.id === recordId);
  if (!current || (current.note ?? '') !== expectedNote) throw new BomRecordConflictError();
  const noteSnapshot = { record: { ...current, note }, recordMeta: { updatedAt: new Date().toISOString() } };
  applyQaNote(workspaceId, noteSnapshot);
  noteChannel?.postMessage({ workspaceId, noteSnapshot });
  return structuredClone(noteSnapshot);
};
