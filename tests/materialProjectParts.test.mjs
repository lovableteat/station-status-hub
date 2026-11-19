import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';

const {loader}=createRequire(import.meta.url)('./support/renderHarness.cjs');
const load=loader({globals:{Blob}});
const parts=load('src/components/material-requests/projectParts.ts');
const {buildProjectParts,filterProjectParts,buildPjeRows,buildPjeWorkbook,buildProjectPartsRows,describeProjectPartBoards,describeMissingQty,projectPartsFileName,
  projectPartColumnOptions,projectPartQtyLabel,sortProjectParts,planProjectPartCategory,projectPartRowSignature,EMPTY_PROJECT_PARTS_FILTERS,PROJECT_PARTS_HEADERS,PJE_HEADERS,PJE_SHEET_NAME}=parts;

// Synthetic boards only (public repository): no real board, project or vendor names.
let next=0;
const row=(ref,overrides={})=>({
  id:`row-${next++}`,sourceGroupKey:ref,refGroup:ref,refDes:ref,isGroupStart:true,level:2,qty:1,sectionName:'QA',assemblyName:'QA',
  name:`QA PART ${ref}`,manufacturer:'QA MAKER A',manufacturerPartNumber:`QA-MPN-${ref}`,manufacturerPartNumberAlt:'',virtualAlternative:'',
  sourcingStatus:'Approved',lv:'',remark:'',partNumber:'',partName:'',partSpec:'',schematicPart:'',pcbFootprint:'',trackingHistory:[],...overrides,
});
const cpu={name:'QA CPU SOCKET PART',manufacturer:'QA CPU MAKER',manufacturerPartNumber:'QA-CPU-1',partNumber:'QA-PHYS-CPU'};
const conn={name:'QA CONN 2X10',manufacturer:'QA CONN MAKER',manufacturerPartNumber:'QA-CONN-20',partNumber:'QA-PHYS-CONN',virtualAlternative:'QA-VIRT-CONN'};
const board=(id,name,records)=>({id,name,version:'V1',records});
const plain=value=>JSON.parse(JSON.stringify(value));

test('the same part on several boards becomes one row with each board, its quantity and positions, and the total',()=>{
  const a=[row('U1',{...cpu,qty:1}),row('J1',{...conn,qty:2}),row('R1',{qty:4,name:'QA RES 10K'}),row('J5',{...conn,qty:1})];
  const b=[row('U7',{...cpu,qty:2}),row('J3',{...conn,qty:1}),row('C9',{name:'QA CAP 1uF',qty:'n/a'})];
  const before=JSON.stringify([a,b]);
  const result=buildProjectParts([board('s-a','QA_Board_A',a),board('s-b','QA_Board_B',b)]);
  assert.equal(JSON.stringify([a,b]),before,'the BOM rows are never changed');
  const byMpn=Object.fromEntries(result.map(part=>[part.mpn,part]));
  assert.deepEqual(plain(byMpn['QA-CPU-1'].uses.map(use=>[use.board,use.qty,use.refs])),[['QA_Board_A',1,'U1'],['QA_Board_B',2,'U7']]);
  assert.equal(byMpn['QA-CPU-1'].totalQty,3);
  assert.equal(byMpn['QA-CPU-1'].category,'ic');
  // Two positions of the same connector on one board add up on that board.
  assert.deepEqual(plain(byMpn['QA-CONN-20'].uses.map(use=>[use.board,use.qty])),[['QA_Board_A',3],['QA_Board_B',1]]);
  assert.match(byMpn['QA-CONN-20'].uses[0].refs,/J1/);assert.match(byMpn['QA-CONN-20'].uses[0].refs,/J5/);
  assert.equal(byMpn['QA-CONN-20'].totalQty,4);
  assert.equal(byMpn['QA-CONN-20'].status,'physical');
  // A position without a number is named, not guessed: no total, shown as 未填.
  assert.equal(byMpn['QA-MPN-C9'].totalQty,null);
  assert.equal(byMpn['QA-MPN-C9'].uses[0].qty,null);
  assert.deepEqual(plain(byMpn['QA-MPN-C9'].uses[0].missingRefs),['C9']);
  assert.equal(projectPartQtyLabel(byMpn['QA-MPN-C9']),'未填');
  // Connectors first, then ICs, then passives; within a category parts used on more boards first.
  assert.deepEqual(plain(result.map(part=>part.category)),['connector','ic','rlc','rlc']);
  assert.equal(describeProjectPartBoards(byMpn['QA-CPU-1']),'QA_Board_A ×1、QA_Board_B ×2');
  assert.equal(describeProjectPartBoards(byMpn['QA-MPN-R1']),'QA_Board_A');
});

