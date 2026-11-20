import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';

const {loader}=createRequire(import.meta.url)('./support/renderHarness.cjs');
const load=loader({globals:{Blob}});
const parts=load('src/components/material-requests/projectParts.ts');
const {buildProjectParts,filterProjectParts,buildPjeRows,buildPjeWorkbook,buildProjectPartsRows,describeProjectPartBoards,describeMissingQty,projectPartsFileName,
  projectPartColumnOptions,projectPartQtyLabel,sortProjectParts,planProjectPartCategory,projectPartRowSignature,describeProjectPartRefs,projectLocationPositions,projectPartUsesOn,planPjeExport,describeProjectBoardFilter,EMPTY_PROJECT_PARTS_FILTERS,PROJECT_PARTS_HEADERS,PJE_HEADERS,PJE_SHEET_NAME}=parts;

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

test('the PJE sheet starts with the part numbers, keeps the template\'s five columns in order, adds Ref Des and 備註, one row per board',async()=>{
  const list=buildProjectParts([board('s-a','QA_Board_A',[row('U1',{...cpu}),row('J1',{...conn,qty:2})]),board('s-b','QA_Board_B',[row('U7',{...cpu,qty:2})])]);
  const headers=['虛擬料號','實體料號','Items','Vendor','PN','使用在哪個板子','Usage','Ref Des','備註'];
  assert.deepEqual(plain([...PJE_HEADERS]),headers);
  // The CPU on two boards is two rows next to each other, each with its own board, that board's quantity and positions.
  assert.deepEqual(plain(buildPjeRows(list).map(row=>[...row])),[
    ['QA-VIRT-CONN','QA-PHYS-CONN','QA CONN 2X10','QA CONN MAKER','QA-CONN-20','QA_Board_A',2,'J1',''],
    ['','QA-PHYS-CPU','QA CPU SOCKET PART','QA CPU MAKER','QA-CPU-1','QA_Board_A',1,'U1',''],
    ['','QA-PHYS-CPU','QA CPU SOCKET PART','QA CPU MAKER','QA-CPU-1','QA_Board_B',2,'U7',''],
  ]);
  const blob=await buildPjeWorkbook(list,{projectName:'QA 專案',exportedBy:'QA',exportedAt:new Date('2026-11-19T00:00:00Z')});
  const book=new ExcelJS.Workbook();await book.xlsx.load(await blob.arrayBuffer());
  assert.deepEqual(plain(book.worksheets.map(sheet=>sheet.name)),[PJE_SHEET_NAME]);
  const sheet=book.worksheets[0];
  assert.deepEqual(plain(sheet.getRow(1).values.slice(1)),headers);
  for(let column=1;column<=9;column++){const cell=sheet.getRow(1).getCell(column);assert.equal(cell.font.bold,true);assert.equal(cell.fill.fgColor.argb,'FFCAEDFB');}
  // The template's widths follow its columns (Vendor, PN, 使用在哪個板子); the part numbers are wide enough to read.
  assert.deepEqual(plain([1,2,3,4,5,6,8,9].map(column=>sheet.getColumn(column).width)),[18,18,44,21,22.125,27.375,36,30]);
  // The template's header: Calibri 7 bold dark blue (Microsoft JhengHei for the Chinese headers), centred, wrapped, thin borders.
  for(let column=1;column<=9;column++){const cell=sheet.getRow(1).getCell(column);assert.equal(cell.font.size,7);assert.equal(cell.font.color.argb,'FF002060');assert.equal(cell.font.name,[1,2,6,9].includes(column)?'Microsoft JhengHei':'Calibri',headers[column-1]);
    assert.equal(cell.alignment.horizontal,'center');assert.equal(cell.alignment.vertical,'middle');assert.equal(cell.alignment.wrapText,true);for(const side of ['top','left','bottom','right'])assert.equal(cell.border[side].style,'thin');}
  assert.equal(sheet.views[0].state,'frozen');assert.equal(sheet.views[0].ySplit,1);
  assert.deepEqual(plain(sheet.getRow(2).values.slice(1,9)),['QA-VIRT-CONN','QA-PHYS-CONN','QA CONN 2X10','QA CONN MAKER','QA-CONN-20','QA_Board_A',2,'J1']);
  assert.deepEqual(plain(sheet.getRow(3).values.slice(2,9)),['QA-PHYS-CPU','QA CPU SOCKET PART','QA CPU MAKER','QA-CPU-1','QA_Board_A',1,'U1']);
  assert.deepEqual(plain(sheet.getRow(4).values.slice(2,9)),['QA-PHYS-CPU','QA CPU SOCKET PART','QA CPU MAKER','QA-CPU-1','QA_Board_B',2,'U7']);
  assert.equal(sheet.getRow(4).getCell(1).type,ExcelJS.ValueType.Null,'no virtual number on the CPU: a truly blank cell (Excel finds it as blank), the physical one never stands in');
  assert.equal(sheet.getRow(4).getCell(9).type,ExcelJS.ValueType.Null,'an empty 備註 is blank too');
  assert.equal(typeof sheet.getRow(4).getCell(7).value,'number','Usage stays a number PJE can add up');
  assert.equal(sheet.rowCount,4);
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
  assert.equal(chip.totalQty,2,'one part with both boards\' quantity');
  assert.equal(chip.physicalPartNumber,'QA-PHYS-9');
  assert.equal(chip.status,'physical');
  assert.deepEqual(plain(buildPjeRows(list).filter(line=>line[4]==='QA-CPU-1')),[['','QA-PHYS-9','QA CPU SOCKET PART','QA CPU MAKER','QA-CPU-1','A',1,'U1',''],['','QA-PHYS-9','QA CPU SOCKET PART','QA CPU MAKER','QA-CPU-1','B',1,'U3','本板 BOM 沒有正式實體料號，取自 A']],
    'one PJE row per board under the same Items / Vendor / PN; board B, not numbered yet, gets the part\'s one number and says where from');
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
  assert.deepEqual(plain(buildPjeRows(list).map(line=>line.slice(5))),[['A',5,'C1, C2, C3','+1 未填用量：C2'],['B',5,'C9','']],'PJE sees the position without a quantity on its board, the board cell stays the board');
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
  assert.deepEqual(plain(part.uses.map(use=>[use.board,use.qty,use.missingRefs,use.refs])),[['QA_Board_A',2,['沒有位號（TEMP-0000001）'],'CONN1'],['QA_Board_B',2,[],'JMP1']]);
  assert.equal(part.totalQty,4);assert.equal(part.missingCount,1);
  assert.equal(describeProjectPartBoards(part),'QA_Board_A ×2（+1 未填）、QA_Board_B ×2');
  assert.equal(describeProjectPartBoards({uses:[part.uses[0]]}),'QA_Board_A（+1 未填）','one board alone still says it');
  assert.equal(describeMissingQty(part),'QA_Board_A：沒有位號（TEMP-0000001）');
  assert.deepEqual(plain(buildPjeRows(list).map(line=>line.slice(5))),[['QA_Board_A',2,'CONN1','+1 未填用量：沒有位號（TEMP-0000001）'],['QA_Board_B',2,'JMP1','']],'PJE gets numbers, never "2.0+-+2", and sees what is not counted');
  const line=buildProjectPartsRows(list)[0];
  assert.equal(line[11],4);assert.equal(line[13],'QA_Board_A：沒有位號（TEMP-0000001）');
  // A part whose every position lacks a quantity: 未填 on screen, an empty Usage for PJE.
  const [unknown]=buildProjectParts([board('s-a','QA_Board_A',[row('X9',{name:'QA CHIP CAP',manufacturerPartNumber:'QA-CAP-X',qty:''})])]);
  assert.equal(unknown.totalQty,null);assert.equal(projectPartQtyLabel(unknown),'未填');
  assert.deepEqual(plain(buildPjeRows([unknown]).map(line=>line.slice(5))),[['QA_Board_A','','X9','用量未填：X9']],'an empty Usage says why in 備註');
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

test('Ref Des: each board\'s positions in the table and in PJE, and the column filter finds a part by one position',()=>{
  const res={name:'QA RES 0R',manufacturer:'QA RES MAKER',manufacturerPartNumber:'QA-RES-0R'};
  const list=buildProjectParts([
    board('s-a','QA_Board_A',[row('R1',{...res,qty:1}),row('R2, R3',{...res,qty:2})]),
    board('s-b','QA_Board_B',[row('R7',{...res,qty:1})]),
    board('s-c','QA_Board_C',[row('',{name:'QA LABEL',manufacturer:'',manufacturerPartNumber:'',qty:1})]),
  ]);
  const part=list.find(item=>item.mpn==='QA-RES-0R');
  assert.equal(describeProjectPartRefs(part),'QA_Board_A：R1, R2, R3；QA_Board_B：R7','several boards: each board names its positions');
  assert.equal(describeProjectPartRefs(part,'\n'),'QA_Board_A：R1, R2, R3\nQA_Board_B：R7');
  assert.equal(describeProjectPartRefs({uses:[part.uses[1]]}),'R7','one board: just the positions');
  const f=columns=>filterProjectParts(list,{...EMPTY_PROJECT_PARTS_FILTERS,columns}).map(item=>item.mpn||item.name);
  assert.deepEqual(plain(f({refDes:['R3']})),['QA-RES-0R'],'a position inside "R2, R3" is its own filter value');
  assert.deepEqual(plain(f({refDes:['(空白)']})),['QA LABEL'],'a row without a position is (空白)');
  const values=projectPartColumnOptions(list,'refDes').map(option=>option.value);
  assert.deepEqual(plain(values),['R1','R2','R3','R7','(空白)']);
  assert.deepEqual(plain(buildPjeRows([part]).map(line=>[line[5],line[7]])),[['QA_Board_A','R1, R2, R3'],['QA_Board_B','R7']],'PJE: the positions of that row\'s board');
});

test('PJE part numbers: each board\'s own; a board without a physical number gets the part\'s one number, never a virtual group',()=>{
  const ic={name:'QA PMIC',manufacturer:'QA PMIC MAKER',manufacturerPartNumber:'QA-PMIC-1'};
  const list=buildProjectParts([
    board('s-a','A',[row('U1',{...ic,partNumber:'QA-PHYS-A',virtualAlternative:'QA-VIRT-1'})]),
    board('s-b','B',[row('U2',{...ic,partNumber:'QA-PHYS-B',virtualAlternative:''})]),
    board('s-c','C',[row('U3',{...ic,partNumber:'TEMP-0000009',virtualAlternative:'N/A'})]),
  ]);
  assert.equal(list.length,1,'one vendor part');
  const [part]=list;
  assert.equal(part.physicalPartNumber,'QA-PHYS-A、QA-PHYS-B','the screen lists every number the boards gave');
  assert.deepEqual(plain(part.uses.map(use=>[use.board,use.virtualNumbers,use.physicalNumbers])),[['A',['QA-VIRT-1'],['QA-PHYS-A']],['B',[],['QA-PHYS-B']],['C',[],[]]],
    'each board keeps what its BOM wrote; TEMP- and N/A are no numbers');
  assert.deepEqual(plain(buildPjeRows(list).map(line=>[line[5],line[0],line[1],line[8]])),[
    ['A','QA-VIRT-1','QA-PHYS-A',''],
    ['B','','QA-PHYS-B',''],
    ['C','','','本板 BOM 沒有正式實體料號，各板不同：A＝QA-PHYS-A；B＝QA-PHYS-B'],
  ],'a virtual group is that board\'s own; different physical numbers are named in 備註, never put in one cell');
  // One physical number in the project: a board not numbered yet gets it and says where from; its virtual stays empty.
  const one=buildProjectParts([
    board('s-a','A',[row('U1',{...ic,partNumber:'QA-PHYS-1',virtualAlternative:'QA-VIRT-1'})]),
    board('s-b','B',[row('U2',{...ic,partNumber:'',virtualAlternative:'',qty:'-'})]),
    board('s-c','C',[row('U3',{...ic,partNumber:'qa-phys-1',virtualAlternative:''})]),
  ]);
  assert.equal(one[0].physicalPartNumber,'QA-PHYS-1','qa-phys-1 and QA-PHYS-1 are one number');
  assert.deepEqual(plain(buildPjeRows(one).map(line=>[line[5],line[0],line[1],line[8]])),[
    ['A','QA-VIRT-1','QA-PHYS-1',''],
    ['B','','QA-PHYS-1','用量未填：U2\n本板 BOM 沒有正式實體料號，取自 A、C'],
    ['C','','qa-phys-1',''],
  ]);
  // One board's own BOM gave the vendor part two numbers: both stay, 備註 says so; p1 / P1 is one filter value.
  const [twice]=buildProjectParts([board('s-a','A',[row('U1',{...ic,partNumber:'QA-PHYS-X'}),row('U2',{...ic,partNumber:'QA-PHYS-Y'})])]);
  assert.deepEqual(plain(buildPjeRows([twice]).map(line=>[line[1],line[8]])),[['QA-PHYS-X、QA-PHYS-Y','本板 BOM 給這顆料 2 個實體料號']]);
  const cased=buildProjectParts([board('s-a','A',[row('U1',{...ic,partNumber:'qa-phys-z'})]),board('s-b','B',[row('U7',{...ic,manufacturerPartNumber:'QA-PMIC-7',partNumber:'QA-PHYS-Z'})])]);
  assert.deepEqual(plain(projectPartColumnOptions(cased,'physical').map(option=>[option.value,option.label,option.count])),[['QA-PHYS-Z','qa-phys-z',2]],'one filter value for both spellings');
  assert.equal(filterProjectParts(cased,{...EMPTY_PROJECT_PARTS_FILTERS,columns:{physical:['QA-PHYS-Z']}}).length,2);
  // Only a virtual number anywhere: the physical cell stays empty.
  const [virtualOnly]=buildProjectParts([board('s-a','A',[row('U5',{...ic,manufacturerPartNumber:'QA-PMIC-5',partNumber:'',virtualAlternative:'QA-VIRT-5'})])]);
  assert.deepEqual(plain(buildPjeRows([virtualOnly]).map(line=>[line[0],line[1],line[8]])),[['QA-VIRT-5','','']]);
});

test('PJE with a board filter: only the rows of the filtered boards; a board not numbered yet still borrows from the others',async()=>{
  const ic={name:'QA PMIC',manufacturer:'QA PMIC MAKER',manufacturerPartNumber:'QA-PMIC-1'};
  const list=buildProjectParts([
    board('s-a','QA_Board_A',[row('U1',{...ic,partNumber:'QA-PHYS-1'}),row('R1',{partNumber:'QA-PHYS-R'})]),
    board('s-b','QA_Board_B',[row('U2',{...ic,partNumber:''}),row('J1',{partNumber:'QA-PHYS-J'})]),
    board('s-c','QA_Board_C',[row('U3',{...ic,partNumber:'QA-PHYS-1'})]),
  ]);
  const shown=filterProjectParts(list,{...EMPTY_PROJECT_PARTS_FILTERS,columns:{boards:['QA_Board_B']}});
  assert.deepEqual(plain(shown.map(part=>part.mpn).sort()),['QA-MPN-J1','QA-PMIC-1'],'the table keeps the parts used on B');
  assert.deepEqual(plain(buildPjeRows(shown,['QA_Board_B']).map(line=>[line[4],line[5],line[1],line[8]]).sort()),[
    ['QA-MPN-J1','QA_Board_B','QA-PHYS-J',''],
    ['QA-PMIC-1','QA_Board_B','QA-PHYS-1','本板 BOM 沒有正式實體料號，取自 QA_Board_A、QA_Board_C'],
  ],'only B\'s rows; its missing number still comes from the boards the filter hides');
  assert.deepEqual(plain(buildPjeRows(shown,['QA_Board_A','QA_Board_B']).map(line=>line[5]).sort()),['QA_Board_A','QA_Board_B','QA_Board_B'],'two boards: their rows only (C stays out)');
  assert.equal(buildPjeRows(shown).length,4,'no board filter: every board\'s row, as before');
  assert.equal(buildPjeRows(shown,[]).length,0,'no board ticked: no row');
  // A ticked part the board filter hides (R1, only on A) gets no row, and the plan counts it.
  const ticked=[...shown,list.find(part=>part.mpn==='QA-MPN-R1')];
  const plan=planPjeExport(ticked,['QA_Board_B']);
  assert.deepEqual(plain([plan.parts.map(part=>part.mpn).sort(),plan.lines,plan.skipped]),[['QA-MPN-J1','QA-PMIC-1'],2,1]);
  assert.deepEqual(plain(((p)=>[p.parts.length,p.lines,p.skipped])(planPjeExport(ticked))),[3,5,0],'no board filter: every part, every board');
  assert.deepEqual(plain(((p)=>[p.parts.length,p.lines,p.skipped])(planPjeExport(ticked,[]))),[0,0,3]);
  assert.equal(describeProjectBoardFilter(['QA_Board_A']),'QA_Board_A');
  assert.equal(describeProjectBoardFilter(['QA_Board_A','QA_Board_B','QA_Board_C']),'QA_Board_A、QA_Board_B 等 3 塊板子','short like the chip');
  assert.equal(describeProjectBoardFilter([]),'未選任何板子');
  // A board is matched by its filter value (a full-width space in the name is a plain one there).
  const [spaced]=buildProjectParts([board('s-d','QA\u3000Board_D',[row('U9',{...ic})])]);
  const [option]=projectPartColumnOptions([spaced],'boards');
  assert.equal(option.value,'QA Board_D');
  assert.equal(projectPartUsesOn(spaced,[option.value]).length,1,'the filter value of a board finds its row');
  assert.equal(projectPartUsesOn(spaced,['QA_Board_A']).length,0);
  const book=new ExcelJS.Workbook();
  await book.xlsx.load(await (await buildPjeWorkbook(shown,{projectName:'QA',exportedBy:'QA',exportedAt:new Date(2026,10,20)},['QA_Board_B'])).arrayBuffer());
  assert.equal(book.worksheets[0].rowCount,3,'header + B\'s two rows');
  assert.ok([2,3].every(line=>book.worksheets[0].getRow(line).getCell(6).value==='QA_Board_B'));
});

test('Ref Des holds only positions: no part number, name, placeholder or TEMP number, each position once; search still finds them',()=>{
  const at=(refDes,extra={})=>({refDes,refGroup:refDes,partNumber:'QA-PHYS-1',virtualAlternative:'',name:'QA HEADER 2X5',partName:'',manufacturerPartNumber:'QA-MPN-1',...extra});
  assert.deepEqual(plain(projectLocationPositions([at('J1, J2')])),['J1','J2']);
  // A blue-row group copies the part number or the name into refGroup when its first row has no 位號.
  assert.deepEqual(plain(projectLocationPositions([at('',{refGroup:'QA-PHYS-1'})])),[],'a part number in refGroup');
  assert.deepEqual(plain(projectLocationPositions([at('QA HEADER 2X5')])),[],'the name written in the 位號 column');
  assert.deepEqual(plain(projectLocationPositions([at('-')])),[],'a placeholder');
  assert.deepEqual(plain(projectLocationPositions([at('TEMP-0000009')])),[],'a TEMP number');
  assert.deepEqual(plain(projectLocationPositions([at(''),at('',{refGroup:'U5, U6'})])),['U5','U6'],'refGroup when no row wrote its own 位號');
  const hdr={name:'QA HDR',manufacturer:'QA MAKER',manufacturerPartNumber:'QA-HDR-1'};
  const list=buildProjectParts([board('s-a','A',[row('R1',{...hdr,sectionName:'S1'}),row('R1, R2',{...hdr,sectionName:'S2'}),row('TEMP-0000077',{...hdr,partNumber:'TEMP-0000077',qty:'-'})])]);
  assert.equal(list.length,1);
  assert.equal(list[0].uses[0].refs,'R1, R2','the same R1 in two sections is written once');
  const cased=buildProjectParts([board('s-a','A',[row('r1',{...hdr})]),board('s-b','B',[row('R1, R1',{...hdr})])]);
  assert.deepEqual(plain(projectPartColumnOptions(cased,'refDes').map(option=>option.value)),['R1'],'r1 and R1 are one filter value');
  assert.deepEqual(plain(cased[0].uses.map(use=>use.refs)),['r1','R1'],'each board keeps its own spelling');
  assert.equal(filterProjectParts(list,{...EMPTY_PROJECT_PARTS_FILTERS,query:'TEMP-0000077'}).length,1,'a TEMP number is still found by the search');
  // A board without any position next to one with positions: the cell says so and (空白) finds the part.
  const mixed=buildProjectParts([board('s-a','A',[row('U1',{...hdr})]),board('s-b','B',[row('',{...hdr,refGroup:''})])]);
  assert.equal(describeProjectPartRefs(mixed[0]),'A：U1；B：—');
  assert.equal(filterProjectParts(mixed,{...EMPTY_PROJECT_PARTS_FILTERS,columns:{refDes:['(空白)']}}).length,1);
});
