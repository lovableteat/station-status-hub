import React from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import NvBomComparePanel from '../../src/components/material-requests/NvBomComparePanel';
import { providerReply, qa } from './nvBomModelsMock';
import '../../src/index.css';

const localFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(new URL(url,location.href).origin===location.origin)return localFetch(input,init);
  const provider=url.startsWith('https://generativelanguage.googleapis.com/v1beta/')?'gemini':url==='https://api.anthropic.com/v1/messages'?'anthropic':url==='https://compatible.invalid/v1/chat/completions'?'openai-compatible':null;
  if(!provider)throw new Error('External request blocked');
  if(provider==='gemini'&&new URL(url).pathname==='/v1beta/models'){
    const models=['gemini-2.5-flash','gemini-3.5-flash-lite','gemini-3.8-flash'].map(model=>({name:`models/${model}`,supportedGenerationMethods:['generateContent']}));
    return Response.json({models});
  }
  const body=JSON.parse(init.body), model=body.model??decodeURIComponent(url.match(/models\/([^/:]+):/)[1]);
  const result=await providerReply(provider,model,body,url);
  return new Response(JSON.stringify(result.payload),{status:result.status,headers:{'Content-Type':'application/json'}});
};
createRoot(document.getElementById('root')).render(<TooltipProvider><main className="flex h-dvh min-h-0 flex-col bg-background p-3 text-foreground"><NvBomComparePanel active onBack={()=>{qa.back=true}} /></main></TooltipProvider>);
