import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import test from 'node:test';
const native=createRequire(import.meta.url);
const {loader}=native('./support/renderHarness.cjs');
const load=loader({globals:{TextDecoder}});
const engineering=()=>load('src/components/material-requests/materialSpecFillEngineering.ts');
test('real RAR extracts named SPEC files and rejects bad data before AI',async()=>{
  const data=await readFile('tests/fixtures/spec-fill/QA-SPEC.rar');
  const wasm=await readFile('node_modules/node-unrar-js/dist/js/unrar.wasm');
  const files=await engineering().extractSpecFillRar(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.byteLength));
  assert.ok(files.some(file=>file.name==='QA-BOX.stp'));
  assert.match(new TextDecoder().decode(files.find(file=>file.name==='spec-fill-QA.txt').bytes),/operating voltage 1.2 V/);
  await assert.rejects(engineering().extractSpecFillRar(new ArrayBuffer(10),wasm),/RAR/);
});
test('archive limits, encryption and traversal are rejected without writing files',()=>{
  const safe={name:'SPEC.pdf',unpSize:100,flags:{directory:false,encrypted:false}};
  for(const header of [{...safe,name:'../secret.txt'},{...safe,unpSize:20*1024*1024},{...safe,flags:{encrypted:true}}]) assert.throws(()=>engineering().validateSpecFillArchive([header]),/路徑|容量|加密/);
  assert.throws(()=>engineering().validateSpecFillArchive(Array(101).fill(safe)),/檔案/);
});
test('STEP summary uses geometric XYZ spans and explicit limits rather than guessed electrical values',()=>{
  const text=engineering().summarizeSpecFillStep('QA-BOX.stp',{bounds:{min:[-1,2,0],max:[9,22,3]},parts:[{name:'QA-BOX'}]},"ISO-10303-21;\nFILE_DESCRIPTION(('QA model'),'2;1');");
  assert.match(text,/X=10 mm.*Y=20 mm.*Z=3 mm/);
  assert.match(text,/QA-BOX/);
  assert.match(text,/不是.*公差|不代表.*公差/);
  assert.match(text,/電氣/);
});
