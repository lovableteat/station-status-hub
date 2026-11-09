// Real page and editors with local-only storage, permissions and collaboration adapters.
const path = require('node:path');
(async () => {
  const {createServer}=await import('vite');
  const mock = path.resolve('tests/support/materialWorkspaceMock.js');
  const port = Number(process.env.MATERIAL_QA_PORT || 8096);
  const server=await createServer({configFile:false,root:process.cwd(),cacheDir:process.env.MATERIAL_QA_CACHE_DIR,resolve:{dedupe:['react','react-dom'],alias:[
    {find:/^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider|integrations\/supabase\/client)$/,replacement:mock},
    {find:/^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/,replacement:mock},
    {find:'@',replacement:path.resolve('src')}
  ]},worker:{format:'es'},optimizeDeps:{entries:['tests/support/materialWorkspaceFixture.jsx'],include:['react/jsx-dev-runtime','@radix-ui/react-context-menu']},server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'isolated-material-workspace',configureServer(server){server.middlewares.use((req,res,next)=>{
    if(req.url?.split('?')[0]!=='/')return next();
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws:; font-src 'self' data:; base-uri 'none'");
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><title>料號工作區隔離驗證</title><div id="root"></div><script type="module" src="/tests/support/materialWorkspaceFixture.jsx"></script></html>');
  });}}]});await server.listen();console.log(`Material QA ready: http://127.0.0.1:${port} (no production reads or writes)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
