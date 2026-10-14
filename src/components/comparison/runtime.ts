export class ComparisonRuntime {
  private cancellationGeneration = 0;
  get generation(): number { return this.cancellationGeneration; }
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void; progress?: (message: string) => void; timeout: ReturnType<typeof setTimeout> }>();

  request<T>(type: string, payload: unknown, progress?: (message: string) => void): Promise<T> {
    if (!this.worker) {
      this.worker = new Worker(`${import.meta.env.BASE_URL}comparison/autocheck.worker.js`);
      this.worker.onmessage = ({ data }) => {
        const pending = this.pending.get(data.id);
        if (!pending) return;
        if (data.type === "progress") { pending.progress?.(data.message); return; }
        clearTimeout(pending.timeout);
        this.pending.delete(data.id);
        if (data.type === "error") pending.reject(new Error(data.message || "比對引擎執行失敗"));
        else pending.resolve(data.result);
      };
      this.worker.onerror = event => this.cancel(event.message || "無法載入比對引擎，請檢查網路後重試");
      this.worker.onmessageerror = () => this.cancel("比對結果傳輸失敗，請重試");
    }
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => this.cancel("執行超過 10 分鐘，已停止；請縮小輸入或重新執行"), 600_000);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, progress, timeout });
      try { this.worker!.postMessage({ id, type, payload }); }
      catch (error) { clearTimeout(timeout); this.pending.delete(id); reject(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  cancel(message = "已取消執行"): void {
    ++this.cancellationGeneration;
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error(message)); }
    this.pending.clear();
  }
}
