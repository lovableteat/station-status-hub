import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const {loader}=createRequire(import.meta.url)('./support/renderHarness.cjs');
const load=loader();
const {buildMaterialMainGroups,getMaterialMainKey,getMaterialMarkKeys,sortMaterialAlternatives}=load('src/components/material-requests/materialMainRows.ts');
const {buildMaterialDataset}=load('src/components/material-requests/materialRequestUtils.ts');
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
test('the displayed main and alternatives share the virtual, footprint, physical, unnumbered and ODM ranking',()=>{
  const rows=[{id:'odm',virtualAlternative:'V',partNumber:'P',pcbFootprint:'fp',partUsageStatus:'新設計產品不建議使用 - ODM'},
    {id:'physical',partNumber:'P'}, {id:'missing'}, {id:'footprint',partNumber:'P',pcbFootprint:'fp'}, {id:'virtual',virtualAlternative:'V'}].map(row=>({manufacturer:'ACME',...row}));
  const primary={id:'main',manufacturer:'ACME'};
  const before=JSON.stringify([primary,...rows]);
  const result=sortMaterialAlternatives({primaryRecord:primary,records:[primary,...rows]});
  assert.deepEqual([...result.map(row=>row.id)],['virtual','footprint','physical','main','missing','odm']);
  assert.equal(result[0],rows.find(row=>row.id==='virtual'));
  assert.equal(JSON.stringify([primary,...rows]),before, 'presentation ranking never rewrites the original BOM');
});

const rawRecord=(id,overrides={})=>({
  id,sourceGroupKey:'qa-R11791',refGroup:'R11791',refDes:'R11791',isGroupStart:false,
  name:'Synthetic RES 100K 1% 0402',qty:1,level:2,sectionName:'Synthetic board',assemblyName:'Synthetic module',
  manufacturer:'Synthetic maker',manufacturerPartNumber:id,manufacturerPartNumberAlt:'',virtualAlternative:'',
  sourcingStatus:'Approved',lv:'',remark:'',partNumber:`QA-PHYSICAL-${id}`,partName:'',partSpec:'100K 1% 0402',
  schematicPart:'',pcbFootprint:'',trackingHistory:[],...overrides,
});
const datasetFor=records=>buildMaterialDataset({sourceFile:'synthetic-primary-ranking.xlsx',sheetName:'QA',generatedAt:'2026-11-05T00:00:00Z',recordCount:records.length,records});

test('R11791 displays a real footprint-backed vendor instead of its incomplete imported primary without grafting or rewriting data',()=>{
  const payload={sourceFile:'synthetic-R11791.xlsx',sheetName:'QA',generatedAt:'2026-11-05T00:00:00Z',recordCount:3,records:[
    rawRecord('panasonic',{isGroupStart:true,manufacturer:'Panasonic',manufacturerPartNumber:'QA-PANASONIC',trackingStatus:'已發信',requestOwnerName:'Synthetic owner A',trackingHistory:[{id:'tracking-panasonic',status:'已發信',createdAt:'2026-11-01T00:00:00Z',note:'Panasonic request must remain intact'}]}),
    rawRecord('tai',{manufacturer:'TA-I',manufacturerPartNumber:'QA-TAI',schematicPart:'RES_TAI',pcbFootprint:'R0402_TAI',trackingStatus:'已完成',trackingHistory:[{id:'tracking-tai',status:'已完成',createdAt:'2026-11-02T00:00:00Z'}]}),
    rawRecord('yageo',{manufacturer:'Yageo',manufacturerPartNumber:'QA-YAGEO',schematicPart:'RES_YAGEO',pcbFootprint:'R0402_YAGEO'}),
  ]};
  const originalPayload=structuredClone(payload);
  const dataset=buildMaterialDataset(payload);
  const sourceGroup=dataset.groups[0];
  const originalDataset=JSON.stringify(dataset);
  assert.equal(sourceGroup.primaryRecord.id,'panasonic','imported group-start provenance remains unchanged');
  const [view]=buildMaterialMainGroups(dataset.groups);
  assert.equal(view.primaryRecord.id,'tai','equal-ranked alternatives retain deterministic manufacturer ordering');
  const chosen=dataset.records.find(record=>record.id===view.primaryRecord.id);
  assert.equal(view.primaryRecord,chosen,'the entire selected vendor record supplies the displayed main');
  assert.equal(view.primaryRecord.manufacturerPartNumber,chosen.manufacturerPartNumber);
  assert.equal(view.schematicPart,chosen.schematicPart);
  assert.equal(view.footprint,chosen.pcbFootprint);
  assert.equal(sortMaterialAlternatives(view)[0].id,chosen.id,'the expanded list starts with the same selected main');
  assert.equal(view.locations[0].sourcePrimaryRecord,sourceGroup.primaryRecord);
  assert.deepEqual([...getMaterialMarkKeys(view)],['record::panasonic'],'existing location marks stay attached to the source main');
  assert.deepEqual([...view.records.map(record=>record.id)].sort(),['panasonic','tai','yageo']);
  assert.equal(new Set(view.records.map(record=>record.id)).size,3);
  for(const row of dataset.records) assert.equal(view.records.find(record=>record.id===row.id),row);
  assert.equal(sourceGroup.primaryRecord.schematicPart,'');
  assert.equal(sourceGroup.primaryRecord.pcbFootprint,'');
  assert.equal(view.records.find(record=>record.id==='panasonic').trackingHistory[0].note,'Panasonic request must remain intact');
  assert.equal(JSON.stringify(dataset),originalDataset);
  assert.deepEqual(payload,originalPayload);
});