test('the main of each location follows the material table ranking and the other vendors are listed as alternates',()=>{
  const records=[
    row('U2',{name:'QA FLASH',manufacturer:'QA OLD MAKER',manufacturerPartNumber:'QA-FLASH-OLD',partNumber:'',virtualAlternative:''}),
    row('U2',{isGroupStart:false,name:'QA FLASH',manufacturer:'QA NEW MAKER',manufacturerPartNumber:'QA-FLASH-NEW',virtualAlternative:'QA-VIRT-FLASH'}),
  ];
  const [part]=buildProjectParts([board('s-a','QA_Board_A',records)]);
  assert.equal(part.mpn,'QA-FLASH-NEW','the virtual-numbered vendor is the display main, as in one BOM');
  assert.deepEqual(plain(part.alternates),['QA OLD MAKER QA-FLASH-OLD']);
  assert.equal(part.status,'virtual');
});

test('rows the BOM left without any number or name stay one row per board',()=>{
  const blank={name:'',manufacturer:'',manufacturerPartNumber:'',partNumber:'',virtualAlternative:''};
  const result=buildProjectParts([board('s-a','A',[row('X1',blank)]),board('s-b','B',[row('X1',blank)])]);
  assert.equal(result.length,2);
});

test('filters: words, status, several categories at once, and the column filters (board, maker)',()=>{
  const a=[row('U1',{...cpu}),row('J1',{...conn}),row('R1',{name:'QA RES 10K',manufacturer:'QA RES MAKER',partUsageStatus:'停產'}),row('Q1',{name:'QA MOSFET',partNumber:''})];
  const b=[row('U7',{...cpu})];
  const list=buildProjectParts([board('s-a','QA_Board_A',a),board('s-b','QA_Board_B',b)]);
  const f=overrides=>filterProjectParts(list,{...EMPTY_PROJECT_PARTS_FILTERS,...overrides}).map(part=>part.mpn);
  assert.deepEqual(plain(f({categories:['ic','connector']}).sort()),['QA-CONN-20','QA-CPU-1']);
  assert.deepEqual(plain(f({columns:{boards:['QA_Board_B']}})),['QA-CPU-1']);
  assert.deepEqual(plain(f({columns:{boards:[]}})),[],'nothing ticked in a column shows nothing, as in Excel');
  assert.deepEqual(plain(f({query:'board_b cpu'})),['QA-CPU-1'],'board names are searchable, every word must match');
  assert.deepEqual(plain(f({status:'risk'})),['QA-MPN-R1']);
  assert.deepEqual(plain(f({status:'unnumbered'}).sort()),['QA-MPN-Q1','QA-MPN-R1']);
  assert.deepEqual(plain(f({columns:{manufacturer:['QA CONN MAKER']}})),['QA-CONN-20']);
  assert.deepEqual(plain(f({columns:{status:['停產']}})),['QA-MPN-R1']);
  assert.deepEqual(plain(f({columns:{physical:['(空白)']}}).sort()),['QA-MPN-Q1','QA-MPN-R1'],'(空白) finds the parts without the number');
  assert.equal(f({}).length,list.length);
});

