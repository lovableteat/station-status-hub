import { useMemo, useState } from "react";
import { ExternalLink, FileSpreadsheet, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { DiscouragedMaterialRow } from "./materialRequestExport";

export const NON_PVL_SOP_URL = "https://sp.pegatroncorp.com/plm/FAQ/Part/[PART]%20%E4%BE%9D%E5%B0%88%E6%A1%88%E8%A7%A3%E9%99%A4%E4%B8%8D%E5%BB%BA%E8%AD%B0%E4%BD%BF%E7%94%A8%E6%96%99%E7%94%B3%E8%AB%8B%E8%AA%AA%E6%98%8E.aspx";
export const NON_PVL_SOP_TITLE = "[PART] 依專案解除不建議使用料申請說明";

const SOP_SCOPE = [
  "ZZ 尾碼",
  "UX 尾碼且零件狀態為 ODM 不建議用料",
  "零件狀態為 ODM 不建議用料且專案類型非 OEM",
  "ZY 尾碼且非共用料（屬性 ZY=00，開放非車規產品使用為 N）且專案產品線不得為 G1",
];

const SOP_STEPS: Array<{ title: string; detail?: string; image?: string }> = [
  { title: "PLM 首頁 → Part/BOM → 維護功能 → Non PVL 申請", image: "step1.png" },
  { title: "點選「範例檔案」並維護需要申請的 ZZ／ZY／00-ODM 料件清單", detail: "範例檔只有一欄「料號(必填)」，一列一個料號；本視窗的「匯出 PLM 申請清單」就是這個格式。", image: "step2.png" },
  { title: "填入要申請使用 ZZ／ZY／00-ODM 料的專案，並上傳清單", detail: "Excel 副檔名需為 .xls（Excel 97-2003 格式），且不可有篩選或隱藏欄位，否則會解析錯誤。", image: "step3.png" },
  { title: "上傳後會看到申請單的屬性頁面，可確認每個料件對應的採購與目前審核狀況", image: "step4.png" },
  { title: "成功建立的表單會跑簽核流程，新增 Project Leader 或一二階主管簽核關卡", detail: "5-1 所選 Project Leader 有值：抓 Project Leader 簽核，任一位簽過即可。5-2 所選 Project Leader 無值：抓申請者一二階主管簽核（最高抓到部級主管），且都要簽過。", image: "step5.png" },
  { title: "經 Sourcer Approve 料件後，後續在該專案中掛 BOM 就不會再被卡", image: "step6.png" },
];

export function MaterialNonPvlDialog({
  isExporting,
  open,
  rows,
  workspaceName,
  onExportApplyList,
  onExportDetail,
  onOpenChange,
}: {
  isExporting: boolean;
  open: boolean;
  rows: DiscouragedMaterialRow[];
  workspaceName: string;
  onExportApplyList: () => void;
  onExportDetail: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [showSop, setShowSop] = useState(true);
  const keyword = query.trim().toLowerCase();
  const visibleRows = useMemo(() => (
    keyword
      ? rows.filter((row) => [row.refDes, row.name, row.manufacturerPartNumber, row.manufacturer, row.partNumber, row.virtualAlternative, row.partUsageStatus].join(" ").toLowerCase().includes(keyword))
      : rows
  ), [keyword, rows]);
  const partNumbers = useMemo(() => new Set(rows.map((row) => row.partNumber).filter(Boolean)), [rows]);
  const missingCount = rows.filter((row) => !row.partNumber).length;
  const description = `${workspaceName} · 零件狀態為不建議用料的料共 ${rows.length.toLocaleString()} 筆 · 可申請的實體料號 ${partNumbers.size.toLocaleString()} 個${missingCount > 0 ? ` · ${missingCount.toLocaleString()} 筆還沒有實體料號` : ""}`;
  const assetBase = `${import.meta.env.BASE_URL}material-non-pvl/`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="material-non-pvl-dialog" className="flex max-h-[94vh] max-w-6xl flex-col gap-3 overflow-hidden p-5 text-base sm:p-7">
        <DialogHeader>
          <DialogTitle className="text-xl">不建議料匯出</DialogTitle>
          <DialogDescription className="truncate" title={description}>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <section className="workspace-dialog-section workspace-dialog-section--teal rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">申請 SOP</h3>
              <a
                href={NON_PVL_SOP_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-w-0 items-center gap-1 truncate text-base font-semibold text-primary underline-offset-2 hover:underline"
              >
                {NON_PVL_SOP_TITLE}
                <ExternalLink className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
              </a>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowSop((current) => !current)} className="ml-auto h-7 px-2 text-xs" aria-expanded={showSop}>
                {showSop ? "收合說明" : "展開說明"}
              </Button>
            </div>
            <p className="mt-1 text-sm text-foreground/80">適用對象：各 BU 的 RD／CE／Sourcer／Project leader。流程：先用下方「匯出 PLM 申請清單」拿到 .xls，再到 PLM 的 Non PVL 申請上傳，簽核通過後該專案掛 BOM 就不會再被卡。</p>
            {showSop && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-base font-semibold text-foreground">適用範圍</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-foreground/85">
                    {SOP_SCOPE.map((item) => <li key={item}>{item}</li>)}
                  </ol>
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">如何申請 ZZ／ZY／00-ODM 料件可於特定專案使用</p>
                  <ol className="mt-1 space-y-3">
                    {SOP_STEPS.map((step, index) => (
                      <li key={step.title} className="rounded-xl border border-border bg-background/40 p-3">
                        <p className="text-base font-semibold text-foreground"><span className="mr-1.5 font-mono text-primary">{index + 1}.</span>{step.title}</p>
                        {step.detail && <p className="mt-1 text-sm text-foreground/80">{step.detail}</p>}
                        {step.image && (
                          <img src={`${assetBase}${step.image}`} alt={`步驟 ${index + 1}：${step.title}`} loading="lazy" decoding="async" className="mt-2 w-auto max-w-full rounded-lg border border-border bg-white" />
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </section>

          <section className="workspace-dialog-section rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">匯出預覽</h3>
              <span className="text-sm text-foreground/75">{visibleRows.length.toLocaleString()} / {rows.length.toLocaleString()} 筆</span>
              <div className="relative ml-auto w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋位號、料名、MPN 或料號" aria-label="搜尋不建議料" className="h-8 rounded-lg pl-9 text-xs" />
              </div>
            </div>
            <div className="mt-2 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[960px] table-fixed text-left text-sm">
                <thead className="bg-background/60 text-muted-foreground">
                  <tr>
                    <th className="w-[13rem] px-3 py-2 font-semibold">Ref Des</th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="w-[15rem] px-3 py-2 font-semibold">MPN</th>
                    <th className="w-[15rem] px-3 py-2 font-semibold">實體料號</th>
                    <th className="w-[22rem] px-3 py-2 font-semibold">零件狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visibleRows.length === 0 ? (
                    <tr><td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">{rows.length === 0 ? "目前 BOM 沒有零件狀態為不建議用料的料" : "找不到符合條件的料"}</td></tr>
                  ) : visibleRows.map((row, index) => (
                    <tr key={`${row.refDes}-${row.manufacturerPartNumber}-${index}`} className={cn(!row.partNumber && "text-muted-foreground")}>
                      <td className="truncate px-3 py-1.5 font-mono" title={row.refDes}>{row.refDes || "—"}</td>
                      <td className="truncate px-3 py-1.5" title={row.name}>{row.name || "—"}</td>
                      <td className="truncate px-3 py-1.5 font-mono" title={row.manufacturerPartNumber}>{row.manufacturerPartNumber || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono">{row.partNumber || <span className="text-warning">未提供 · 不進申請清單</span>}</td>
                      <td className="truncate px-3 py-1.5" title={row.partUsageStatus}>{row.partUsageStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-3 sm:justify-between">
          <div className="grid gap-1 text-sm text-foreground/80">
            <p><strong className="text-foreground">PLM 申請清單（.xls）</strong>：只有「料號(必填)」一欄、一列一個實體料號，拿去 PLM 的 Non PVL 申請直接上傳。</p>
            <p><strong className="text-foreground">完整明細（.xlsx）</strong>：上面預覽的全部欄位（位號、料名、MPN、廠商、實體／虛擬料號、零件狀態），給自己或同事核對用。</p>
          </div>
          <div className="flex flex-none flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={isExporting || rows.length === 0} onClick={onExportDetail} className="h-10 px-4 text-sm">
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />匯出完整明細 (.xlsx)
            </Button>
            <Button type="button" data-testid="non-pvl-export-apply" disabled={isExporting || partNumbers.size === 0} onClick={onExportApplyList} className="h-10 px-4 text-sm font-bold">
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />{isExporting ? "匯出中…" : `匯出 PLM 申請清單 (.xls · ${partNumbers.size.toLocaleString()} 個料號)`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
