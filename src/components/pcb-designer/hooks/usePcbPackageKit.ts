import { useEffect, useState } from "react";
import { loadPcbPackageKit, type PcbPackageKit } from "../core/packageModels.ts";

/** BASE_URL keeps the GitHub Pages sub-path (/station-status-hub/); bundles without import.meta fall back to a relative path. */
function packageKitUrl(): string {
  try {
    return `${import.meta.env.BASE_URL}models/pcb/pcb-package-kit.json`;
  } catch {
    return "models/pcb/pcb-package-kit.json";
  }
}

/** The Blender-built schematic package kit, loaded on first 3D use; null until loaded or when unavailable. */
export function usePcbPackageKit(): PcbPackageKit | null {
  const [kit, setKit] = useState<PcbPackageKit | null>(null);
  useEffect(() => {
    let active = true;
    void loadPcbPackageKit(packageKitUrl()).then((value) => {
      if (active) setKit(value);
    });
    return () => { active = false; };
  }, []);
  return kit;
}
