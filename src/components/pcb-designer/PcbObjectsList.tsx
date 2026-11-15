import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PcbSelection, PcbVisibleLayer } from "./types.ts";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";

const kindLabels = { component: "元件", keepout: "禁制區", measurement: "量測" };
const layerLabels = { all: "全部", top: "Top", bottom: "Bottom" };

export function PcbObjectsList({ workspace, hidden = false }: { workspace: PcbWorkspaceApi; hidden?: boolean }) {
  const [query, setQuery] = useState("");
  const [layer, setLayer] = useState<PcbVisibleLayer>("all");
  const [kind, setKind] = useState<PcbSelection["kind"] | "all">("all");
  const { components, keepouts, measurements } = workspace.activeProject;
  const normalized = query.trim().toLocaleLowerCase();
  const rows = useMemo(() => {
    if (hidden) return [];
    const objects: { selection: PcbSelection; name: string; layer: PcbVisibleLayer; status: string; statusTitle: string }[] = [
      ...components.map(component => ({
        selection: { kind: "component" as const, id: component.instanceId },
        name: `${component.reference} · ${component.name}`,
        layer: component.layer,
        status: [component.locked ? "鎖定" : "", component.modelAssetId ? "3D" : ""].filter(Boolean).join(" · ") || "—",
        statusTitle: `${component.locked ? "已鎖定" : "未鎖定"}；${component.modelAssetId ? "已配置 3D 模型" : "未配置 3D 模型"}`,
      })),
      ...keepouts.map(keepout => ({
        selection: { kind: "keepout" as const, id: keepout.id },
        name: keepout.name, layer: "all" as const, status: "—", statusTitle: "禁制區套用於兩面",
      })),
      ...measurements.map((measurement, index) => ({
        selection: { kind: "measurement" as const, id: measurement.id },
        name: `量測 ${index + 1} · ${Math.hypot(measurement.x2 - measurement.x1, measurement.y2 - measurement.y1).toFixed(2)} mm`,
        layer: "all" as const, status: "—", statusTitle: "量測線不分層",
      })),
    ];
    return objects.filter(object => (kind === "all" || object.selection.kind === kind)
      && (layer === "all" || object.layer === "all" || object.layer === layer)
      && object.name.toLocaleLowerCase().includes(normalized));
  }, [components, keepouts, measurements, normalized, layer, kind, hidden]);
  const filters: [string, () => void][] = [];
  if (normalized) filters.push([`搜尋：${query.trim()}`, () => setQuery("")]);
  if (layer !== "all") filters.push([`層：${layerLabels[layer]}`, () => setLayer("all")]);
  if (kind !== "all") filters.push([`類別：${kindLabels[kind]}`, () => setKind("all")]);

  return (
    <section className="pcb-objects-list" data-testid="pcb-objects-list" hidden={hidden} aria-label="板上物件清單">
      {!hidden && <>
        <div className="pcb-object-filters">
          <label className="pcb-inspector-field">
            <span>搜尋</span>
            <input type="search" aria-label="搜尋物件" title="依位號或名稱搜尋板上物件" placeholder="搜尋位號／名稱"
              value={query} onChange={event => setQuery(event.currentTarget.value)} />
          </label>
          <label className="pcb-inspector-field">
            <span>層</span>
            <select aria-label="物件層" title="篩選元件所在面；禁制區與量測不分層" value={layer}
              onChange={event => setLayer(event.currentTarget.value as PcbVisibleLayer)}>
              <option value="all">全部</option><option value="top">Top</option><option value="bottom">Bottom</option>
            </select>
          </label>
          <label className="pcb-inspector-field">
            <span>類別</span>
            <select aria-label="物件類別" title="依元件、禁制區或量測篩選物件" value={kind}
              onChange={event => setKind(event.currentTarget.value as PcbSelection["kind"] | "all")}>
              <option value="all">全部</option>
              {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {filters.length > 0 && <div className="pcb-object-filter-chips" aria-label="作用中的物件篩選">
          {filters.map(([label, clear]) => <Button key={label} type="button" variant="outline" size="sm"
            aria-label={`清除${label}`} title={`移除${label}的篩選條件`} onClick={clear}>{label} ×</Button>)}
          <Button type="button" variant="ghost" size="sm" aria-label="全部清除物件篩選"
            title="移除搜尋、層與類別條件，顯示目前板子的全部物件" onClick={() => filters.forEach(([, clear]) => clear())}>全部清除</Button>
        </div>}
        <table className="pcb-object-table" aria-label="板上物件">
          <thead><tr><th scope="col">物件</th><th scope="col">層</th><th scope="col">狀態</th></tr></thead>
          <tbody>
            {rows.map(row => <tr key={`${row.selection.kind}-${row.selection.id}`} data-object-id={row.selection.id}
              onClick={() => workspace.centerObject(row.selection)} title={`選取並置中${row.name}，開啟詳細設定`}>
              <td><button type="button" className="pcb-object-name" title={`選取並置中${row.name}，開啟詳細設定`}
                aria-label={`選取並置中${row.name}`}>
                <small>{kindLabels[row.selection.kind]}</small><span>{row.name}</span>
              </button></td>
              <td>{row.layer === "all" ? "不分層" : layerLabels[row.layer]}</td>
              <td className="pcb-object-status" title={row.statusTitle}>{row.status}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan={3} className="pcb-object-empty">目前篩選條件沒有符合的物件</td></tr>}
          </tbody>
        </table>
      </>}
    </section>
  );
}
