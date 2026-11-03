// Serves the real AI UI with isolated account/cloud/provider adapters for browser QA.
const path = require('node:path');
(async () => {
  const {createServer}=await import('vite');
  const mock=path.resolve('tests/support/aiWorkspaceMock.js');
  const server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:[
    {find:'@/components/auth/UserContext',replacement:mock},{find:'@/integrations/supabase/client',replacement:mock},{find:'@',replacement:path.resolve('src')}
  ]},worker:{format:'es'},optimizeDeps:{entries:['tests/support/aiWorkspaceFixture.jsx'],include:['react/jsx-dev-runtime']},server:{host:'127.0.0.1',port:8093,strictPort:true},plugins:[{name:'ai-workspace-qa',configureServer(server){server.middlewares.use((req,res,next)=>{
    if(req.url?.split('?')[0]!=='/')return next();
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 問答隔離驗證</title><div id="root"></div><script type="module" src="/tests/support/aiWorkspaceFixture.jsx"></script></html>');
  });}}]});
  await server.listen();console.log('Isolated AI QA: http://127.0.0.1:8093 (no production data or paid provider requests)');
})();
