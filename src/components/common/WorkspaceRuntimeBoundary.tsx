import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; label: string; onFallback?: () => void }
interface State { error: Error | null }

/** A workspace failure leaves the application navigation and session usable. */
export class WorkspaceRuntimeBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} render failed:`, error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section role="alert" data-workspace-error={this.props.label} className="m-4 rounded-xl border border-amber-300/30 bg-[#0d2237] p-5 text-slate-100">
        <h2 className="font-semibold">{this.props.label} 暫時無法顯示</h2>
        <p className="mt-2 text-sm">資料與登入狀態已保留。您可使用上方導覽切換工作區，或重試此畫面。</p>
        <button type="button" onClick={() => this.setState({ error: null })} className="mt-4 rounded-lg bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950">重試畫面</button>
        {this.props.onFallback && <button type="button" onClick={this.props.onFallback} className="ml-3 rounded-lg border border-sky-300/40 px-4 py-2 text-sm">切換 2D 配置</button>}
      </section>
    );
  }
}