test('a complete original primary wins an equal presentation rank even when another manufacturer sorts first',()=>{
  const original=rawRecord('original',{isGroupStart:true,manufacturer:'Z original maker',schematicPart:'RES_ORIGINAL',pcbFootprint:'R0402_ORIGINAL'});
  const alternate=rawRecord('alternate',{manufacturer:'A alternate maker',schematicPart:'RES_OTHER',pcbFootprint:'R0402_OTHER'});
  const source=datasetFor([original,alternate]);
  assert.equal(source.groups[0].primaryRecord.id,'original');
  const [view]=buildMaterialMainGroups(source.groups);
  assert.equal(view.primaryRecord.id,'original');
  assert.equal(sortMaterialAlternatives(view)[0].id,'original');
  assert.equal(view.schematicPart,'RES_ORIGINAL');
  assert.equal(view.footprint,'R0402_ORIGINAL');
});

test('a virtual-numbered original main wins a virtual-number tie without inferring Symbol readiness from CAD names',()=>{
  const source=datasetFor([
    rawRecord('original',{isGroupStart:true,manufacturer:'Z original',virtualAlternative:'QA-VIRTUAL',schematicPart:'',pcbFootprint:'',symbolStatus:'無'}),
    rawRecord('alternate',{manufacturer:'A alternate',virtualAlternative:'OTHER-VIRTUAL',schematicPart:'RES_OTHER',pcbFootprint:'R0402_OTHER',symbolStatus:'有'}),
  ]);
  const before=JSON.stringify(source);
  const [view]=buildMaterialMainGroups(source.groups);
  assert.equal(view.primaryRecord.id,'original');
  assert.equal(view.schematicPart,'');
  assert.equal(view.footprint,'');
  assert.equal(JSON.stringify(source),before);
});

test('placeholder footprint text is missing for ranking and never beats a real footprint',()=>{
  for(const placeholder of ['', ' \t ', '-', '—', '--', 'N/A', 'NA', 'NONE', 'NULL', '無', '未提供', '未設定', '待確認', ' n/a ', 'ｎ／ａ', 'ＮＵＬＬ']) {
    const source=datasetFor([
      rawRecord('placeholder',{isGroupStart:true,pcbFootprint:placeholder}),
      rawRecord('actual',{pcbFootprint:'R0402_ACTUAL',schematicPart:'RES_ACTUAL'}),
    ]);
    const [view]=buildMaterialMainGroups(source.groups);
    assert.equal(view.primaryRecord.id,'actual',JSON.stringify(placeholder));
    assert.equal(source.groups[0].primaryRecord.pcbFootprint,placeholder,'ranking must not erase the original source value');
  }
});

test('risk and ODM-restricted candidates remain last even with a virtual number and complete CAD data',()=>{
  for(const restriction of [{sourcingStatus:'Obsolete'}, {partUsageStatus:'禁用'}, {partUsageStatus:'新設計產品不建議使用 - ODM'}]) {
    const source=datasetFor([
      rawRecord('unsafe',{isGroupStart:true,virtualAlternative:'UNSAFE-VIRTUAL',schematicPart:'RES_UNSAFE',pcbFootprint:'R0402_UNSAFE',...restriction}),
      rawRecord('safe',{schematicPart:'',pcbFootprint:''}),
    ]);
    const before=JSON.stringify(source);
    assert.equal(source.records.find(record=>record.id==='unsafe').isRisk,true);
    const [view]=buildMaterialMainGroups(source.groups);
    assert.equal(view.primaryRecord.id,'safe');
    assert.deepEqual([...sortMaterialAlternatives(view).map(record=>record.id)],['safe','unsafe']);
    assert.equal(JSON.stringify(source),before);
  }
});

test('selection uses one whole vendor record rather than combining the original symbol with an alternate footprint',()=>{
  const source=datasetFor([
    rawRecord('symbol-only',{isGroupStart:true,schematicPart:'SYMBOL_FROM_ORIGINAL',pcbFootprint:''}),
    rawRecord('footprint-only',{schematicPart:'',pcbFootprint:'FOOTPRINT_FROM_ALTERNATE'}),
  ]);
  const [view]=buildMaterialMainGroups(source.groups);
  assert.equal(view.primaryRecord.id,'footprint-only');
  assert.equal(view.schematicPart,'','a blank symbol cannot borrow another vendor\'s symbol');
  assert.equal(view.footprint,'FOOTPRINT_FROM_ALTERNATE');
  assert.equal(source.groups[0].primaryRecord.schematicPart,'SYMBOL_FROM_ORIGINAL');
  assert.equal(source.groups[0].primaryRecord.pcbFootprint,'');
});