test('the PJE sheet has exactly the five template columns, styled like the template',async()=>{
  const list=buildProjectParts([board('s-a','QA_Board_A',[row('U1',{...cpu}),row('J1',{...conn,qty:2})]),board('s-b','QA_Board_B',[row('U7',{...cpu,qty:2})])]);
  assert.deepEqual(plain([...PJE_HEADERS]),['Items','Vendor','PN','使用在哪個板子','Usage']);
  assert.deepEqual(plain(buildPjeRows(list).map(row=>[...row])),[
    ['QA CONN 2X10','QA CONN MAKER','QA-CONN-20','QA_Board_A',2],
    ['QA CPU SOCKET PART','QA CPU MAKER','QA-CPU-1','QA_Board_A ×1、QA_Board_B ×2',3],
  ]);
  const blob=await buildPjeWorkbook(list,{projectName:'QA 專案',exportedBy:'QA',exportedAt:new Date('2026-11-19T00:00:00Z')});
  const book=new ExcelJS.Workbook();await book.xlsx.load(await blob.arrayBuffer());
  assert.deepEqual(plain(book.worksheets.map(sheet=>sheet.name)),[PJE_SHEET_NAME]);
  const sheet=book.worksheets[0];
  assert.deepEqual(plain(sheet.getRow(1).values.slice(1)),['Items','Vendor','PN','使用在哪個板子','Usage']);
  for(let column=1;column<=5;column++){const cell=sheet.getRow(1).getCell(column);assert.equal(cell.font.bold,true);assert.equal(cell.fill.fgColor.argb,'FFCAEDFB');}
  assert.equal(sheet.getColumn(2).width,21);assert.equal(sheet.getColumn(3).width,22.125);assert.equal(sheet.getColumn(4).width,27.375);
  // The template's header: Calibri 7 bold dark blue (Microsoft JhengHei for the Chinese header), centred, wrapped, thin borders.
  for(let column=1;column<=5;column++){const cell=sheet.getRow(1).getCell(column);assert.equal(cell.font.size,7);assert.equal(cell.font.color.argb,'FF002060');assert.equal(cell.font.name,column===4?'Microsoft JhengHei':'Calibri');
    assert.equal(cell.alignment.horizontal,'center');assert.equal(cell.alignment.vertical,'middle');assert.equal(cell.alignment.wrapText,true);for(const side of ['top','left','bottom','right'])assert.equal(cell.border[side].style,'thin');}
  assert.equal(sheet.views[0].state,'frozen');assert.equal(sheet.views[0].ySplit,1);
  assert.deepEqual(plain(sheet.getRow(3).values.slice(1)),['QA CPU SOCKET PART','QA CPU MAKER','QA-CPU-1','QA_Board_A ×1、QA_Board_B ×2',3]);
  assert.equal(sheet.rowCount,3);
});

test('the full export keeps every board, quantity and position; file names are safe',()=>{
  const list=buildProjectParts([board('s-a','QA_Board_A',[row('U1',{...cpu})]),board('s-b','QA_Board_B',[row('U7',{...cpu,qty:2})])]);
  const [line]=buildProjectPartsRows(list);
  assert.equal(line[0],'IC');assert.equal(line[9],2);assert.equal(line[10],'QA_Board_A ×1\nQA_Board_B ×2');assert.equal(line[11],3);
  assert.equal(line[12],'QA_Board_A：U1\nQA_Board_B：U7');assert.equal(line[13],'');
  assert.equal(PROJECT_PARTS_HEADERS.length,line.length);
  assert.equal(projectPartsFileName('QA/專案 X','PJE備料表',new Date(2026,10,19)),'QA-專案_X_PJE備料表_20261119.xlsx');
});

test('parts known only by name stay apart; the same vendor part merges even when one board has no number yet',()=>{
  const nameOnly={manufacturer:'',manufacturerPartNumber:'',partNumber:'',virtualAlternative:''};
  const a=[row('H1',{...nameOnly,name:'QA SCREW M2'}),row('H2',{...nameOnly,name:'QA HEATSINK'}),row('U1',{...cpu,partNumber:'QA-PHYS-9'})];
  const b=[row('H5',{...nameOnly,name:'QA SCREW M2',qty:4}),row('U3',{...cpu,partNumber:'',virtualAlternative:''})];
  const list=buildProjectParts([board('s-a','A',a),board('s-b','B',b)]);
  const names=list.map(part=>part.name).sort();
  assert.deepEqual(plain(names),['QA CPU SOCKET PART','QA HEATSINK','QA SCREW M2']);
  const screw=list.find(part=>part.name==='QA SCREW M2');
  assert.equal(screw.totalQty,5,'the same name-only part on two boards still merges');
  const chip=list.find(part=>part.mpn==='QA-CPU-1');
  assert.equal(chip.totalQty,2,'one PJE row with the full quantity');
  assert.equal(chip.physicalPartNumber,'QA-PHYS-9');
  assert.equal(chip.status,'physical');
  assert.deepEqual(plain(buildPjeRows(list).filter(line=>line[2]==='QA-CPU-1')),[['QA CPU SOCKET PART','QA CPU MAKER','QA-CPU-1','A ×1、B ×1',2]]);
});

