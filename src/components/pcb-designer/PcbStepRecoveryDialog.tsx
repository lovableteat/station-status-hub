import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PcbModelAssetMetadata } from "./types.ts";

export function PcbStepRecoveryDialog({ canEdit, loadAssets, onRecover, onClose }: {
  canEdit: boolean;
  loadAssets: () => Promise<PcbModelAssetMetadata[]>;
  onRecover: (assets: PcbModelAssetMetadata[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<PcbModelAssetMetadata[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const working = useRef(false);
  const readRequest = useRef(0);
  const editable = useRef(canEdit);
  editable.current = canEdit;
  const read = async () => {
    const request = ++readRequest.current;
    setLoading(true); setLoadError(false);
    try {
      const candidates = await loadAssets();
      if (mounted.current && request === readRequest.current) setAssets(candidates);
    } catch {
      if (mounted.current && request === readRequest.current) setLoadError(true);
    } finally { if (mounted.current && request === readRequest.current) setLoading(false); }
  };
  useEffect(() => {
    mounted.current = true;
    void read();
    return () => { mounted.current = false; readRequest.current++; };
  }, [loadAssets]);

  const recover = async () => {
    if (!mounted.current || !editable.current || working.current || selected.length === 0) return;
    working.current = true; setBusy(true); setError("");
    try {
      const saved = await onRecover(assets.filter(asset => selected.includes(asset.id)));
      if (!mounted.current) return;
      if (saved && editable.current) onClose();
      else setError("尚未同步完成；選取仍保留。已加入的元件不會重複建立，請確認網路與編輯權後重試。");
    } catch {
      if (mounted.current) setError("尚未同步完成；選取仍保留。請確認網路與編輯權後重試。");
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <Dialog open onOpenChange={open => { if (!open && !working.current) onClose(); }}>
    <DialogContent className="pcb-dialog max-h-[88vh] max-w-xl overflow-y-auto p-5 text-slate-100">
      <DialogHeader>
        <DialogTitle>找回雲端 STEP</DialogTitle>
        <DialogDescription className="text-slate-300">只列出元件庫與所有板子都未使用的雲端模型，並排除重複檔案。勾選後才會重新加入共用元件庫。</DialogDescription>
      </DialogHeader>
      {loading ? <p role="status">正在讀取雲端模型…</p> : loadError ? <div>
        <p role="alert" className="mb-3 text-sm text-rose-200">無法讀取雲端模型，請確認連線後重試。</p>
        <Button variant="outline" onClick={() => void read()}>重試載入</Button>
      </div> : <table className="w-full table-fixed text-left text-sm">
        <thead><tr className="border-b border-slate-700"><th className="w-3/5 pb-2 font-medium">選取／檔名</th><th className="pb-2 font-medium">長 × 寬 × 高 (mm)</th></tr></thead>
        <tbody>{assets.length === 0 ? <tr><td colSpan={2} className="py-5 text-slate-400">目前沒有可找回的雲端 STEP</td></tr> : assets.map(asset => <tr key={asset.id} className="border-b border-slate-800">
          <td className="py-3 pr-3 align-top"><label className="flex cursor-pointer items-start gap-2 break-all">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-teal-400" checked={selected.includes(asset.id)} disabled={busy || !canEdit}
              onChange={event => setSelected(current => event.target.checked ? [...current, asset.id] : current.filter(id => id !== asset.id))} />
            <span>{asset.fileName}</span>
          </label></td>
          <td className="py-3 align-top text-slate-300">{asset.calibratedDimensions.widthMm} × {asset.calibratedDimensions.depthMm} × {asset.calibratedDimensions.heightMm}</td>
        </tr>)}</tbody>
      </table>}
      {!canEdit && <p role="alert" className="text-sm text-amber-200">目前沒有編輯權；恢復後才能找回模型。</p>}
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      <DialogFooter className="gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>取消</Button>
        <Button disabled={loading || loadError || busy || !canEdit || selected.length === 0} onClick={() => void recover()}>
          {busy ? "正在同步…" : `找回並同步 (${selected.length})`}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
