import { useEffect, useState } from "react";
import { loadPcbPackageKit, type PcbPackageKit } from "../core/packageModels.ts";

/** The Blender-built schematic package kit, loaded on first 3D use; null until loaded or when unavailable. */
export function usePcbPackageKit(): PcbPackageKit | null {
  const [kit, setKit] = useState<PcbPackageKit | null>(null);
  useEffect(() => {
    let active = true;
    // BASE_URL keeps the GitHub Pages sub-path (/station-status-hub/).
    void loadPcbPackageKit(`${import.meta.env.BASE_URL}models/pcb/pcb-package-kit.json`).then((value) => {
      if (active) setKit(value);
    });
    return () => { active = false; };
  }, []);
  return kit;
}