test('a risk, a status or an urgent category on any board counts, whatever the board order',()=>{
  const plainPart={name:'QA OSC',manufacturer:'QA OSC MAKER',manufacturerPartNumber:'QA-OSC-1'};
  for(const order of [['a','b'],['b','a']]){
    const boards={a:board('s-a','A',[row('X1',{...plainPart})]),b:board('s-b','B',[row('U3',{...plainPart,partUsageStatus:'停產'})])};
    const [part]=buildProjectParts(order.map(key=>boards[key]));
    assert.equal(part.risk,true,order.join());assert.equal(part.usageStatus,'停產');assert.equal(part.category,'ic');
  }
  // EOL in 供料狀態 alone is a risk, and the row says so.
  const [eol]=buildProjectParts([board('s-a','A',[row('U9',{name:'QA EOL IC',manufacturerPartNumber:'QA-EOL',sourcingStatus:'EOL'})])]);
  assert.equal(eol.risk,true);assert.equal(eol.usageStatus,'EOL');
});

test('quantities are read per position, TEMP numbers are not part numbers, a CPU is an IC',()=>{
  const cap={name:'QA CAP 1uF',manufacturer:'QA CAP MAKER',manufacturerPartNumber:'QA-CAP-1'};
  const list=buildProjectParts([board('s-a','A',[row('C1',{...cap,qty:2}),row('C2',{...cap,qty:'x'}),row('C3',{...cap,qty:3})]),board('s-b','B',[row('C9',{...cap,qty:5})])]);
  assert.equal(list.length,1);
  assert.equal(list[0].uses[0].qty,5);assert.deepEqual(plain(list[0].uses[0].missingRefs),['C2']);assert.equal(list[0].uses[1].qty,5);
  assert.equal(list[0].totalQty,10);assert.equal(list[0].missingCount,1);
  assert.deepEqual(plain(buildPjeRows(list)[0].slice(3)),['A ×5（+1 未填）、B ×5',10],'PJE sees the position without a quantity');
  // Only plain numbers are quantities: no hex, exponent or negative number sneaks into the total.
  const [strict]=buildProjectParts([board('s-a','A',[row('C1',{...cap,qty:'1e2'}),row('C2',{...cap,qty:'0x10'}),row('C3',{...cap,qty:'-1'}),row('C4',{...cap,qty:'1,200'})])]);
  assert.equal(strict.totalQty,1200);assert.deepEqual(plain(strict.uses[0].missingRefs),['C1','C2','C3']);
  const [temp]=buildProjectParts([board('s-a','A',[row('U5',{name:'QA TEMP IC',manufacturerPartNumber:'QA-TEMP',partNumber:'TEMP-0001'})])]);
  assert.equal(temp.status,'unnumbered');assert.equal(temp.physicalPartNumber,'');
  const [processor]=buildProjectParts([board('s-a','A',[row('CPU1',{...cpu})])]);
  assert.equal(processor.category,'ic');
});

test('makers are compared without case, so one filter option finds every spelling',()=>{
  const list=buildProjectParts([board('s-a','A',[row('U1',{name:'QA ONE',manufacturer:'QA Maker',manufacturerPartNumber:'QA-1'}),row('U2',{name:'QA TWO',manufacturer:'QA MAKER',manufacturerPartNumber:'QA-2'})])]);
  const [option,...others]=projectPartColumnOptions(list,'manufacturer');
  assert.equal(others.length,0);assert.equal(option.count,2);assert.equal(option.label,'QA Maker');
  assert.equal(filterProjectParts(list,{...EMPTY_PROJECT_PARTS_FILTERS,columns:{manufacturer:[option.value]}}).length,2);
});

test('placeholder MPNs ("-", "N/A", "NC") are no part numbers, so different parts behind them stay apart',()=>{
  const list=buildProjectParts([
    board('s-a','A',[row('R10',{name:'QA RES 0R',manufacturer:'',manufacturerPartNumber:'-',partNumber:'',virtualAlternative:''}),row('J5',{name:'QA CONN',manufacturer:'',manufacturerPartNumber:'-',partNumber:'',virtualAlternative:''})]),
    board('s-b','B',[row('TP1',{name:'QA TEST POINT',manufacturer:'N/A',manufacturerPartNumber:'N/A',partNumber:'QA-PHYS-TP'}),row('H1',{name:'QA SCREW',manufacturer:'N/A',manufacturerPartNumber:'N/A',partNumber:'QA-PHYS-SCREW',qty:4}),
      row('R7',{name:'QA RES NC',manufacturerPartNumber:'NC'}),row('C7',{name:'QA CAP NC',manufacturerPartNumber:'NC'})]),
  ]);
  assert.deepEqual(plain(list.map(part=>part.name).sort()),['QA CAP NC','QA CONN','QA RES 0R','QA RES NC','QA SCREW','QA TEST POINT']);
  const screw=list.find(part=>part.name==='QA SCREW');
  assert.equal(screw.totalQty,4);assert.equal(screw.mpn,'','a placeholder is not shown as the PN');assert.equal(screw.manufacturer,'');
  assert.equal(list.find(part=>part.name==='QA CONN').category,'connector');
});

