import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {jsPDF} from 'jspdf';
import {CircuitPdfAiReview} from '../../src/components/circuit-changes/CircuitPdfAiReviewDialog';
import {openCircuitPdf} from '../../src/components/circuit-changes/pdfRender';
import '../../src/index.css';
window.__circuitAiQA={mode:'normal',calls:[],rows:[],saves:0,saveFail:false};
function makePdf(label) {const file=new jsPDF({unit:'pt',format:[600,400],orientation:'landscape'});file.setFontSize(18);file.text('QA schematic - CON2A A1',30,35);file.setFontSize(12);file.text(label,80,130);file.line(80,150,470,150);file.rect(470,110,80,100);file.text('A1',480,150);return file.output('arraybuffer');}
function App(){const[open,setOpen]=useState(false),[pair,setPair]=useState(null),[rows,setRows]=useState([]),[readOnly,setReadOnly]=useState(false);
useEffect(()=>{let current=true;Promise.all([openCircuitPdf(makePdf('PCIE_RX_P')),openCircuitPdf(makePdf('PCIE_RX_N'))]).then(([official,working])=>{if(current)setPair({official,working})});return()=>{current=false}},[]);
return <div className="min-h-screen bg-background p-4 text-foreground"><p>AI 逐頁初審隔離驗證 · 合成 PDF、模擬 provider、無正式資料寫入</p><button disabled={!pair} onClick={()=>setOpen(true)}>開啟本頁 AI 初審</button><button onClick={()=>setReadOnly(!readOnly)}>切換檢視權限</button><CircuitPdfAiReview open={open} onOpenChange={setOpen} disabled={readOnly} userName="QA 工程師" official={pair?{id:'official-v1',name:'官方基準 V1.pdf',page:1,pdf:pair.official}:null} working={pair?{id:'work-v2',name:'工作版本 V2.pdf',page:1,pdf:pair.working}:null} savedReport={rows.at(-1)??null} previousReports={rows} onSave={async report=>{if(window.__circuitAiQA.saveFail)throw Error('QA 模擬儲存失敗');window.__circuitAiQA.saves++;setRows(current=>{const next=[...current.filter(item=>item.id!==report.id),structuredClone(report)];window.__circuitAiQA.rows=next;return next});}}/></div>}
createRoot(document.getElementById('root')).render(<App/>);
