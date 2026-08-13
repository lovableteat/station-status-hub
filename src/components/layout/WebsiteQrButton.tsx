import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, QrCode, Share2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PRODUCTION_SITE_URL = "https://lovableteat.github.io/station-status-hub/";

function getPublicSiteUrl() {
  if (typeof window === "undefined") return PRODUCTION_SITE_URL;
  if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return PRODUCTION_SITE_URL;
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

async function writeClipboardText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Older mobile browsers can expose Clipboard API but reject writes.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard write failed");
}

export function WebsiteQrButton() {
  const [copied, setCopied] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const siteUrl = useMemo(getPublicSiteUrl, []);
  const qrImageUrl = `${import.meta.env.BASE_URL}platform-mobile-qr.svg`;

  const copySiteUrl = async () => {
    try {
      await writeClipboardText(siteUrl);
      setCopied(true);
      toast.success("網站連結已複製");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("無法自動複製，請長按上方網址複製");
    }
  };

  const shareSiteUrl = async () => {
    if (!navigator.share) {
      await copySiteUrl();
      return;
    }

    try {
      await navigator.share({ title: "工作整合平台", text: "用手機開啟工作整合平台", url: siteUrl });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      await copySiteUrl();
    }
  };

  return (
    <Dialog onOpenChange={(open) => open && setQrFailed(false)}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label="顯示手機開啟二維碼"
          className="interactive-lift h-12 w-12 shrink-0 rounded-2xl border-cyan-200/25 bg-cyan-300/10 p-0 text-cyan-100 shadow-[0_16px_30px_-24px_rgba(34,211,238,0.8)] hover:border-cyan-200/50 hover:bg-cyan-300/18 hover:text-white 2xl:w-auto 2xl:px-4"
        >
          <QrCode className="h-5 w-5 2xl:mr-2" />
          <span className="hidden text-sm font-bold 2xl:inline">手機開啟</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-24px)] max-w-md overflow-hidden rounded-[28px] border-cyan-200/35 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.22),transparent_17rem),radial-gradient(circle_at_90%_0%,rgba(190,242,100,0.14),transparent_16rem),#091827] p-0 text-slate-100">
        <DialogHeader className="border-b border-cyan-200/15 px-5 pb-4 pt-5 pr-14 text-left">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#67e8f9,#bef264)] text-[#062230] shadow-[0_16px_35px_-18px_rgba(103,232,249,0.85)]">
            <Smartphone className="h-6 w-6" />
          </div>
          <DialogTitle className="text-2xl font-black tracking-tight text-white">用手機開啟平台</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-300">
            開啟手機相機掃描，會直接前往目前的正式網站，不會連到這台電腦的測試網址。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5 pt-4">
          <div className="mx-auto grid aspect-square w-full max-w-[272px] place-items-center overflow-hidden rounded-[26px] border-4 border-white/90 bg-white p-3 shadow-[0_24px_60px_-30px_rgba(103,232,249,0.9)]">
            {qrFailed ? (
              <div className="px-5 text-center text-sm font-bold leading-6 text-slate-700">
                二維碼暫時無法載入，請改用下方「複製連結」或「分享」。
              </div>
            ) : (
              <img
                src={qrImageUrl}
                alt="工作整合平台網站二維碼"
                className="h-full w-full object-contain"
                onError={() => setQrFailed(true)}
              />
            )}
          </div>

          <div className="rounded-2xl border border-cyan-200/15 bg-slate-950/35 px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-lime-200">正式網站</p>
            <p className="mt-1 break-all text-sm leading-5 text-slate-200">{siteUrl}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => void copySiteUrl()} className="h-11 rounded-xl border-cyan-200/25 bg-cyan-300/10 font-bold text-cyan-50 hover:bg-cyan-300/18">
              {copied ? <Check className="mr-2 h-4 w-4 text-lime-300" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "已複製" : "複製連結"}
            </Button>
            <Button type="button" onClick={() => void shareSiteUrl()} className="h-11 rounded-xl bg-[linear-gradient(135deg,#bef264,#67e8f9)] font-black text-[#082032] hover:brightness-110">
              <Share2 className="mr-2 h-4 w-4" />分享
            </Button>
          </div>
          <a href={siteUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 text-sm font-bold text-violet-200 hover:text-violet-100">
            在新視窗測試連結 <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
