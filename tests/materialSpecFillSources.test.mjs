import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareSpecFillSources,canReadSpecForFill} from '../src/components/material-requests/materialSpecFillSources.ts';
test('archive expansion identifies skipped entries and abort terminates the parser',async()=>{
  let terminated=0;
  const original=globalThis.Worker;
  class Parser { terminate(){terminated++;} postMessage(){queueMicrotask(()=>this.onmessage({data:{files:[{name:'data.txt',bytes:new TextEncoder().encode('source text')},{name:'nested.rar',bytes:new Uint8Array([1])},{name:'program.exe',bytes:new Uint8Array([1])}]}}));} }
  globalThis.Worker=Parser;
  try{
    assert.ok(canReadSpecForFill('SPEC.RAR'));assert.ok(canReadSpecForFill('model.STP'));
    const source={id:'a',name:'spec.rar',blob:new Blob(['rar fixture'])};
    const prepared=await prepareSpecFillSources([source],new AbortController().signal);
    assert.equal(prepared.inputs[0].name,'spec.rar/data.txt');
    assert.equal(await prepared.inputs[0].blob.text(),'source text');
    assert.equal(prepared.warnings.length,2);assert.equal(terminated,1);
    const controller=new AbortController();
    globalThis.Worker=class extends Parser {postMessage(){controller.abort();}};
    await assert.rejects(prepareSpecFillSources([source],controller.signal),{name:'AbortError'});
    assert.equal(terminated,2);
  }finally{globalThis.Worker=original;}
});
