import { Suspense, useEffect, useMemo, useState } from "react";
import { Bounds, Grid, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Box, Eye, EyeOff, Focus, Layers3, Rotate3d, ScanLine, Search, X } from "lucide-react";
import * as THREE from "three";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import type { RackModelDefinition } from "./dataCenterTypes";
import { getUniformModelFit } from "./modelFit.mjs";
import { getModelAxisRotation } from "./modelOrientation.mjs";
import {
  collectInspectablePartNames,
  getInspectablePartName,
} from "./modelParts.mjs";

type ViewerMode = "solid" | "xray" | "wireframe";

interface DataCenterModelViewerProps {
  open: boolean;
  model: RackModelDefinition | null;
  onOpenChange: (open: boolean) => void;
}

function ConfigureRenderer() {
  const { gl } = useThree();

  useEffect(() => {
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = false;
    };
  }, [gl]);

  return null;
}

function ModelLoadingState() {
  return (
    <mesh>
      <boxGeometry args={[0.35, 0.35, 0.35]} />
      <meshStandardMaterial color="#38bdf8" wireframe />
    </mesh>
  );
}

function ProceduralInspectionModel({ definition }: { definition: RackModelDefinition }) {
  const width = definition.dimensions.widthMm / 1000;
  const depth = definition.dimensions.depthMm / 1000;
  const height = definition.dimensions.heightMm / 1000;

  if (definition.kind === "l10") {
    return (
      <group>
        <mesh>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color="#2a526f" metalness={0.65} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, depth / 2 + 0.002]}>
          <boxGeometry args={[width * 0.86, height * 0.58, 0.008]} />
          <meshStandardMaterial color="#22d3ee" emissive="#0e7490" emissiveIntensity={0.25} />
        </mesh>
      </group>
    );
  }

  const post = 0.04;
  return (
    <group position={[0, height / 2, 0]}>
      {[-1, 1].flatMap((xSide) =>
        [-1, 1].map((zSide) => (
          <mesh key={`${xSide}-${zSide}`} position={[xSide * (width - post) / 2, 0, zSide * (depth - post) / 2]}>
            <boxGeometry args={[post, height, post]} />
            <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.34} />
          </mesh>
        ))
      )}
      <mesh position={[0, height / 2 - post / 2, 0]}>
        <boxGeometry args={[width, post, depth]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, -height / 2 + post / 2, 0]}>
        <boxGeometry args={[width, post, depth]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} />
      </mesh>
    </group>
  );
}

function GlbInspectionModel({
  definition,
  assetUrl,
  mode,
  sectionEnabled,
  sectionPercent,
  hiddenPartNames,
  onPartNamesChange,
}: {
  definition: RackModelDefinition;
  assetUrl: string;
  mode: ViewerMode;
  sectionEnabled: boolean;
  sectionPercent: number;
  hiddenPartNames: ReadonlySet<string>;
  onPartNamesChange: (partNames: string[]) => void;
}) {
  const gltf = useGLTF(assetUrl) as { scene: THREE.Group };

  useEffect(() => {
    onPartNamesChange(collectInspectablePartNames(gltf.scene));
  }, [gltf.scene, onPartNamesChange]);

  const prepared = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.rotation.set(...getModelAxisRotation(definition.upAxis));
    clone.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const fit = getUniformModelFit(bounds, definition.dimensions, {
      depthAlignment: "center",
    });
    const sectionX = ((sectionPercent - 50) / 100) * (definition.dimensions.widthMm / 1000);
    const clippingPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), sectionX);
    const ownedMaterials: THREE.Material[] = [];

    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.visible = !hiddenPartNames.has(getInspectablePartName(object));
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const materials = sourceMaterials.map((sourceMaterial) => {
        const material = sourceMaterial.clone();
        material.clippingPlanes = sectionEnabled ? [clippingPlane] : [];
        material.clipShadows = sectionEnabled;
        // Imported CAD sheet metal can contain mixed face winding. Rendering both
        // sides keeps thin covers visible without replacing the source material.
        material.side = THREE.DoubleSide;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.wireframe = mode === "wireframe";
          if (mode === "wireframe") {
            material.color.set("#67e8f9");
            material.emissive.set("#164e63");
            material.emissiveIntensity = 0.45;
          }
        }
        if (mode === "xray") {
          material.transparent = true;
          material.opacity = 0.24;
          material.depthWrite = false;
        }
        ownedMaterials.push(material);
        return material;
      });
      object.material = Array.isArray(object.material) ? materials : materials[0];
    });

    return {
      clone,
      position: fit.position as [number, number, number],
      scale: fit.scale as [number, number, number],
      ownedMaterials,
    };
  }, [definition, gltf.scene, hiddenPartNames, mode, sectionEnabled, sectionPercent]);

  useEffect(
    () => () => prepared.ownedMaterials.forEach((material) => material.dispose()),
    [prepared]
  );

  return (
    <group position={prepared.position} scale={prepared.scale}>
      <primitive object={prepared.clone} />
    </group>
  );
}

