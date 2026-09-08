import type { PcbModelAsset } from "../types.ts";

/** Orthographic mechanical projection. Every triangle participates in the depth
 * buffer: cavities stay open and hidden faces cannot paint over the housing.
 * STEP geometry does not supply electrical pads or pin numbering. */
export function rasterizePcbModelTopView(asset: PcbModelAsset, resolution = 1024) {
  const { bounds, upAxis, calibratedDimensions } = asset.metadata;
  const axes = upAxis === "x" ? [1, 2, 0] : upAxis === "y" ? [0, 2, 1] : [0, 1, 2];
  const [ax, ay, az] = axes;
  const ratio = calibratedDimensions.widthMm / calibratedDimensions.depthMm;
  const size = Math.max(16, Math.min(2048, Math.round(resolution)));
  const width = Math.max(4, Math.round(size * Math.min(1, ratio)));
  const height = Math.max(4, Math.round(size * Math.min(1, 1 / ratio)));
  const rgba = new Uint8ClampedArray(width * height * 4);
  const depth = new Float64Array(width * height).fill(-Infinity);
  const normal = new Float32Array(width * height * 3);
  const spanX = Math.max(bounds.max[ax] - bounds.min[ax], 0.001);
  const spanY = Math.max(bounds.max[ay] - bounds.min[ay], 0.001);
  for (const part of asset.parts) {
    const color = asset.metadata.parts.find(meta => meta.id === part.id)?.color ?? [0.66, 0.71, 0.75];
    const p = part.position;
    for (let t = 0; t < part.index.length; t += 3) {
      const ids = [part.index[t] * 3, part.index[t + 1] * 3, part.index[t + 2] * 3];
      const x = ids.map(i => 1 + (p[i + ax] - bounds.min[ax]) / spanX * (width - 3));
      const y = ids.map(i => 1 + (p[i + ay] - bounds.min[ay]) / spanY * (height - 3));
      const z = ids.map(i => p[i + az]);
      const area = (x[1]-x[0])*(y[2]-y[0])-(y[1]-y[0])*(x[2]-x[0]);
      if (Math.abs(area) < 1e-10) continue;
      const u = axes.map(a => p[ids[1]+a]-p[ids[0]+a]);
      const v = axes.map(a => p[ids[2]+a]-p[ids[0]+a]);
      const n = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const length = Math.hypot(...n) || 1;
      const sign = n[2] < 0 ? -1 : 1;
      const nn = n.map(value => value / length * sign);
      const light = 0.7 + 0.3 * Math.max(0, nn[0]*-0.3 + nn[1]*-0.4 + nn[2]*0.866);
      const left = Math.max(0, Math.floor(Math.min(...x))), right = Math.min(width-1, Math.ceil(Math.max(...x)));
      const top = Math.max(0, Math.floor(Math.min(...y))), bottom = Math.min(height-1, Math.ceil(Math.max(...y)));
      for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
        const bx = px + 0.5, by = py + 0.5;
        const b = ((bx-x[0])*(y[2]-y[0])-(by-y[0])*(x[2]-x[0])) / area;
        const c = ((x[1]-x[0])*(by-y[0])-(y[1]-y[0])*(bx-x[0])) / area;
        const a = 1-b-c;
        if (a < -1e-7 || b < -1e-7 || c < -1e-7) continue;
        const index = py * width + px, d = a*z[0]+b*z[1]+c*z[2];
        if (d <= depth[index]) continue;
        depth[index] = d;
        for (let channel=0; channel<3; channel++) {
          rgba[index*4+channel] = color[channel]*255*light;
          normal[index*3+channel] = nn[channel];
        }
        rgba[index*4+3] = 255;
      }
    }
  }
  // Outline visible silhouettes, height steps and sharp creases, never the
  // triangulation diagonals. Use the unchanged buffers when comparing pixels.
  const step = Math.max(spanX/(width-3), spanY/(height-3)) * 2.5;
  for (let y=1; y<height-1; y++) for (let x=1; x<width-1; x++) {
    const i=y*width+x;
    if (!Number.isFinite(depth[i])) continue;
    const edge=[i-1,i+1,i-width,i+width].some(j => !Number.isFinite(depth[j])
      || Math.abs(depth[i]-depth[j]) > step
      || normal[i*3]*normal[j*3]+normal[i*3+1]*normal[j*3+1]+normal[i*3+2]*normal[j*3+2] < 0.72);
    if (edge) for (let c=0;c<3;c++) rgba[i*4+c] = Math.round(rgba[i*4+c]*0.36);
  }
  return { width, height, rgba };
}

const previewCache = new WeakMap<PcbModelAsset, string>();
export function getPcbModelTopViewImage(asset: PcbModelAsset): string {
  const cached = previewCache.get(asset);
  if (cached) return cached;
  const result = rasterizePcbModelTopView(asset);
  const canvas = document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.putImageData(new ImageData(result.rgba, result.width, result.height), 0, 0);
  const image = canvas.toDataURL("image/png");
  previewCache.set(asset, image);
  return image;
}

/** Swapping the up axis reflects the mesh. Reverse winding with the positions
 * so front faces and lighting remain outward-facing for X-up and Z-up STEP. */
export function getPcbModelRenderIndices(index: number[], upAxis: "x" | "y" | "z") {
  if (upAxis === "y") return index;
  const corrected = index.slice();
  for (let i = 0; i < corrected.length; i += 3) {
    [corrected[i+1], corrected[i+2]] = [corrected[i+2], corrected[i+1]];
  }
  return corrected;
}
