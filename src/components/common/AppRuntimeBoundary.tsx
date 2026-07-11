import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

const CHUNK_RETRY_KEY = "station-status-hub:chunk-retry";

function isChunkLoadError(error: Error) {
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(
    error.message
  );
}

function replaceWithCacheBuster() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("reload", Date.now().toString());
  window.location.replace(nextUrl.toString());
}

interface AppRuntimeBoundaryProps {
  children: ReactNode;
}

interface AppRuntimeBoundaryState {
  error: Error | null;
  retrying: boolean;
}

export class AppRuntimeBoundary extends Component<
  AppRuntimeBoundaryProps,
  AppRuntimeBoundaryState
> {
  state: AppRuntimeBoundaryState = {
    error: null,
    retrying: false,
  };

  static getDerivedStateFromError(error: Error): AppRuntimeBoundaryState {
    return { error, retrying: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render failed:", error, info.componentStack);

    if (!isChunkLoadError(error)) return;

    try {
      if (window.sessionStorage.getItem(CHUNK_RETRY_KEY) === "1") return;
      window.sessionStorage.setItem(CHUNK_RETRY_KEY, "1");
      this.setState({ retrying: true });
      window.setTimeout(replaceWithCacheBuster, 80);
    } catch {
      // The recovery screen remains available when storage is unavailable.
    }
  }

  private handleReload = () => {
    try {
      window.sessionStorage.removeItem(CHUNK_RETRY_KEY);
    } catch {
      // Reload still works when storage is unavailable.
    }
    replaceWithCacheBuster();
  };

  private handleResetSession = () => {
    try {
      window.localStorage.removeItem("user");
      window.sessionStorage.removeItem(CHUNK_RETRY_KEY);
      window.sessionStorage.removeItem("station-status-hub:boot-retry");
    } catch {
      // Continue to the login screen even when storage cleanup is blocked.
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.search = "";
    nextUrl.hash = "";
    window.location.replace(nextUrl.toString());
  };

  render() {
    const { error, retrying } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,hsl(214_95%_60%/0.22),transparent_34rem),linear-gradient(145deg,#071827,#0b2033_58%,#0d2a3f)] px-5 py-10 text-slate-50">
        <section className="w-full max-w-xl rounded-2xl border border-sky-400/45 bg-[#0d2237] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-300 text-slate-950">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                {retrying ? "正在同步最新版本" : "頁面載入遇到問題"}
              </h1>
              <p className="mt-2 max-w-[52ch] text-sm leading-6 text-sky-100 sm:text-base">
                {retrying
                  ? "偵測到瀏覽器仍在使用舊版檔案，系統正在自動重新載入。"
                  : "系統已攔截錯誤，因此不會再顯示整頁黑畫面。請重新載入，或清除登入狀態後再次登入。"}
              </p>
            </div>
          </div>

          {!retrying && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-400 px-5 text-sm font-bold text-slate-950 hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                載入最新版本
              </button>
              <button
                type="button"
                onClick={this.handleResetSession}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sky-300/45 bg-[#102b43] px-5 text-sm font-semibold text-sky-50 hover:bg-[#163853] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                清除登入狀態
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }
}

export function AppLoadingScreen({ label = "正在載入工作平台" }: { label?: string }) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,hsl(214_95%_60%/0.2),transparent_32rem),linear-gradient(145deg,#071827,#0b2033_60%,#0d2a3f)] px-5 text-slate-50"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-md rounded-2xl border border-sky-400/35 bg-[#0d2237] p-6">
        <div className="flex items-center gap-4">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-sky-400 text-slate-950">
            <div className="h-4 w-4 animate-pulse rounded-full bg-slate-950" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold sm:text-lg">{label}</p>
            <p className="mt-1 text-sm text-sky-100">正在取得最新模組與專案資料</p>
          </div>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#071827]">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-sky-300" />
        </div>
      </div>
    </main>
  );
}
