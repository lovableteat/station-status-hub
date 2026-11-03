import {createServer} from 'vite';
import path from 'node:path';
const server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:[{find:'./materialSpecFillService',replacement:path.resolve('tests/support/specFillConversationMock.ts')},{find:'@',replacement:path.resolve('src')}]},worker:{format:'es'},server:{host:'127.0.0.1',port:8098,strictPort:true},plugins:[{name:'spec-conversation-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url!=='/')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SPEC 對話隔離驗證</title><div id="root"></div><script type="module" src="/tests/support/specFillConversationFixture.jsx"></script></html>');});}}]});
await server.listen();
console.log('SPEC QA ready: http://127.0.0.1:8098/ (synthetic AI, real RAR/STEP workers, no production requests)');