function InspectionScene({
  definition,
  assetUrl,
  mode,
  sectionEnabled,
  sectionPercent,
  resetKey,
  hiddenPartNames,
  onPartNamesChange,
}: {
  definition: RackModelDefinition;
  assetUrl: string;
  mode: ViewerMode;
  sectionEnabled: boolean;
  sectionPercent: number;
  resetKey: number;
  hiddenPartNames: ReadonlySet<string>;
  onPartNamesChange: (partNames: string[]) => void;
}) {
  return (
    <>
      <ConfigureRenderer />
      <color attach="background" args={["#02070d"]} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[4, 5, 6]} intensity={2.2} />
      <directionalLight position={[-4, 2, -4]} color="#38bdf8" intensity={1.1} />
      <Bounds key={resetKey} fit clip observe margin={1.25}>
        <Suspense fallback={<ModelLoadingState />}>
          {assetUrl ? (
            <GlbInspectionModel
              definition={definition}
              assetUrl={assetUrl}
              mode={mode}
              sectionEnabled={sectionEnabled}
              sectionPercent={sectionPercent}
              hiddenPartNames={hiddenPartNames}
              onPartNamesChange={onPartNamesChange}
            />
          ) : (
            <ProceduralInspectionModel definition={definition} />
          )}
        </Suspense>
      </Bounds>
      <Grid
        position={[0, -0.65, 0]}
        args={[12, 12]}
        cellSize={0.1}
        cellThickness={0.6}
        cellColor="#164e63"
        sectionSize={0.5}
        sectionThickness={1}
        sectionColor="#2563eb"
        fadeDistance={8}
        infiniteGrid
      />
      <OrbitControls
        makeDefault
        enableRotate
        enablePan
        enableZoom
        minDistance={0.12}
        maxDistance={12}
        zoomToCursor
      />
    </>
  );
}

