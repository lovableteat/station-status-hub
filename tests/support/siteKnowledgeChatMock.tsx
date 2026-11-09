window.__siteQA = { reads: [], requests: [] };
export const useUser = () => ({ user: { userId: 'site-qa', displayName: 'QA' } });
export const AiQuotaStatus = () => null;
export const AI_USAGE_RECORDED_EVENT = 'ai-usage-recorded';
const records = {
  material_bom_workspaces: [{ id: 'bom-qa', name: 'Vera BOM', source_file: 'Vera.xlsx', record_count: 650 }],
  material_bom_records: [{ record_id: 'part-qa', workspace_id: 'bom-qa', name: 'GPU capacitor', mpn: 'QA1000', virtual: '1AT500003500', physical: '1A50-0331000', status: '料號申請中' }],
  circuit_change_items: [{ id: 'change-qa', title: 'GPU 線路修改', status: 'in_review' }],
  test_plan_files: [{ id: 'file-qa', space_id: 'space-qa', original_name: 'Vera.pdf', description: 'GPU Cage 原理圖' }],
  test_plan_spaces: [{ id: 'space-qa', name: 'Vera 工程文件' }],
  data_center_projects: [{ id: 'dc-qa', name: 'Vera DC', description: 'GPU Cage 規劃' }],
  data_center_work_reports: [{ id: 'report-qa', summary: 'GPU Cage 完成上架', status: 'completed' }],
};
export const supabase = {
  from(table) {
    const read = { table, fields: '' };
    const builder = new Proxy({}, { get(_, key) {
      if (key === 'then') return (ok, no) => { if (records[table] || table === 'performance_reviews') window.__siteQA.reads.push(read); return Promise.resolve(table === 'performance_reviews' ? { data: null, error: { message: 'QA RLS denied' }, count: null } : { data: records[table] ?? [], count: table === 'material_bom_workspaces' ? 31 : (records[table]?.length ?? 0), error: null }).then(ok, no); };
      if (key === 'select') return fields => { read.fields = fields; return builder; };
      return () => builder;
    } }); return builder;
  },
  rpc() { const builder = { abortSignal() { return builder; }, then(ok, no) { return Promise.resolve({ data: [], error: null }).then(ok, no); } }; return builder; },
  channel() { const channel = { on() { return channel; }, subscribe() { return channel; } }; return channel; }, removeChannel: async () => {},
};
export async function trackedProviderFetch(input) {
  const body = JSON.parse(input.init.body); window.__siteQA.requests.push(body);
  const serialized = JSON.stringify(body);
  const sourced = serialized.includes('全站資料查詢時間');
  if (sourced && !['Vera BOM', 'Vera.pdf', 'GPU Cage 完成上架', 'QA RLS denied'].every(value => serialized.includes(value))) throw Error('Cross-module source evidence did not reach the provider');
  return new Response(JSON.stringify({ choices: [{ message: { content: sourced ? 'Vera BOM 有 650 筆原始紀錄，料號正在申請中 [W1]。Data Center 日報記錄 GPU Cage 完成上架；Vera.pdf 是檔案目錄來源。績效來源查詢失敗，未推測其內容。' : '2' } }] }), { status: 200 });
}
