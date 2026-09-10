import type { PcbPoint as DxfPoint } from "../types.ts";
/** Join unordered/reversed LINE and ARC edges only at matching endpoints. Never close a real gap. */
export function stitchDxfLoops(paths: DxfPoint[][]): DxfPoint[][] {
  const near = (a: DxfPoint, b: DxfPoint) => Math.hypot(a.x-b.x,a.y-b.y) <= 0.01;
  const remaining = paths.filter(p => p.length > 1).map(p => p.map(q => ({...q})));
  const loops: DxfPoint[][] = [];
  while (remaining.length) {
    const chain = remaining.shift()!;
    while (!near(chain[0], chain[chain.length-1])) {
      const end = chain[chain.length-1];
      const matches = remaining.map((path,index) => ({path,index})).filter(({path}) => near(end,path[0]) || near(end,path[path.length-1]));
      if (matches.length !== 1) break;
      const {path,index} = matches[0]; remaining.splice(index,1);
      if (!near(end,path[0])) path.reverse();
      chain.push(...path.slice(1));
    }
    if (chain.length >= 4 && near(chain[0],chain[chain.length-1])) {
      chain[chain.length-1] = {...chain[0]};
      loops.push(chain);
    }
  }
  return loops;
}
