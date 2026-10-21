import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MATERIAL_CE_FIELDS,
  MATERIAL_HANDOFF_ROLES,
  MATERIAL_HANDOFF_RULES,
  MATERIAL_HANDOFF_STEPS,
  MATERIAL_HANDOFF_VERSION,
} from "./materialUploadContract.mjs";

export function UploadGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const templateUrl = `${import.meta.env.BASE_URL}material-upload-template.xlsx?v=${MATERIAL_HANDOFF_VERSION}-format-only`;
  const referenceUrl = `${import.meta.env.BASE_URL}material-ce-reference.xlsx?v=${MATERIAL_HANDOFF_VERSION}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-blue-400/30 bg-[#0d1729] text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-2xl text-slate-50">上傳說明・CE／RD 交付規格</DialogTitle>
          <DialogDescription className="text-[15px] leading-6 text-slate-400">
            公司系統維持原流程 → CE 整理並補零件狀態 → 工具自動處理 → RD 確認與追蹤。版本 {MATERIAL_HANDOFF_VERSION}。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-[15px]">
          <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] p-5" aria-labelledby="handoff-roles-title">
            <h3 id="handoff-roles-title" className="text-lg font-bold text-cyan-200">1. 誰負責哪一段</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {MATERIAL_HANDOFF_ROLES.map(({ role, responsibility, output }) => (
                <div key={role} className="rounded-xl border border-cyan-400/15 bg-[#0a1527] p-4">
                  <h4 className="font-bold text-slate-100">{role}</h4>
                  <p className="mt-2 leading-6 text-slate-300">{responsibility}</p>
                  <p className="mt-3 text-sm font-semibold text-cyan-200">交付／產出：{output}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 leading-6 text-slate-300">{MATERIAL_HANDOFF_RULES[0]}</p>
          </section>

          <section className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] p-5" aria-labelledby="handoff-download-title">
            <h3 id="handoff-download-title" className="text-lg font-bold text-sky-200">2. 交給 CE 的檔案</h3>
            <p className="mt-2 leading-6 text-slate-300">交給 CE 只需要這份空白格式，資料整理、查核與填寫由 CE 自行處理。交付檔只有固定欄位，沒有分工說明或示範資料；欄位參考留供內部核對。</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="shrink-0 font-bold">
                <a href={templateUrl} download="CE_BOM_交付格式.xlsx">
                  <Download className="mr-2 h-4 w-4" />下載 CE 交付格式
                </a>
              </Button>
              <Button asChild variant="outline" className="shrink-0 font-bold">
                <a href={referenceUrl} download="CE_BOM_填寫參考與範例.xlsx">
                  <Download className="mr-2 h-4 w-4" />下載內部欄位參考
                </a>
              </Button>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">{MATERIAL_HANDOFF_RULES[4]}</p>
          </section>

          <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-5">
            <h3 className="text-lg font-bold text-amber-200">3. 兩種狀態分開，不能互相代替</h3>
            <p className="mt-3 leading-6 text-slate-300">{MATERIAL_HANDOFF_RULES[1]}</p>
            <p className="mt-3 rounded-xl border border-amber-300/20 bg-[#0a1527] p-3 leading-6 text-amber-100">
              例如：Sourcing Status＝Approved，零件狀態＝ODM 不建議用料。網站會分開保留並提示風險，交由 RD 按公司流程確認。
            </p>
            <p className="mt-3 leading-6 text-slate-300">{MATERIAL_HANDOFF_RULES[2]}</p>
            <p className="mt-3 leading-6 text-slate-300">{MATERIAL_HANDOFF_RULES[3]}</p>
          </section>

          <section className="rounded-2xl border border-blue-400/20 bg-[#101d33] p-5" aria-labelledby="handoff-fields-title">
            <h3 id="handoff-fields-title" className="text-lg font-bold text-blue-200">4. 每一欄由誰填、網站放哪裡</h3>
            <p className="mt-2 leading-6 text-slate-300">範本第 4 列是固定表頭，第 5 列起填資料。CE 從原 BOM 或公司系統保留／帶出資料，不必重新手打整份 BOM；最右側「零件狀態」是本次補欄。</p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-blue-400/15" tabIndex={0} role="region" aria-label="CE 交付欄位責任表，可左右捲動">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-blue-400/10 text-blue-200">
                  <tr>{["Excel 固定欄位", "填寫／帶出窗口", "填寫規則", "網站位置"].map(label => <th key={label} scope="col" className="px-3 py-3 font-bold">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {MATERIAL_CE_FIELDS.map(field => (
                    <tr key={field.header} className="border-t border-blue-400/10 align-top">
                      <th scope="row" className="px-3 py-3 font-semibold text-slate-100">{field.header}</th>
                      <td className="px-3 py-3 text-cyan-200">{field.owner}</td>
                      <td className="px-3 py-3 leading-6 text-slate-300">{field.requirement}</td>
                      <td className="px-3 py-3 text-slate-300">{field.destination}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
            <h3 className="text-lg font-bold text-emerald-200">5. 實際交付與驗收流程</h3>
            <ol className="mt-3 list-decimal space-y-3 pl-5 leading-6 text-slate-300">
              {MATERIAL_HANDOFF_STEPS.map(step => <li key={step}>{step}</li>)}
            </ol>
          </section>

          <section className="rounded-2xl border border-slate-400/20 bg-[#101d33] p-5">
            <h3 className="text-lg font-bold text-slate-100">6. 匯入前再檢查</h3>
            <ul className="mt-3 list-disc space-y-3 pl-5 leading-6 text-slate-300">
              <li>一列一個廠商料，同組替代料相鄰排列；Ref Des 不可用料名取代，Ref_tmp 可留白或與位號相同。</li>
              <li>既有檔若有藍色主料起始列，網站會優先採用該分組。新範本使用 Ref Des／Ref_tmp，不要求 CE 另外手動上色。</li>
              <li>保留公司料號前導零；沒有公司料號就留白，不把 TX 或 MPN 當正式公司料號。</li>
              <li>TX 優先讀 Virtual PN，再讀 PEGA P/N，最後相容舊檔 TX P/N。CIS/Remark 不匯入網站追蹤。</li>
              <li>舊 BOM 缺少零件狀態仍可匯入，但不代表已完成 CE 狀態確認；本次 CE 交付請補齊，不明就填待確認。</li>
              <li>只保留一張要匯入的資料工作表。網站會自動挑資料最完整的工作表，因此空白範本與示範資料分成兩個檔案。</li>
              <li>相同檔名重新上傳會更新原 BOM；要保留不同版本請先另存不同檔名。匯入後核對位號、料號、兩種狀態與分組，再繼續作業。</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