test('presentation selects independently at every location before merging rows, without borrowing CAD from another location',()=>{
  const original=rawRecord('main-A',{isGroupStart:true,manufacturerPartNumber:'SAME-MAIN-MPN',partNumber:'SAME-MAIN-PN'});
  const source=datasetFor([
    original,
    rawRecord('ready-A',{schematicPart:'RES_A',pcbFootprint:'R0402_A'}),
    rawRecord('main-B',{...original,id:'main-B',sourceGroupKey:'qa-R11792',refGroup:'R11792',refDes:'R11792',isGroupStart:true}),
  ]);
  const before=JSON.stringify(source);
  const views=buildMaterialMainGroups(source.groups);
  assert.equal(views.length,2,'locations with different selected vendors must not merge as the old imported main');
  const a=views.find(view=>view.displayRef==='R11791');
  const b=views.find(view=>view.displayRef==='R11792');
  assert.equal(a.primaryRecord.id,'ready-A');
  assert.equal(a.footprint,'R0402_A');
  assert.equal(b.primaryRecord.id,'main-B');
  assert.equal(b.schematicPart,'');
  assert.equal(b.footprint,'');
  assert.deepEqual([...a.records.map(record=>record.id)].sort(),['main-A','ready-A']);
  assert.deepEqual([...b.records.map(record=>record.id)],['main-B']);
  assert.equal(JSON.stringify(source),before);
});

test('presentation promotion does not recalculate per-record readiness, source Symbol values or manual application history',()=>{
  const source=datasetFor([
    rawRecord('manual-pending',{isGroupStart:true,remark:'需申請 Symbol',symbolStatus:'有',trackingStatus:'SYMBOL申請中',trackingHistory:[{id:'tracking-manual',status:'SYMBOL申請中',createdAt:'2026-11-01T00:00:00Z'}]}),
    rawRecord('complete-alt',{schematicPart:'RES_ALT',pcbFootprint:'R0402_ALT',symbolStatus:'無'}),
  ]);
  const before=source.records.map(record=>({id:record.id,isReady:record.isReady,isPending:record.isPending,needsApplication:record.needsApplication,symbolStatus:record.symbolStatus,history:record.trackingHistory}));
  const [view]=buildMaterialMainGroups(source.groups);
  assert.equal(view.primaryRecord.id,'complete-alt');
  assert.equal(source.groups[0].primaryRecord.id,'manual-pending');
  assert.equal(source.records.find(record=>record.id==='manual-pending').isReady,false);
  assert.equal(source.records.find(record=>record.id==='complete-alt').isReady,true);
  assert.deepEqual(source.records.map(record=>({id:record.id,isReady:record.isReady,isPending:record.isPending,needsApplication:record.needsApplication,symbolStatus:record.symbolStatus,history:record.trackingHistory})),before);
});

test('merged promoted locations keep the source main IDs for marks while preserving all vendor records and quantities',()=>{
  const source=datasetFor([
    rawRecord('imported-A',{isGroupStart:true,qty:2,manufacturerPartNumber:'MAIN-A'}),
    rawRecord('promoted-A',{qty:2,manufacturer:'TA-I',manufacturerPartNumber:'SHARED-MPN',partNumber:'SHARED-PHYSICAL',schematicPart:'RES_SHARED',pcbFootprint:'R0402_SHARED'}),
    rawRecord('imported-B',{sourceGroupKey:'qa-R11792',refGroup:'R11792',refDes:'R11792',isGroupStart:true,qty:3,manufacturerPartNumber:'MAIN-B'}),
    rawRecord('promoted-B',{sourceGroupKey:'qa-R11792',refGroup:'R11792',refDes:'R11792',qty:3,manufacturer:'TA-I',manufacturerPartNumber:'SHARED-MPN',partNumber:'SHARED-PHYSICAL',schematicPart:'RES_SHARED',pcbFootprint:'R0402_SHARED'}),
  ]);
  const before=JSON.stringify(source);
  const views=buildMaterialMainGroups(source.groups);
  assert.equal(views.length,1);
  const [view]=views;
  assert.equal(view.qty,'5');
  assert.equal(view.displayRef,'R11791, R11792');
  assert.equal(view.locations.length,2);
  assert.deepEqual([...getMaterialMarkKeys(view)],['record::imported-A','record::imported-B']);
  assert.deepEqual([...view.records.map(record=>record.id)].sort(),['imported-A','imported-B','promoted-A','promoted-B']);
  assert.deepEqual([...source.groups.map(group=>group.primaryRecord.id)],['imported-A','imported-B']);
  assert.equal(JSON.stringify(source),before);
});
test('identical named main data can combine before a part number is assigned, without inventing an identifier',()=>{
  const source=[group('C1',2,'',''),group('C2',3,'','')];
  source.forEach(location=>{location.primaryRecord.name='CAP 10uF';location.primaryRecord.partSpec='10uF 16V';});
  const result=buildMaterialMainGroups(source);
  assert.equal(result.length,1);assert.equal(result[0].locations.length,2);assert.equal(result[0].qty,'5');
  assert.equal(result[0].primaryRecord.partNumber,'');assert.equal(source[1].qty,3);
});