test('a TEMP number does not split a part from the board that already has its real number',()=>{
  const [part,...rest]=buildProjectParts([
    board('s-a','A',[row('U1',{name:'QA IC',manufacturer:'QA MAKER',manufacturerPartNumber:'',partNumber:'TEMP-0001',virtualAlternative:''})]),
    board('s-b','B',[row('U2',{name:'QA IC',manufacturer:'QA MAKER',manufacturerPartNumber:'',partNumber:'',virtualAlternative:''})]),
  ]);
  assert.equal(rest.length,0);assert.equal(part.totalQty,2);
});

test('the most urgent category of any position counts, also on one board',()=>{
  const osc={name:'QA OSC 25MHz',manufacturer:'QA OSC MAKER',manufacturerPartNumber:'QA-OSC-25'};
  const [part]=buildProjectParts([board('s-a','A',[row('R1',{...osc}),row('U3',{...osc})])]);
  assert.equal(part.category,'ic');
  const [connector]=buildProjectParts([board('s-a','A',[row('CONN1',{name:'QA HEADER',manufacturerPartNumber:'QA-HDR-1'})])]);
  assert.equal(connector.category,'connector');
});

test('positions the BOM left without a quantity ("-", blank) stay out of the total and are named, "2.0" is 2',()=>{
  const header={name:'QA HEADER 2X5',manufacturer:'QA HDR MAKER',manufacturerPartNumber:'QA-HDR-10'};
  const list=buildProjectParts([
    board('s-a','QA_Board_A',[row('CONN1',{...header,qty:'2.0'}),row('TEMP-0000001',{...header,qty:'-'})]),
    board('s-b','QA_Board_B',[row('JMP1',{...header,qty:2})]),
  ]);
  assert.equal(list.length,1);
  const [part]=list;
  assert.deepEqual(plain(part.uses.map(use=>[use.board,use.qty,use.missingRefs])),[['QA_Board_A',2,['TEMP-0000001']],['QA_Board_B',2,[]]]);
  assert.equal(part.totalQty,4);assert.equal(part.missingCount,1);
  assert.equal(describeProjectPartBoards(part),'QA_Board_A ×2（+1 未填）、QA_Board_B ×2');
  assert.equal(describeProjectPartBoards({uses:[part.uses[0]]}),'QA_Board_A（+1 未填）','one board alone still says it');
  assert.equal(describeMissingQty(part),'QA_Board_A：TEMP-0000001');
  assert.deepEqual(plain(buildPjeRows(list)[0].slice(3)),['QA_Board_A ×2（+1 未填）、QA_Board_B ×2',4],'PJE gets a number, never "2.0+-+2", and sees what is not counted');
  const line=buildProjectPartsRows(list)[0];
  assert.equal(line[11],4);assert.equal(line[13],'QA_Board_A：TEMP-0000001');
  // A part whose every position lacks a quantity: 未填 on screen, an empty Usage for PJE.
  const [unknown]=buildProjectParts([board('s-a','QA_Board_A',[row('X9',{name:'QA CHIP CAP',manufacturerPartNumber:'QA-CAP-X',qty:''})])]);
  assert.equal(unknown.totalQty,null);assert.equal(projectPartQtyLabel(unknown),'未填');
  assert.equal(buildPjeRows([unknown])[0][4],'');
});

