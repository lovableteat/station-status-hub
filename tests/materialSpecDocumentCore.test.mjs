import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import JSZip from 'jszip';
import SevenZip from '7z-wasm';
const {loader}=createRequire(import.meta.url)('./support/renderHarness.cjs');
const core=()=>loader({mocks:{jszip:{default:JSZip}},globals:{TextDecoder,TextEncoder,Blob}})('src/components/api-management/materialSpecDocumentCore.ts');
test('RAR and 7z share a real sandboxed extractor with bounded uncompressed size',async()=>{
  const wasm=await readFile('node_modules/7z-wasm/7zz.wasm');
  const rar=await readFile('tests/fixtures/spec-fill/QA-SPEC.rar');
  const files=await core().extractMaterialSpecArchive(new Uint8Array(rar),wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.length));
  assert.ok(files.some(file=>file.name==='QA-BOX.stp'));
  assert.match(new TextDecoder().decode(files.find(file=>file.name==='spec-fill-QA.txt').bytes),/1.2 V/);
  const z=await SevenZip({print(){},printErr(){}});z.FS.writeFile('/data.txt',new TextEncoder().encode('7z specification 105 C'));z.callMain(['a','-bd','/qa.7z','/data.txt']);
  const seven=await core().extractMaterialSpecArchive(z.FS.readFile('/qa.7z'),wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.length));
  assert.match(new TextDecoder().decode(seven[0].bytes),/105 C/);
});
test('office document text and embedded files are extracted without executing XML or macros',async()=>{
  const zip=new JSZip();zip.file('word/document.xml','<w:p><w:r><w:t>MPN-A &amp; Voltage 1.2 V</w:t></w:r></w:p>');zip.file('word/media/plot.png',new Uint8Array([1,2,3]));
  const answer=await core().readMaterialSpecOffice('part.docx',await zip.generateAsync({type:'uint8array'}));
  assert.match(answer.text,/MPN-A & Voltage 1.2 V/);assert.equal(answer.children.length,1);
});
test('all files get a result: unknown text is readable, binary strings remain explicitly partial',()=>{
  const k=core();assert.match(k.readMaterialSpecText('unknown.custom',new TextEncoder().encode('MPN-A voltage 1.2 V')).text,/voltage/);
  const binary=k.readMaterialSpecText('part.dwg',new Uint8Array([0,0,1,2,65,66,67,68,45,49,50,0,0,3]));
  assert.equal(binary.status,'partial');assert.match(binary.note,/原生|完整/);
  assert.throws(()=>k.validateMaterialSpecArchiveEntries([{name:'../../outside',size:2}]),/路徑/);
  assert.throws(()=>k.validateMaterialSpecArchiveEntries([{name:'large',size:101*1024*1024}]),/容量/);
});
