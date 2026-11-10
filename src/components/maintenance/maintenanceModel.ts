export const FAULT_STATUSES = [
  { value: 'pending', label: '待處理' },
  { value: 'diagnosing', label: '查因中' },
  { value: 'repairing', label: '維修中' },
  { value: 'waiting_parts', label: '等料' },
  { value: 'resolved', label: '已解決' },
] as const;
export type FaultStatus = typeof FAULT_STATUSES[number]['value'];
export interface MaintenancePerson { id: string; name: string; username: string }
export interface MaintenanceSystem { id: string; system_name: string; serial_number: string | null }
export interface Fault {
  id: string; project_id: string; title: string; description: string;
  status: string; maintenance_status?: FaultStatus | null;
  assigned_to: string | null; assignee_user_ids: string[];
  asset_identifier: string | null; system_id: string | null;
  system_name?: string | null; serial_number?: string | null;
  category: string | null; process_notes?: string | null; solution?: string | null;
  priority?: string; relate?: string | null; tags?: string[] | null;
  handover_message_id?: string | null; summary?: string | null;
  created_at: string; updated_at: string;
}
export interface FaultMessage {
  id: string; issue_id: string; project_id: string; actor_id: string | null;
  actor_name: string; kind: string; body: string; created_at: string;
  metadata: Record<string, unknown>;
}
export interface FaultAttachment {
  id: string; issue_id: string; maintenance_message_id?: string | null;
  file_name: string; file_path: string; file_size: number | null; file_type: string | null;
}
export interface FaultWorkspaceData {
  issues: Fault[]; systems: MaintenanceSystem[]; people: MaintenancePerson[]; categories: string[];
}
export interface FaultThread { messages: FaultMessage[]; attachments: FaultAttachment[] }
export interface FaultFilters { query: string; status: string; owner: string; category: string; machine: string }
export const EMPTY_WORKSPACE: FaultWorkspaceData = { issues: [], systems: [], people: [], categories: [] };

export function getFaultStatus(issue: Pick<Fault, 'status' | 'maintenance_status'>): FaultStatus {
  if (FAULT_STATUSES.some(item => item.value === issue.maintenance_status)) return issue.maintenance_status!;
  return ['resolved', 'closed'].includes(issue.status) ? 'resolved' : issue.status === 'in_progress' ? 'repairing' : 'pending';
}
export function faultStatusLabel(status: string) { return FAULT_STATUSES.find(item => item.value === status)?.label || status; }
export function plainIssueText(value?: string | null) {
  return (value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
}
export function assetLabel(issue: Pick<Fault, 'asset_identifier' | 'serial_number' | 'system_name'>) {
  return issue.asset_identifier?.trim() || issue.serial_number?.trim() || issue.system_name?.trim() || '未記錄機台';
}
export function assetKey(issue: Pick<Fault, 'asset_identifier' | 'serial_number' | 'system_name'>) { return assetLabel(issue).toLocaleLowerCase(); }
export function ownerNames(issue: Pick<Fault, 'assignee_user_ids' | 'assigned_to'>, people: MaintenancePerson[]) {
  if (issue.assignee_user_ids?.some(id => !people.some(person => person.id === id)) && issue.assigned_to?.trim()) return issue.assigned_to.split('、').map(name => name.trim()).filter(Boolean);
  if (issue.assignee_user_ids?.length) return issue.assignee_user_ids.map(id => people.find(person => person.id === id)?.name || '停用帳號');
  return issue.assigned_to?.trim() ? [issue.assigned_to.trim()] : [];
}
export function ownerLabel(issue: Pick<Fault, 'assignee_user_ids' | 'assigned_to'>, people: MaintenancePerson[]) {
  const names = ownerNames(issue, people);
  return names.length ? names.length > 1 ? `${names[0]}＋${names.length - 1}` : names[0] : '未分派';
}
export function readFaultFilters(search: string): FaultFilters {
  const params = new URLSearchParams(search);
  const legacyStatus = params.get('issueStatus') || '';
  return {
    query: params.get('faultQuery') || params.get('issueSearch') || params.get('issueQuery') || params.get('system') || '',
    status: params.get('faultStatus') || ({ all: 'all', open: 'pending', in_progress: 'repairing', closed: 'resolved', resolved: 'resolved' }[legacyStatus] || 'unresolved'),
    owner: params.get('faultOwner') || params.get('issueOwner') || 'all',
    category: params.get('faultCategory') || '', machine: params.get('faultMachine') || '',
  };
}
export function writeFaultFilters(url: URL, filters: FaultFilters) {
  for (const key of ['issueSearch', 'issueQuery', 'issueStatus', 'issueOwner', 'issueStation', 'issuePriority', 'issueFollowUp', 'system']) url.searchParams.delete(key);
  for (const [key, value] of Object.entries({ faultQuery: filters.query, faultStatus: filters.status === 'all' ? '' : filters.status, faultOwner: filters.owner === 'all' ? '' : filters.owner, faultCategory: filters.category, faultMachine: filters.machine })) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  // An explicit all-state value distinguishes clearing from the default unresolved view.
  if (filters.status === 'all') url.searchParams.set('issueStatus', 'all');
}
export function filterFaults(issues: Fault[], filters: FaultFilters, actor?: { userId?: string; displayName?: string; username?: string }) {
  const query = filters.query.trim().toLocaleLowerCase();
  return issues.filter(issue => {
    const status = getFaultStatus(issue);
    if (filters.status === 'unresolved' && status === 'resolved') return false;
    if (!['all', 'unresolved'].includes(filters.status) && status !== filters.status) return false;
    const ids = issue.assignee_user_ids || [];
    if (filters.owner === 'unassigned' && (ids.length || issue.assigned_to?.trim())) return false;
    if (filters.owner === 'me' && !(actor?.userId && ids.includes(actor.userId)) && !(issue.assigned_to && [actor?.displayName, actor?.username].includes(issue.assigned_to))) return false;
    if (!['all', 'me', 'unassigned'].includes(filters.owner) && !ids.includes(filters.owner) && issue.assigned_to !== filters.owner) return false;
    if (filters.category && (issue.category?.trim() || '未分類') !== filters.category) return false;
    if (filters.machine && assetKey(issue) !== filters.machine.toLocaleLowerCase()) return false;
    return !query || [assetLabel(issue), issue.system_name, issue.title, issue.description, issue.process_notes, issue.summary, issue.category, issue.assigned_to].some(value => plainIssueText(value).toLocaleLowerCase().includes(query));
  }).sort((a, b) => assetKey(a).localeCompare(assetKey(b), 'zh-Hant', { numeric: true }) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
export function buildFaultStatistics(issues: Fault[]) {
  const machines = new Map<string, { key: string; name: string; total: number; open: number }>();
  const categories = new Map<string, { name: string; total: number; open: number }>();
  let unidentified = 0;
  for (const issue of issues) {
    const key = assetKey(issue), category = issue.category?.trim() || '未分類', open = getFaultStatus(issue) !== 'resolved' ? 1 : 0;
    const machine = machines.get(key) || { key, name: assetLabel(issue), total: 0, open: 0 };
    if (machine.name === '未記錄機台') unidentified++;
    else { machine.total++; machine.open += open; machines.set(key, machine); }
    const group = categories.get(category) || { name: category, total: 0, open: 0 };
    group.total++; group.open += open; categories.set(category, group);
  }
  return { machines: [...machines.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)), categories: [...categories.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)), unidentified };
}
