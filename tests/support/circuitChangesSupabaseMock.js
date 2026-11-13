import { supabase as materialSupabase } from './materialWorkspaceMock';
const account = () => new URLSearchParams(location.search).get('qaUser') || 'A';
const objectUrl = path => `${location.origin}/__circuit/object?${new URLSearchParams({path})}`;
const aiReviews = () => (window.__circuitAiReviews ||= []);
function aiReviewQuery() {
  const filters = [];
  let order = false, range = [0, 999];
  const query = { select() { return this; }, eq(key, value) { filters.push(row => row[key] === value); return this; },
    like(key, pattern) { const prefix = pattern.replace(/%$/, '').replace(/\\(.)/g, '$1'); filters.push(row => String(row[key]).startsWith(prefix)); return this; },
    order() { order = true; return this; }, range(from, to) { range = [from, to]; return this; }, abortSignal() { return this; },
    then(resolve, reject) {
      let rows = aiReviews().filter(row => filters.every(test => test(row)));
      if (order) rows = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return Promise.resolve({ data: rows.slice(range[0], range[1] + 1).map(row => ({ report: structuredClone(row.report), revision: row.revision })), error: null, status: 200 }).then(resolve, reject);
    } };
  return query;
}
export const supabase = { ...materialSupabase, rpc(name, args = {}) {
  if (name !== 'circuit_pdf_save_ai_review') return materialSupabase.rpc(name, args);
  const rows = aiReviews(), known = rows.find(row => row.report.id === args.p_report.id);
  const answer = value => ({ abortSignal() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  if ((known?.revision || 0) !== args.p_expected_revision) return answer({ data: null, error: { code: 'PT409', message: 'conflict' }, status: 409 });
  const row = { series_id: args.p_series_id, target_key: args.p_report.key, created_at: args.p_report.createdAt, report: structuredClone(args.p_report), revision: (known?.revision || 0) + 1 };
  if (known) Object.assign(known, row); else rows.push(row);
  return answer({ data: { report: structuredClone(row.report), revision: row.revision }, error: null, status: 200 });
}, from(table) {
  if (table === 'circuit_pdf_ai_reviews') return aiReviewQuery();
  if (table !== 'ui_table_preferences') return materialSupabase.from(table);
  const filters = {}, calls = [];
  let method = 'select', payload, signal;
  const query = { select(...args) { calls.push(['select',args]); return this; }, eq(key,value) { filters[key]=value; calls.push(['eq',[key,value]]); return this; },
    insert(row) { method='insert'; payload=row; return this; }, update(row) { method='update'; payload=row; return this; }, abortSignal(value) { signal=value; return this; },
    maybeSingle() { return this; }, then(resolve,reject) {
      const key = payload?.table_key || filters.table_key || '';
      if (!key.startsWith('circuit-pdf-ink:')) return Promise.resolve().then(()=>{ let fallback=materialSupabase.from(table); for(const [name,args] of calls) fallback=fallback[name](...args); return fallback; }).then(resolve,reject);
      return fetch('/__circuit/ink-preference', { method:'POST', headers:{'Content-Type':'application/json','x-qa-account':account()}, signal,
        body:JSON.stringify({method,key,payload,version:filters.updated_at}) }).then(response=>response.json()).then(resolve,reject);
    } };
  return query;
}, storage: { from(bucket) {
  if (bucket !== 'circuit-change-images') return materialSupabase.storage.from(bucket);
  return {
    async upload(path,file,options = {}) {
      const response = await fetch(objectUrl(path), {method:'PUT',headers:{'x-qa-account':account(),'x-file-name':encodeURIComponent(file.name || path.split('/').at(-1)),'Content-Type':options.contentType || file.type || 'application/octet-stream'},body:file});
      const result=await response.json(); return response.ok?result:{data:null,error:{message:result.error}};
    },
    async download(path) {
      const response=await fetch(objectUrl(path),{headers:{'x-qa-account':account()}});
      return response.ok?{data:await response.blob(),error:null}:{data:null,error:{message:'QA image download failed'}};
    },
    async createSignedUrl(path) { return {data:{signedUrl:objectUrl(path)},error:null}; },
    async createSignedUrls(paths) { return {data:paths.map(path=>({path,signedUrl:objectUrl(path),error:null})),error:null}; },
  };
} } };
