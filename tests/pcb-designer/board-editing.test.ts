import assert from "node:assert/strict";
import test from "node:test";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import { boardNodesPath, getBoardPolygon, outlineError, sampleBoardNodes } from "../../src/components/pcb-designer/core/boardOutline.ts";
import { isWithinBoard } from "../../src/components/pcb-designer/core/geometry.ts";
import { parseProjectJson } from "../../src/components/pcb-designer/core/validation.ts";
import { createWorkspaceState, reduceWorkspaceState } from "../../src/components/pcb-designer/core/workspace.ts";
import { mapPcbModelPartToComponentSpace } from "../../src/components/pcb-designer/core/modelAssets.ts";
import type { PcbModelAsset } from "../../src/components/pcb-designer/types.ts";
import { resizeBoard } from "../../src/components/pcb-designer/core/resizeBoard.ts";
import { ShapeUtils, Vector2 } from "three";

test("curved board nodes survive JSON and concave board rejects crossings and off-board placements", () => {
  const project = createBlankProject();
  const nodes = [{ x: 5, y: 5, out: { x: 30, y: 20 } }, { x: 95, y: 5, in: { x: 70, y: 20 } }, { x: 95, y: 75 }, { x: 5, y: 75 }];
  const sampled = sampleBoardNodes(nodes);
  assert.ok(sampled.length > 4);
  assert.match(boardNodesPath(nodes, true), /C.*Z$/);
  assert.equal(outlineError(sampled, project.board), "");
  project.board = { ...project.board, outlineNodes: nodes, outlineSource: "手繪板框", outline: [[...sampled, sampled[0]]] };
  const parsed = parseProjectJson(JSON.stringify(project)); assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value.board.outlineNodes, nodes);
  assert.deepEqual(getBoardPolygon(project.board), sampled);
  assert.notEqual(outlineError([{x:0,y:0},{x:60,y:60},{x:0,y:60},{x:60,y:0}], project.board), "");
  const notch = [{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:55,y:80},{x:55,y:20},{x:45,y:20},{x:45,y:80},{x:0,y:80}];
  project.board.outline = [[...notch, notch[0]]];
  assert.equal(isWithinBoard({x:50,y:50,width:60,height:20,rotation:0}, project.board), false, "all four corners inside is insufficient across a notch");
  assert.equal(isWithinBoard({x:20,y:40,width:10,height:10,rotation:0}, project.board), true);
});

test("new revisions preserve original documents and choose unused revision numbers", () => {
  const project = createBlankProject("Control board"); project.projectGroup = "System E2"; project.revision = "R1";
  const data = { projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt };
  const state = createWorkspaceState(data, true), before = structuredClone(state.data.projects[0]);
  const next = reduceWorkspaceState(state, { type: "project/duplicate", projectId: project.id, newRevision: true });
  assert.deepEqual(next.data.projects.find(p => p.id === project.id), before);
  assert.equal(next.activeProject.revision, "R2"); assert.equal(next.activeProject.boardFamilyId, project.id);
  assert.equal(next.activeProject.projectGroup, "System E2"); assert.equal(next.activeProject.name, "Control board");
  const third = reduceWorkspaceState(next, { type: "project/duplicate", projectId: project.id, newRevision: true });
  assert.equal(third.activeProject.revision, "R3");
  assert.equal(reduceWorkspaceState(createWorkspaceState(data, false), { type: "project/duplicate", projectId: project.id, newRevision: true }).data.projects.length, 1);
});

test("board holes survive save and reject component placements in the void", () => {
  const project = createBlankProject();
  project.board.holes = [[{x:40,y:30},{x:60,y:30},{x:60,y:50},{x:40,y:50}]];
  assert.equal(isWithinBoard({x:50,y:40,width:4,height:4,rotation:0}, project.board), false);
  const result = parseProjectJson(JSON.stringify(project));
  assert.ok(result.ok);
  if (result.ok) assert.deepEqual(result.value.board.holes, project.board.holes);
  const scaled = resizeBoard(project, {width:200,height:160}, "top-left");
  assert.deepEqual(scaled.board.holes?.[0][0], {x:80,y:60});
  project.board.holes.push(structuredClone(project.board.holes[0]));
  assert.equal(parseProjectJson(project).ok, false, "overlapping holes rejected");
  project.board.holes.pop();
  project.board.holes[0][0].x = -5;
  assert.equal(parseProjectJson(project).ok, false);
});

test("triangulation used by compatibility 3D leaves the hole empty", () => {
  const outer = [new Vector2(0,0),new Vector2(100,0),new Vector2(100,80),new Vector2(0,80)];
  const hole = [new Vector2(40,30),new Vector2(60,30),new Vector2(60,50),new Vector2(40,50)];
  const points = [...outer,...hole];
  const area = ShapeUtils.triangulateShape(outer,[hole]).reduce((sum,ids)=>sum+Math.abs(ShapeUtils.area(ids.map(i=>points[i]))),0);
  assert.equal(area, 8000-400);
});

test("every model rotation grounds the entire multipart mesh without deforming or mutating it", () => {
  const asset: PcbModelAsset = { metadata: {schemaVersion:1,id:"test",fileName:"test.step",createdAt:"",updatedAt:"",upAxis:"y",dimensions:{widthMm:10,depthMm:6,heightMm:4},calibratedDimensions:{widthMm:10,depthMm:6,heightMm:4},bounds:{min:[0,0,0],max:[10,4,6]},parts:[]},
    parts: [{id:"a",position:[0,0,0,10,0,0,0,4,0],index:[0,1,2]}, {id:"b",position:[0,0,6,10,0,6,0,4,6],index:[0,1,2]}] };
  const before = structuredClone(asset);
  for (const modelRotation of [{x:0,y:0,z:0},{x:90,y:0,z:0},{x:180,y:0,z:0},{x:0,y:90,z:0},{x:0,y:0,z:270},{x:37,y:21,z:51}]) {
    const component = {width:10,height:6,maxHeight:4,modelRotation};
    const points = asset.parts.flatMap(part => { const p = mapPcbModelPartToComponentSpace(part, asset, component); return Array.from({length:p.length/3},(_,i)=>p.slice(i*3,i*3+3)); });
    assert.ok(Math.abs(Math.min(...points.map(p=>p[1])) + component.maxHeight/2) < 1e-8);
    assert.ok(Math.abs(Math.hypot(...points[0].map((p,i)=>p-points[1][i])) - 10) < 1e-8);
  }
  assert.deepEqual(asset, before);
});
