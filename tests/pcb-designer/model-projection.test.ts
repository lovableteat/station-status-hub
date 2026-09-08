import assert from "node:assert/strict";
import test from "node:test";
import { rasterizePcbModelTopView, getPcbModelRenderIndices } from "../../src/components/pcb-designer/core/modelProjection.ts";
import { mapPcbModelPartToComponentSpace } from "../../src/components/pcb-designer/core/modelAssets.ts";
import type { PcbModelAsset } from "../../src/components/pcb-designer/types.ts";

function fixture(): PcbModelAsset {
  return { metadata: { schemaVersion: 1, id: "fixture", fileName: "fixture.stp", createdAt: "", updatedAt: "",
    dimensions: {widthMm:10,depthMm:10,heightMm:2}, calibratedDimensions:{widthMm:10,depthMm:10,heightMm:2},
    bounds:{min:[0,0,0],max:[10,10,2]}, upAxis:"z", parts:[] }, parts:[] };
}
function rectangle(asset: PcbModelAsset, x: number, y: number, w: number, h: number, z=1, color: [number,number,number]=[0.5,0.6,0.7]) {
  const id=`part-${asset.parts.length}`;
  asset.parts.push({id,position:[x,y,z,x+w,y,z,x+w,y+h,z,x,y+h,z],index:[0,1,2,0,2,3]});
  asset.metadata.parts.push({id,name:id,vertexCount:4,indexCount:6,color});
}
function pixel(image: ReturnType<typeof rasterizePcbModelTopView>, x:number,y:number) {
  return Array.from(image.rgba.slice((y*image.width+x)*4,(y*image.width+x)*4+4));
}
test("mechanical top view keeps cavities and separated terminals instead of a convex rectangle",()=>{
  const asset=fixture();
  rectangle(asset,0,0,10,2); rectangle(asset,0,8,10,2); rectangle(asset,0,2,2,6); rectangle(asset,8,2,2,6);
  const image=rasterizePcbModelTopView(asset,100);
  assert.equal(pixel(image,50,50)[3],0,"center cavity must remain open");
  assert.equal(pixel(image,50,10)[3],255,"housing must be opaque");
  assert.equal(pixel(image,0,0)[3],0,"outside silhouette must stay transparent");
});
test("top view uses depth, not part order, and preserves source colors without invented gold pads",()=>{
  const asset=fixture(); rectangle(asset,0,0,10,10,2,[0.8,0.1,0.1]); rectangle(asset,0,0,10,10,0,[0.1,0.1,0.8]);
  const image=rasterizePcbModelTopView(asset,64);
  const center=pixel(image,32,32);
  assert.ok(center[0]>center[2]*4,"upper red face must occlude later blue face");
  asset.parts.reverse();
  assert.deepEqual(rasterizePcbModelTopView(asset,64).rgba,image.rgba);
});
test("preview retains calibrated aspect ratio",()=>{
  const asset=fixture(); rectangle(asset,0,0,10,10);
  asset.metadata.calibratedDimensions={widthMm:20,depthMm:10,heightMm:2};
  const image=rasterizePcbModelTopView(asset,128);
  assert.equal(image.width,128); assert.equal(image.height,64);
});
test("all STEP up axes retain outward top-face winding after mapping",()=>{
  for(const upAxis of ["x","y","z"] as const){
    const asset=fixture();asset.metadata.upAxis=upAxis;
    const pos=upAxis==="x"?[1,0,0,1,1,0,1,0,1]:upAxis==="y"?[0,1,0,0,1,1,1,1,0]:[0,0,1,1,0,1,0,1,1];
    const part={id:"test",position:pos,index:[0,1,2]};
    const mapped=mapPcbModelPartToComponentSpace(part,asset,{width:10,height:10,maxHeight:2});
    const indices=getPcbModelRenderIndices(part.index,upAxis);
    const [a,b,c]=indices.map(i=>mapped.slice(i*3,i*3+3));
    const normalY=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
    assert.ok(normalY>0,`${upAxis}-up should face upward`);
    assert.deepEqual(part.index,[0,1,2],"source mesh is immutable");
  }
});
