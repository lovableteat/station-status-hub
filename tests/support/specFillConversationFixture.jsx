import React from 'react';
import {createRoot} from 'react-dom/client';
import {MaterialSpecFillDialog} from '../../src/components/material-requests/MaterialSpecFillDialog';
import '../../src/index.css';
const originalFetch=window.fetch.bind(window);
window.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==location.origin)throw new Error('Production requests disabled in QA');return originalFetch(input,init);};
createRoot(document.getElementById('root')).render(<div className="min-h-screen bg-background text-foreground"><MaterialSpecFillDialog records={[{id:'qa-box',manufacturerPartNumber:'QA-BOX',manufacturer:'QA',name:'Synthetic 10 × 20 × 3 mm box — test data only',refDes:'U1'}]} workspaceName="隔離測試資料 · 模擬 AI 回覆" open onOpenChange={()=>{}} /></div>);