test('a column filter lists the values the other filters leave, and the columns sort A to Z or by quantity',()=>{
  const list=buildProjectParts([
    board('s-a','QA_Board_A',[row('U1',{...cpu,qty:1}),row('J1',{...conn,qty:3}),row('R1',{name:'QA RES 10K',manufacturer:'QA RES MAKER',qty:''})]),
    board('s-b','QA_Board_B',[row('U7',{...cpu,qty:2})]),
  ]);
  const boards=projectPartColumnOptions(list,'boards');
  assert.deepEqual(plain(boards.map(option=>[option.value,option.count])),[['QA_Board_A',3],['QA_Board_B',1]]);
  const onlyB=filterProjectParts(list,{...EMPTY_PROJECT_PARTS_FILTERS,columns:{boards:['QA_Board_B']}},'manufacturer');
  assert.deepEqual(plain(projectPartColumnOptions(onlyB,'manufacturer').map(option=>option.label)),['QA CPU MAKER'],'the maker list follows the board filter');
  assert.deepEqual(plain(filterProjectParts(list,{...EMPTY_PROJECT_PARTS_FILTERS,columns:{boards:['QA_Board_B']}},'boards').length),3,'its own filter is left out of its list');
  assert.deepEqual(plain(projectPartColumnOptions(list,'qty').map(option=>option.value).sort()),['3','有未填用量的位號','未填'],'a part with any position unfilled can be found');
  const byQty=sortProjectParts(list,{key:'qty',direction:'desc'}).map(part=>part.totalQty);
  assert.deepEqual(plain(byQty),[3,3,null],'未填 stays last');
  const byName=sortProjectParts(list,{key:'name',direction:'asc'}).map(part=>part.name);
  assert.deepEqual(plain(byName),['QA CONN 2X10','QA CPU SOCKET PART','QA RES 10K']);
  assert.equal(sortProjectParts(list,null),list,'no sort keeps the default order');
});

test('a part knows the rows behind it on each board and whether its category was picked by hand',()=>{
  const osc={name:'QA OSC 25MHz',manufacturer:'QA OSC MAKER',manufacturerPartNumber:'QA-OSC-25'};
  const a=[row('U3',{...osc}),row('U3',{...osc,isGroupStart:false,manufacturer:'QA OSC MAKER B',manufacturerPartNumber:'QA-OSC-25B'})];
  const b=[row('X7',{...osc,pendingCategory:'other'})];
  const [part,...rest]=buildProjectParts([board('s-a','A',a),board('s-b','B',b)]);
  assert.equal(rest.length,0);
  assert.deepEqual(plain(part.uses.map(use=>[use.boardId,use.recordIds])),[['s-a',[a[0].id,a[1].id]],['s-b',[b[0].id]]],'main and alternate rows, per board');
  assert.equal(part.category,'other');assert.equal(part.manualCategory,true,'a hand-picked category on any board wins');
  assert.equal(part.autoCategory,'ic','依位號自動 would bring back the most urgent position (U3)');
  const [plainPart]=buildProjectParts([board('s-a','A',[row('U9',{...osc})])]);
  assert.equal(plainPart.manualCategory,false);assert.equal(plainPart.category,'ic');assert.equal(plainPart.autoCategory,'ic');
});

test('a hand-picked category is written only to rows that still show the part it was picked for',()=>{
  const ic={name:'QA IC',manufacturer:'QA MAKER',manufacturerPartNumber:'QA-IC-1'};
  const shown=[row('U1',{...ic}),row('U1',{...ic,isGroupStart:false,manufacturer:'QA MAKER B',manufacturerPartNumber:'QA-IC-1B'}),row('U2',{...ic,pendingCategory:'other'})];
  const rows=shown.map(record=>({id:record.id,signature:projectPartRowSignature(record)}));
  // The same ids after a new upload: U1's row is now another part, one row is gone.
  const now=[{...shown[0],refDes:'R9',manufacturerPartNumber:'QA-RES-9'},shown[1],shown[2]];
  const plan=planProjectPartCategory(now,rows,'other');
  assert.deepEqual(plain(plan.updates.map(record=>[record.id,record.pendingCategory])),[[shown[1].id,'other']],'U2 already is 其他; the changed row is not touched');
  assert.equal(plan.moved,1);
  const gone=planProjectPartCategory([shown[1]],rows,null);
  assert.equal(gone.moved,2,'rows that are not there any more count as moved');
  const auto=planProjectPartCategory(shown,rows,null);
  assert.deepEqual(plain(auto.updates.map(record=>record.id)),[shown[2].id],'依位號自動 clears only rows with a hand-picked category');
  assert.equal('pendingCategory' in auto.updates[0],false);
  assert.equal(shown[2].pendingCategory,'other','the given rows are never changed');
});
