import type { PcbLibraryComponent, PcbModelAssetMetadata, PcbProject } from "../types.ts";

export function findRecoverableStepModels(
  assets: PcbModelAssetMetadata[],
  library: PcbLibraryComponent[],
  projects: PcbProject[],
): PcbModelAssetMetadata[] {
  const referenced = new Set([
    ...library.map(component => component.modelAssetId).filter(Boolean),
    ...projects.flatMap(project => project.components.map(component => component.modelAssetId).filter(Boolean)),
  ]);
  const fingerprint = (asset: PcbModelAssetMetadata) => {
    const dimensions = asset.calibratedDimensions;
    return [asset.fileName.trim().toLocaleLowerCase(), dimensions.widthMm.toFixed(4),
      dimensions.depthMm.toFixed(4), dimensions.heightMm.toFixed(4)].join("|");
  };
  const seen = new Set(assets.filter(asset => referenced.has(asset.id)).map(fingerprint));
  return assets.filter(asset => {
    if (referenced.has(asset.id)) return false;
    const key = fingerprint(asset);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
