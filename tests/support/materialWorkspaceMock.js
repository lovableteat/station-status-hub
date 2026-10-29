import seed from '../../src/data/materialRequestSeed.json';
import { supabase as baseSupabase } from './vendorMailMock';

const user = { userId: '00000000-0000-4000-8000-000000000001', username: 'qa', displayName: 'QA 目前使用者', role: 'admin' };
const project = { id: 'qa-project', name: 'QA 專案', status: 'active' };
const projects = [project];
const editorsByRecordId = new Map();
const files = new Map();
export const useUser = () => ({ user, sessionMode: 'authenticated', isRealtimeAuthenticated: true });
export const usePermissions = () => ({ canEditModule: () => true, canViewModule: () => true });
export const useTestProject = () => ({ activeProject: project, activeProjectId: project.id, allProjects: projects, projects });
export const useMaterialBomPresence = () => ({ editorsByRecordId, onlineUserCount: 2 });
export const logMaterialRecordChange = () => {};
export const logMaterialReportExport = () => {};
export const logMaterialWorkspaceAction = () => {};
export const supabase = { ...baseSupabase, rpc: async name => name === "list_active_collaboration_members" ? { data: [{user_id:user.userId, username:user.username, display_name:user.displayName}, {user_id:"00000000-0000-4000-8000-000000000002", username:"ce", display_name:"CE 王同學"}], error:null } : { data: [], error:null }, storage: { from() { return {
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

export class BomRecordConflictError extends Error {}
export const loadCachedBomWorkspacesDetailed = async () => null;
export const loadBomWorkspacesDetailed = async (preferredId) => ({ mode: 'remote', workspaces: snapshot(store.has(preferredId) ? preferredId : undefined) });
export const loadBomWorkspaceArchives = async () => new Map([...store.values()].flatMap(item => (item.archive ? [[item.id, item.archive]] : [])));
export const loadBomWorkspaceProjects = async () => new Map([...store.values()].flatMap(item => (item.project ? [[item.id, item.project]] : [])));
export const loadBomWorkspaceVersions = async () => new Map([...store.values()].flatMap(item => (item.version ? [[item.id, item.version]] : [])));
export const loadBomWorkspaceRecords = async (workspaceId) => { await new Promise(resolve => setTimeout(resolve, 120)); if (!fullRecords.has(workspaceId)) throw new Error('QA：找不到這個版本'); return structuredClone(fullRecords.get(workspaceId)); };
export const subscribeBomWorkspaceChanges = () => () => {};
export const saveBomWorkspace = async (next) => { store.set(next.id, structuredClone({ ...next, payload: { ...next.payload, records: [] } })); fullRecords.set(next.id, structuredClone(next.payload.records)); };
export const saveBomWorkspacePageTracker = async (id, pageTracker) => { const item = store.get(id); if (item) item.pageTracker = pageTracker; };
export const saveBomWorkspaceArchive = async (id, archive) => { const item = store.get(id); if (item) item.archive = archive ?? undefined; };
export const saveBomWorkspaceProject = async (id, nextProject) => { const item = store.get(id); if (item) item.project = nextProject ?? undefined; };
export const saveBomWorkspaceVersion = async (id, version) => { const item = store.get(id); if (item) item.version = structuredClone(version); };
export const saveBomWorkspaceTableColorTheme = async () => {};
export const removeBomWorkspace = async (id) => { store.delete(id); fullRecords.delete(id); };
export const saveBomWorkspaceRecord = async (target, record) => {
  const list = fullRecords.get(target.id) ?? [];
  const index = list.findIndex(item => item.id === record.id);
  if (index >= 0) list[index] = structuredClone(record); else list.push(structuredClone(record));
  fullRecords.set(target.id, list);
  return { updatedAt: new Date().toISOString(), updatedBy: user.displayName, version: 1 };
};
