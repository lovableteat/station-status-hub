import { useEffect, useState } from "react";
import { Columns3, Palette, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { BomTableColorTheme } from "./materialBomStorage";
import { MATERIAL_TABLE_COLUMNS, normalizeHiddenMaterialColumns, type MaterialTableColumnKey } from "./materialRequestPresentation";
import { clearMaterialCrosshair, markMaterialCrosshair } from "./materialTableCrosshair";
import { blendWithSurface, buildMaterialCrosshairStyle, DEFAULT_BOM_TABLE_COLOR_THEME, isMaterialTableColor, normalizeBomTableColorTheme } from "./materialTableTheme";

export interface MaterialTableSettings {
  hiddenColumns: MaterialTableColumnKey[];
  theme: Required<BomTableColorTheme>;
  resetWidths: boolean;
}

const COLORS = [
  { key: "primary", label: "主料", detail: "展開前的主資料列" },
  { key: "alternative", label: "替代料 · 已建料", detail: "已建料的替代候選列" },
  { key: "secondary", label: "替代料 · 其他", detail: "其餘替代料列" },
  { key: "crosshair", label: "十字高亮", detail: "滑鼠所在的整列、整欄與交叉格" },
] as const;

function ColorPreview({ theme }: { theme: Required<BomTableColorTheme> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-border bg-secondary/40 px-3 py-2 text-xs">
        <span className="font-semibold text-foreground">即時預覽</span><span className="text-muted-foreground">移動滑鼠或用 Tab 查看十字高亮</span>
      </div>
      <div className="overflow-x-auto">
        <table data-testid="material-color-preview" className="material-table-crosshair w-full min-w-[340px] border-collapse text-left text-xs" style={buildMaterialCrosshairStyle(theme.crosshair)} onPointerOver={event => markMaterialCrosshair(event.currentTarget, event.target)} onPointerLeave={event => clearMaterialCrosshair(event.currentTarget)} onFocusCapture={event => markMaterialCrosshair(event.currentTarget, event.target)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearMaterialCrosshair(event.currentTarget); }}>
          <thead className="bg-secondary text-muted-foreground"><tr>{["類型", "Ref Des", "Manufacturer Part Number"].map(label => <th key={label} className="border-r border-border px-3 py-2 font-medium last:border-r-0">{label}</th>)}</tr></thead>
          <tbody>
            {COLORS.slice(0, 3).map((field, index) => <tr key={field.key} style={{ backgroundColor: blendWithSurface(theme[field.key], [0.48, 0.18, 0.12][index]) }} className="border-t border-border text-foreground">
              <td tabIndex={0} className="border-r border-border px-3 py-2 font-semibold outline-none">{index === 0 ? "主料" : `替代 #${index}`}</td>
              <td tabIndex={0} className="border-r border-border px-3 py-2 font-mono outline-none">C1</td>
              <td tabIndex={0} className="px-3 py-2 font-mono outline-none">{["GRM155R71C104KA88", "CL05B104KO5NNNC", "VJ0402Y104KXACW1"][index]}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MaterialTableSettingsDialog({ open, onOpenChange, workspaceName, hiddenColumns, theme, canEditColors, onApply }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  hiddenColumns: MaterialTableColumnKey[];
  theme: Required<BomTableColorTheme>;
  canEditColors: boolean;
  onApply: (settings: MaterialTableSettings) => Promise<void>;
}) {
  const [tab, setTab] = useState("columns");
  const [hidden, setHidden] = useState(hiddenColumns);
  const [draft, setDraft] = useState(theme);
  const [resetWidths, setResetWidths] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setTab("columns"); setHidden(hiddenColumns); setDraft(theme); setResetWidths(false); setError("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- A background refresh must not erase an open draft; a BOM change remounts this dialog.

  const valid = COLORS.every(field => isMaterialTableColor(draft[field.key]));
  const previewTheme = normalizeBomTableColorTheme(draft);
  const changed = resetWidths || JSON.stringify(hidden) !== JSON.stringify(hiddenColumns) || COLORS.some(field => draft[field.key] !== theme[field.key]);
  const apply = async () => {
    if (!valid || saving) return;
    setSaving(true); setError("");
    try { await onApply({ hiddenColumns: normalizeHiddenMaterialColumns(hidden), theme: previewTheme, resetWidths }); onOpenChange(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "設定未儲存，請稍後重試。"); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={value => { if (!saving) onOpenChange(value); }}>
    <DialogContent data-testid="material-table-settings" className="flex h-[min(720px,calc(100dvh-24px))] w-[calc(100vw-24px)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:gap-0 sm:p-0">
      <DialogHeader className="shrink-0 border-b border-border px-5 pb-4 pt-5 text-left">
        <DialogTitle className="pr-8 text-lg">欄位與配色</DialogTitle>
        <DialogDescription className="truncate pr-6" title={workspaceName}>{workspaceName}</DialogDescription>
      </DialogHeader>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-5 mb-3 mt-4 grid h-10 shrink-0 grid-cols-2">
          <TabsTrigger value="columns" className="h-8 gap-2 text-sm"><Columns3 className="h-4 w-4" />顯示欄位</TabsTrigger>
          <TabsTrigger value="colors" className="h-8 gap-2 text-sm"><Palette className="h-4 w-4" />配色與高亮</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <TabsContent value="columns" className="mt-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">顯示 <strong className="tabular-nums text-foreground">{MATERIAL_TABLE_COLUMNS.length - hidden.length} / {MATERIAL_TABLE_COLUMNS.length}</strong> 欄</p>
              <div className="flex gap-1"><Button type="button" variant="ghost" size="sm" disabled={saving || hidden.length === 0} onClick={() => setHidden([])}>全部顯示</Button><Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setResetWidths(value => !value)} aria-pressed={resetWidths}><RotateCcw className="mr-1 h-3.5 w-3.5" />{resetWidths ? "已選重設欄寬" : "重設欄寬"}</Button></div>
            </div>
            <fieldset disabled={saving} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MATERIAL_TABLE_COLUMNS.map(column => <label key={column.key} className={cn("flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm", hidden.includes(column.key) ? "border-border text-muted-foreground" : "border-primary/25 bg-primary/5 text-foreground", column.locked ? "cursor-default" : "cursor-pointer hover:border-primary/60")}>
                <Checkbox checked={!hidden.includes(column.key)} disabled={column.locked} onCheckedChange={() => setHidden(current => current.includes(column.key) ? current.filter(key => key !== column.key) : [...current, column.key])} />
                <span className="min-w-0 flex-1 break-words">{column.label}</span>{column.locked && <span className="shrink-0 text-xs text-muted-foreground">固定</span>}
              </label>)}
            </fieldset>
            <p className="text-xs leading-5 text-muted-foreground">欄位顯示與欄寬只影響你的表格檢視。</p>
          </TabsContent>
          <TabsContent value="colors" className="mt-0 space-y-4">
            <ColorPreview theme={previewTheme} />
            <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">配色保存於這份 BOM，供使用者共用。</p><Button type="button" variant="ghost" size="sm" disabled={saving || !canEditColors} onClick={() => setDraft(DEFAULT_BOM_TABLE_COLOR_THEME)}>還原預設</Button></div>
            {!canEditColors && <p className="text-sm text-muted-foreground">目前為唯讀，仍可調整欄位顯示；共享配色需要編輯權限。</p>}
            <fieldset disabled={saving || !canEditColors} className="divide-y divide-border rounded-lg border border-border">
              {COLORS.map(field => <div key={field.key} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <input type="color" aria-label={`${field.label}選色`} value={previewTheme[field.key]} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value.toUpperCase() }))} className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-default" />
                <div className="min-w-0 flex-1"><label htmlFor={`material-color-${field.key}`} className="text-sm font-semibold text-foreground">{field.label}</label><p className="mt-0.5 text-xs text-muted-foreground">{field.detail}</p></div>
                <Input id={`material-color-${field.key}`} aria-label={`${field.label}色碼`} aria-invalid={!isMaterialTableColor(draft[field.key])} maxLength={7} spellCheck={false} value={draft[field.key]} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} className="h-9 w-24 shrink-0 font-mono text-sm uppercase" />
              </div>)}
            </fieldset>
            {!valid && <p role="alert" className="text-sm text-destructive">請輸入六位色碼，例如 #61CCBC。</p>}
          </TabsContent>
        </div>
      </Tabs>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-secondary/20 px-5 py-3">
        {error && <p role="alert" className="mr-auto text-sm text-destructive">{error}</p>}
        <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button><Button type="button" disabled={saving || !valid || !changed} onClick={() => void apply()}>{saving ? "儲存中…" : "套用設定"}</Button>
      </footer>
    </DialogContent>
  </Dialog>;
}