export function DataCenterModelViewer({ open, model, onOpenChange }: DataCenterModelViewerProps) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<ViewerMode>("solid");
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionPercent, setSectionPercent] = useState(50);
  const [resetKey, setResetKey] = useState(0);
  const [partNames, setPartNames] = useState<string[]>([]);
  const [hiddenPartNames, setHiddenPartNames] = useState<Set<string>>(() => new Set());
  const [partSearch, setPartSearch] = useState("");

  const visiblePartNames = useMemo(() => {
    const query = partSearch.trim().toLocaleLowerCase();
    if (!query) return partNames;
    return partNames.filter((partName) => partName.toLocaleLowerCase().includes(query));
  }, [partNames, partSearch]);

  useEffect(() => {
    if (!open) return;
    setMode("solid");
    setSectionEnabled(false);
    setSectionPercent(50);
    setPartNames([]);
    setHiddenPartNames(new Set());
    setPartSearch("");
    setResetKey((value) => value + 1);
  }, [model?.id, open]);

  if (!model) return null;
  const assetUrl = isMobile && model.mobileAssetUrl ? model.mobileAssetUrl : model.assetUrl ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="min-w-0 h-[min(94dvh,920px)] w-[min(96vw,1440px)] max-w-none gap-0 overflow-hidden border border-cyan-300/25 bg-[#030b13] p-0 text-slate-100 shadow-[0_36px_120px_rgba(0,0,0,0.72)] sm:rounded-3xl"
      >
        <header className="flex min-h-[76px] min-w-0 shrink-0 items-center justify-between gap-4 border-b border-[#1f4766] bg-[#081a2a] px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/12 text-cyan-100">
              <Box className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg font-black text-white sm:text-xl">{model.name}</DialogTitle>
              <DialogDescription className="mt-1 truncate text-xs text-cyan-100/70 sm:text-sm">
                {model.kind === "rack" ? "L11 機櫃細節" : "L10 1U 機台細節"} · {model.manufacturer} · {model.revision}
              </DialogDescription>
            </div>
          </div>
          <button
            type="button"
            aria-label="關閉模型細節"
            onClick={() => onOpenChange(false)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#2a526f] bg-[#10263a] text-slate-100 hover:border-cyan-300/45 hover:bg-[#17364f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-1">
          <aside className="order-2 min-w-0 max-h-[36dvh] overflow-y-auto border-t border-[#1f4766] bg-[#071522] p-3 lg:order-1 lg:max-h-none lg:border-r lg:border-t-0 lg:p-5">
            <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-x-visible">
              {([[
                "solid",
                "實體",
                Box,
              ], ["xray", "透視", Layers3], ["wireframe", "線框", ScanLine]] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => setMode(id)}
                  className={cn(
                    "flex h-11 min-w-24 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                    mode === id
                      ? "border-cyan-300/55 bg-cyan-300 text-cyan-950"
                      : "border-[#2a526f] bg-[#10263a] text-cyan-50 hover:bg-[#17364f]"
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={sectionEnabled}
                onClick={() => setSectionEnabled((value) => !value)}
                className={cn(
                  "flex h-11 min-w-24 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                  sectionEnabled
                    ? "border-amber-300/55 bg-amber-300 text-amber-950"
                    : "border-[#2a526f] bg-[#10263a] text-amber-100 hover:bg-[#17364f]"
                )}
              >
                <ScanLine className="h-4 w-4" /> 剖面
              </button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetKey((value) => value + 1)}
                className="h-11 min-w-24 rounded-xl border-[#2a526f] bg-[#10263a] text-blue-50 hover:bg-[#17364f]"
              >
                <Focus className="mr-2 h-4 w-4" /> 重設視角
              </Button>
            </div>

            {sectionEnabled ? (
              <label className="mt-4 block rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
                <span className="flex items-center justify-between text-xs font-bold text-amber-100">
                  剖面位置 <span className="tabular-nums">{sectionPercent}%</span>
                </span>
                <input
                  aria-label="剖面位置"
                  type="range"
                  min={2}
                  max={98}
                  value={sectionPercent}
                  onChange={(event) => setSectionPercent(Number(event.target.value))}
                  className="mt-3 w-full accent-amber-300"
                />
              </label>
            ) : null}

            {assetUrl ? (
              <section className="mt-4 border-t border-[#1f4766] pt-4" aria-label="零件結構">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-white">零件結構</div>
                    <div className="mt-0.5 text-[11px] text-cyan-100/60">
                      {partNames.length ? `${partNames.length} 個可檢視零件` : "正在讀取零件名稱"}
                    </div>
                  </div>
                  {hiddenPartNames.size ? (
                    <button
                      type="button"
                      onClick={() => setHiddenPartNames(new Set())}
                      className="shrink-0 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1.5 text-[11px] font-bold text-cyan-100 hover:bg-cyan-300/20"
                    >
                      全部顯示
                    </button>
                  ) : null}
                </div>

                <label className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-[#2a526f] bg-[#0b1b2d] px-3 focus-within:border-cyan-300/55">
                  <Search className="h-4 w-4 shrink-0 text-cyan-300" />
                  <input
                    value={partSearch}
                    onChange={(event) => setPartSearch(event.target.value)}
                    placeholder="搜尋零件名稱"
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                  />
                </label>

                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto pr-1">
                  {visiblePartNames.slice(0, 80).map((partName) => {
                    const hidden = hiddenPartNames.has(partName);
                    return (
                      <button
                        key={partName}
                        type="button"
                        aria-pressed={!hidden}
                        title={partName}
                        onClick={() =>
                          setHiddenPartNames((current) => {
                            const next = new Set(current);
                            if (next.has(partName)) next.delete(partName);
                            else next.add(partName);
                            return next;
                          })
                        }
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                          hidden
                            ? "border-slate-700/70 bg-slate-900/45 text-slate-500"
                            : "border-cyan-300/15 bg-[#10263a] text-cyan-50 hover:border-cyan-300/35"
                        )}
                      >
                        {hidden ? <EyeOff className="h-3.5 w-3.5 shrink-0" /> : <Eye className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                        <span className="truncate">{partName}</span>
                      </button>
                    );
                  })}
                  {partNames.length && !visiblePartNames.length ? (
                    <div className="rounded-lg border border-dashed border-[#2a526f] px-3 py-5 text-center text-xs text-slate-400">
                      找不到符合的零件
                    </div>
                  ) : null}
                  {visiblePartNames.length > 80 ? (
                    <div className="px-2 py-1 text-[11px] text-cyan-100/55">
                      尚有 {visiblePartNames.length - 80} 個結果，請縮小搜尋範圍。
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <div className="mt-4 hidden space-y-3 border-t border-[#1f4766] pt-4 text-xs lg:block">
              <div className="font-bold text-white">實際模型資料</div>
              <dl className="space-y-2 text-slate-300">
                <div><dt className="text-cyan-100/60">尺寸（寬 × 深 × 高）</dt><dd className="mt-0.5 tabular-nums text-cyan-50">{model.dimensions.widthMm} × {model.dimensions.depthMm} × {model.dimensions.heightMm} mm</dd></div>
                <div><dt className="text-cyan-100/60">原始檔</dt><dd className="mt-0.5 break-all text-cyan-50">{model.sourceFileName ?? "程序模型"}</dd></div>
                <div><dt className="text-cyan-100/60">用途</dt><dd className="mt-0.5 text-cyan-50">{model.kind === "rack" ? "L11 外框，可容納 L10" : "水平安裝於 L11 的 1U 模組"}</dd></div>
              </dl>
            </div>
          </aside>

          <main className="relative order-1 min-h-0 min-w-0 bg-black lg:order-2">
            <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-xl border border-cyan-300/20 bg-[#06111f]/90 px-3 py-2 text-xs font-semibold text-cyan-50 backdrop-blur">
              <Rotate3d className="mr-1.5 inline h-4 w-4 text-cyan-300" /> 拖曳旋轉 · 滾輪或雙指縮放 · 右鍵平移
            </div>
            <Canvas
              dpr={isMobile ? [1, 1.35] : [1, 1.8]}
              camera={{ position: [1.8, 1.25, 2.4], fov: 42, near: 0.001, far: 100 }}
              style={{ touchAction: "none" }}
              gl={{ antialias: !isMobile, alpha: false, powerPreference: "high-performance" }}
            >
              <InspectionScene
                definition={model}
                assetUrl={assetUrl}
                mode={mode}
                sectionEnabled={sectionEnabled}
                sectionPercent={sectionPercent}
                resetKey={resetKey}
                hiddenPartNames={hiddenPartNames}
                onPartNamesChange={setPartNames}
              />
            </Canvas>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
