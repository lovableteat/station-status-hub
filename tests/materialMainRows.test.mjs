import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const {loader}=createRequire(import.meta.url)('./support/renderHarness.cjs');
const {buildMaterialMainGroups,getMaterialMainKey,getMaterialMarkKeys,sortMaterialAlternatives}=loader()('src/components/material-requests/materialMainRows.ts');
const group=(key,qty,part='P1',mpn='MAIN')=>({key,qty,displayRef:key,primaryRecord:{id:key,partNumber:part,manufacturer:'ACME',manufacturerPartNumber:mpn,searchText:`main ${mpn}`},records:[{id:key},{id:`${key}-alt`,manufacturerPartNumber:`ALT-${key}`}],assemblyName:key,sectionName:'project-1'});
test('the view merges matching main data but preserves every location, quantity and alternative without modifying source data',()=>{
  const source=[group('C1',2),group('C2',3),group('C3',4,'P2'),group('C4',1,'','MISSING'),group('C5',1,'','MISSING'),group('C6',1,'P1','OTHER-MPN')];
  const before=JSON.stringify(source);const result=buildMaterialMainGroups(source);
  assert.equal(result.length,4);assert.equal(result[0].qty,'5');assert.equal(result[0].displayRef,'C1, C2');
  assert.equal(result[0].locations[1],source[1]);assert.deepEqual([...result[0].records.map(r=>r.id)],['C1','C1-alt','C2','C2-alt']);
  assert.equal(result[0].locations[1].assemblyName,'C2');assert.equal(result[0].locations[1].qty,3);
  assert.equal(JSON.stringify(source),before);assert.equal(getMaterialMainKey(source[0]),getMaterialMainKey(source[1]));
  assert.doesNotMatch(result[0].searchText,/ALT/);
  assert.deepEqual([...getMaterialMarkKeys(result[0])],['record::C1','record::C2']);
  assert.deepEqual([...getMaterialMarkKeys({...source[0],primaryRecord:{...source[0].primaryRecord,partNumber:'NEW-NUMBER'}})],['record::C1']);
  assert.equal(buildMaterialMainGroups([group('UNKNOWN1',1,'',''),group('UNKNOWN2',1,'','')]).length,2);
});
test('alternatives rank virtual number then physical with footprint then physical only, and ODM restrictions always last without replacing the main',()=>{
  const rows=[{id:'odm',virtualAlternative:'V',partNumber:'P',pcbFootprint:'fp',partUsageStatus:'新設計產品不建議使用 - ODM'},
    {id:'physical',partNumber:'P'}, {id:'missing'}, {id:'footprint',partNumber:'P',pcbFootprint:'fp'}, {id:'virtual',virtualAlternative:'V'}].map(row=>({manufacturer:'ACME',...row}));
  const primary={id:'main',manufacturer:'ACME'};
  const result=sortMaterialAlternatives({primaryRecord:primary,records:[primary,...rows]});
  assert.deepEqual([...result.map(row=>row.id)],['main','virtual','footprint','physical','missing','odm']);
  assert.equal(result[0],primary);assert.equal(rows[0].id,'odm');
});
test('identical named main data can combine before a part number is assigned, without inventing an identifier',()=>{
  const source=[group('C1',2,'',''),group('C2',3,'','')];
  source.forEach(location=>{location.primaryRecord.name='CAP 10uF';location.primaryRecord.partSpec='10uF 16V';});
  const result=buildMaterialMainGroups(source);
  assert.equal(result.length,1);assert.equal(result[0].locations.length,2);assert.equal(result[0].qty,'5');
  assert.equal(result[0].primaryRecord.partNumber,'');assert.equal(source[1].qty,3);
});
