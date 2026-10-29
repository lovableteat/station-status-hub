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

const records = ['R1', 'R1', 'PR1', 'R10', 'R1_C0P1', 'LB48', 'C1', 'J1', 'U1', 'J2', 'J2'].map((ref, index) => ({
  ...seed.records[0], id: `qa-${index}`, level: 2, sourceGroupKey: ref, isGroupStart: true,
  refGroup: ref, refDes: ref, name: index === 5 ? 'IND 3.5uH 0402' : `RES 10K 1% 0402 ${ref}`, qty: 1,
  manufacturer: index % 2 ? 'QA Vendor B' : 'QA Vendor A', manufacturerPartNumber: `QA-MPN-${index}`,
  virtualAlternative: (index > 1 && index !== 7 && index !== 10) ? '000-VIRTUAL' : '', partNumber: (index > 1 && index !== 7 && index !== 10) ? `000-PHYSICAL-${index}` : '',
  requestOwnerId: index === 8 ? '00000000-0000-4000-8000-000000000002' : undefined, requestOwnerName: index === 8 ? 'CE 王同學' : undefined, partName: 'QA 公司料名', partSpec: '10K 1% 0402', assemblyName: 'QA 原始模組', remark: 'QA 原始備註保留',
  trackingStatus: index === 8 ? 'SYMBOL申請中' : '', trackingHistory: [], trackingNote: '', sourcingStatus: 'Approved',
}));
const workspace = { id: 'bom:qa-workspace', name: 'QA BOM（僅隔離資料）', updatedAt: new Date().toISOString(), project: { projectId: project.id, projectName: project.name }, payload: { ...seed, sourceFile: 'QA BOM.xlsx', sheetName: 'QA', records, recordCount: records.length }, recordMeta: {} };
export class BomRecordConflictError extends Error {}
export const loadCachedBomWorkspacesDetailed = async () => null;
export const loadBomWorkspacesDetailed = async () => ({ mode: 'remote', workspaces: [structuredClone(workspace)] });
export const loadBomWorkspaceArchives = async () => ({});
export const loadBomWorkspaceProjects = async () => ({});
export const subscribeBomWorkspaceChanges = () => () => {};
export const saveBomWorkspace = async () => {};
export const saveBomWorkspacePageTracker = async () => {};
export const saveBomWorkspaceArchive = async () => {};
export const saveBomWorkspaceProject = async () => {};
export const saveBomWorkspaceTableColorTheme = async () => {};
export const removeBomWorkspace = async () => {};
export const saveBomWorkspaceRecord = async (target, record) => {
  const index = workspace.payload.records.findIndex(item => item.id === record.id);
  if (index >= 0) workspace.payload.records[index] = structuredClone(record); else workspace.payload.records.push(structuredClone(record));
  return { updatedAt: new Date().toISOString(), updatedBy: user.displayName, version: 1 };
};
