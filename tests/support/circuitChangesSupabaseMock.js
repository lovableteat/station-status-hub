import { supabase as materialSupabase } from './materialWorkspaceMock';
const account = () => new URLSearchParams(location.search).get('qaUser') || 'A';
const objectUrl = path => `${location.origin}/__circuit/object?${new URLSearchParams({path})}`;
export const supabase = { ...materialSupabase, storage: { from(bucket) {
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
