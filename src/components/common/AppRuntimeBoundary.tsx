import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

import { requestApplicationUpdate } from "@/lib/applicationUpdate";

interface AppRuntimeBoundaryProps {
  children: ReactNode;
}

interface AppRuntimeBoundaryState {
  error: Error | null;
}

export class AppRuntimeBoundary extends Component<
  AppRuntimeBoundaryProps,
  AppRuntimeBoundaryState
> {
  state: AppRuntimeBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppRuntimeBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render failed:", error, info.componentStack);

  }

  private handleRetry = () => { this.setState({ error: null }); };

  render() {
    const { error } = this.state;
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
                頁面載入遇到問題
              </h1>
              <p className="mt-2 max-w-[52ch] text-sm leading-6 text-sky-100 sm:text-base">
                系統沒有自動重新整理或清除登入狀態。此畫面未儲存的內容可能無法恢復；其他仍可操作的畫面請先儲存或匯出，再更新版本。
              </p>
            </div>
          </div>

          {(
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={requestApplicationUpdate}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-400 px-5 text-sm font-bold text-slate-950 hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                儲存後更新版本
              </button>
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sky-300/45 bg-[#102b43] px-5 text-sm font-semibold text-sky-50 hover:bg-[#163853] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                重試畫面
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
