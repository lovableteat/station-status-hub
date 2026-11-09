import { supabase as materialSupabase } from './materialWorkspaceMock';
const account = () => new URLSearchParams(location.search).get('qaUser') || 'A';
const objectUrl = path => `${location.origin}/__circuit/object?${new URLSearchParams({path})}`;
export const supabase = { ...materialSupabase, from(table) {
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
