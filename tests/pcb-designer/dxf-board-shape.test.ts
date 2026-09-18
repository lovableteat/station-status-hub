import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDxfBoardOutline } from '../../src/components/pcb-designer/core/dxf.ts';
import { getBoardPolygon, getBoardHoles, boardHolesError, pointInBoardPolygon } from '../../src/components/pcb-designer/core/boardOutline.ts';
import { isValidBoard } from '../../src/components/pcb-designer/core/validation.ts';
const points = [[0,0],[100,0],[100,80],[60,80],[60,50],[40,50],[40,80],[0,80]];
const edges = points.map((p,i) => {const q=points[(i+1)%points.length];return [0,'LINE',10,p[0],20,p[1],11,q[0],21,q[1]];});
const text = [0,'SECTION',2,'ENTITIES',...edges.reverse().flat(),0,'CIRCLE',10,15,20,15,40,3,0,'LINE',10,300,20,300,11,400,21,300,0,'ENDSEC',0,'EOF'].join('\n');
test('DXF joins unordered edges into a notched substrate and keeps a real drilled hole after JSON reload',()=>{
 const parsed=parseDxfBoardOutline(text);
 assert.equal(parsed.width,100); assert.equal(parsed.height,80); assert.equal(parsed.holes?.length,1);
 const board=JSON.parse(JSON.stringify({width:100,height:80,gridSize:1,showGrid:true,snapToGrid:true,background:'#164',outline:parsed.paths,holes:parsed.holes,outlineSource:'ME.dxf'}));
 assert.equal(isValidBoard(board),true); assert.equal(boardHolesError(board),'');
 assert.equal(getBoardPolygon(board).length,8); assert.equal(getBoardHoles(board).length,1);
 assert.equal(pointInBoardPolygon({x:50,y:10},getBoardPolygon(board)),false);
 assert.equal(pointInBoardPolygon({x:15,y:65},getBoardHoles(board)[0]),true);
});
test('an open edge is not silently turned into a rectangular board',()=>{
 assert.throws(()=>parseDxfBoardOutline([0,'SECTION',2,'ENTITIES',...edges.slice(1).flat(),0,'ENDSEC',0,'EOF'].join('\n')),/封閉板框/);
});
test('inch dimensions convert to millimetres and bulge curvature is preserved',()=>{
 const drawing=[0,'SECTION',2,'HEADER',9,'$INSUNITS',70,1,0,'ENDSEC',0,'SECTION',2,'ENTITIES',0,'LWPOLYLINE',70,1,10,0,20,0,42,1,10,2,20,0,10,2,20,2,10,0,20,2,0,'ENDSEC',0,'EOF'].join('\n');
 const parsed=parseDxfBoardOutline(drawing);assert.equal(parsed.width,50.8);assert.ok(parsed.height>50.8);assert.ok(parsed.paths[0].length>20);
});
