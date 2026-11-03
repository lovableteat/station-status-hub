import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const {loader}=createRequire(import.meta.url)('./support/renderHarness.cjs');
test('catalogue includes every extension, legacy attachments and every vendor; shared paths download once',()=>{
  const k=loader()('src/components/api-management/materialSpecKnowledge.ts');
  const bom={id:'bom-a',name:'Board A'};
  const doc=(name,path=name)=>({name,path,size:100,uploadedAt:'2026-11-01'});
  const rows=[{manufacturerPartNumber:'001-A',refDes:'U1',specDocuments:[doc('a.pdf'),doc('b.rar'),doc('c.stp'),doc('d.dwg'),doc('unknown.bin')]},{manufacturerPartNumber:'001-B',refDes:'U2',specDocument:doc('a.pdf')}];
  const result=k.buildMaterialSpecCatalogue([{bom,records:rows}]);
  assert.equal(result.length,5);assert.equal(result[0].parts.length,2);
  assert.ok(result.some(file=>file.name==='unknown.bin'));
});
test('content matches can find a SPEC even when its filename and MPN do not contain the search word',()=>{
  const k=loader()('src/components/api-management/materialSpecKnowledge.ts');
  const source={id:'S1',name:'anonymous.pdf',path:'safe/file.pdf',parts:[{bomId:'a',bomName:'Board A',mpn:'ABC',refDes:'U1',manufacturer:'Vendor'}]};
  const hits=k.selectMaterialSpecExcerpts('maximum operating temperature 105 C',[{...source,status:'read',method:'PDF',text:'Introduction\n'+'general '.repeat(800)+'\nMaximum operating temperature: 105 C. Test condition: 1.2 V.'}]);
  assert.match(hits.context,/105 C/);assert.match(hits.context,/\[S1\]/);assert.equal(hits.files.length,1);
});
test('unsupported and unread files remain visible, are never represented as evidence, and survive validated conversation persistence',()=>{
  const k=loader()('src/components/api-management/materialSpecKnowledge.ts');
  const file={id:'S1',name:'a.dwg',path:'safe/a.dwg',parts:[],status:'unread',method:'原生格式',note:'轉換器未提供',text:''};
  const report=k.selectMaterialSpecExcerpts('voltage',[file]);
  assert.equal(report.files.length,1);assert.match(report.context,/未讀|無法判讀/);
  assert.equal(k.parseMaterialSpecReport(JSON.parse(JSON.stringify(report))).files[0].status,'unread');
  assert.equal(k.parseMaterialSpecReport({files:[{...file,path:'https://evil.invalid/key'}]}),null);
});
