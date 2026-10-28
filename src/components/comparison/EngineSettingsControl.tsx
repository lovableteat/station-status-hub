import { useEffect, useState } from "react";
import { Laptop, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { engineHost, mixedContentProblem, normalizeEngineUrl, type EngineMode, type EngineSettings } from "./engineSettings";
import { checkEngineServer } from "./runtime";

type Status = { tone: "ok" | "error" | "busy"; text: string } | null;

/** The badge beside the tabs: shows where comparisons run and opens the dialog that changes it. */
export function EngineSettingsControl({ settings, onChange, disabled }: { settings: EngineSettings; onChange: (next: EngineSettings) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<EngineMode>(settings.mode);
  const [url, setUrl] = useState(settings.url);
  const [token, setToken] = useState(settings.token);
  const [status, setStatus] = useState<Status>(null);
  useEffect(() => { if (open) { setMode(settings.mode); setUrl(settings.url); setToken(settings.token); setStatus(null); } }, [open, settings]);

  const reachable = (value: string) => { const problem = mixedContentProblem(value); if (problem) throw new Error(problem); return value; };
  const test = async () => {
    try {
      setStatus({ tone: "busy", text: "連線中…" });
      const info = await checkEngineServer({ url: reachable(normalizeEngineUrl(url)), token: token.trim() }, AbortSignal.timeout(8000));
      setStatus({ tone: "ok", text: `連線成功：引擎 ${info.revision}（${info.files} 個檔案）${info.auth === "token" ? "，token 正確" : ""}` });
    } catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : String(error) }); }
  };
  const save = () => {
    try {
      const next: EngineSettings = { mode, url: normalizeEngineUrl(url), token: token.trim() };
      if (next.mode === "server" && !next.url) throw new Error("請填寫伺服器位址");
      if (next.mode === "server") reachable(next.url);
      onChange(next);
      setOpen(false);
    } catch (error) { setStatus({ tone: "error", text: error instanceof Error ? error.message : String(error) }); }
  };
  const label = settings.mode === "server" ? `伺服器處理 · ${engineHost(settings.url)}` : "本機處理";

  return <>
    <Button variant="outline" size="sm" className="comparison-engine-badge" disabled={disabled} title="選擇比對在哪裡處理" onClick={() => setOpen(true)}>{settings.mode === "server" ? <Server aria-hidden="true" /> : <Laptop aria-hidden="true" />}{label}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="comparison-engine-dialog">
      <DialogHeader><DialogTitle>比對在哪裡處理</DialogTitle><DialogDescription>兩種方式用同一套引擎，結果相同；這個設定只存在這台電腦的瀏覽器。</DialogDescription></DialogHeader>
      <div className="comparison-engine-modes" role="radiogroup" aria-label="處理位置">
        <label data-selected={mode === "browser"}><input type="radio" name="comparison-engine-mode" checked={mode === "browser"} onChange={() => setMode("browser")} /><Laptop aria-hidden="true" /><span><strong>在這台電腦的瀏覽器處理</strong><small>第一次會下載約 40 MB 的執行套件；工程檔案不離開這台電腦</small></span></label>
        <label data-selected={mode === "server"}><input type="radio" name="comparison-engine-mode" checked={mode === "server"} onChange={() => setMode("server")} /><Server aria-hidden="true" /><span><strong>送到比對伺服器處理</strong><small>檔案上傳到伺服器計算，瀏覽器只收結果；伺服器處理完就刪除檔案</small></span></label>
      </div>
      {mode === "server" && <div className="comparison-engine-fields">
        <div><Label htmlFor="comparison-engine-url">伺服器位址</Label><Input id="comparison-engine-url" placeholder="http://autocheck.company.local:8000" value={url} autoComplete="off" spellCheck={false} onChange={event => setUrl(event.target.value)} /></div>
        <div><Label htmlFor="comparison-engine-token">API token（伺服器有設定才需要）</Label><Input id="comparison-engine-token" type="password" value={token} autoComplete="off" onChange={event => setToken(event.target.value)} /></div>
        <div className="comparison-engine-actions"><Button variant="outline" disabled={!url.trim() || status?.tone === "busy"} onClick={() => void test()}>測試連線</Button>{status && <p role="status" data-tone={status.tone}>{status.text}</p>}</div>
      </div>}
      {mode === "browser" && status && <p role="status" data-tone={status.tone}>{status.text}</p>}
      <div className="comparison-engine-footer"><Button variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button onClick={save}>儲存設定</Button></div>
    </DialogContent></Dialog>
  </>;
}
