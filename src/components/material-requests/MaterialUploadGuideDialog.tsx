import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MATERIAL_CE_FIELDS,
  MATERIAL_CE_FORMAT_REVISION,
  MATERIAL_CE_HEADER_ROW,
  MATERIAL_CE_MEANING_ROW,
  MATERIAL_CE_DATA_START_ROW,
  MATERIAL_HANDOFF_ROLES,
  MATERIAL_HANDOFF_RULES,
  MATERIAL_HANDOFF_STEPS,
  MATERIAL_HANDOFF_VERSION,
} from "./materialUploadContract.mjs";

export function UploadGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const templateUrl = `${import.meta.env.BASE_URL}material-upload-template.xlsx?v=${MATERIAL_CE_FORMAT_REVISION}`;
  const referenceUrl = `${import.meta.env.BASE_URL}material-ce-reference.xlsx?v=${MATERIAL_CE_FORMAT_REVISION}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[min(92vw,1400px)] max-w-[min(92vw,1400px)] overflow-y-auto border-blue-400/30 bg-[#0d1729] text-base text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-2xl text-slate-50">上傳說明・CE／RD 交付規格</DialogTitle>
          <DialogDescription className="text-[15px] leading-6 text-slate-400">
            公司系統維持原流程 → CE 整理並補零件狀態 → 工具自動處理 → RD 確認與追蹤。版本 {MATERIAL_HANDOFF_VERSION}。
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-5 py-2 text-[15px]">
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
            <p className="mt-2 leading-6 text-slate-300">交給 CE 只需要這份空白格式，資料整理、查核與填寫由 CE 自行處理。第 {MATERIAL_CE_HEADER_ROW} 列是固定表頭，第 {MATERIAL_CE_MEANING_ROW} 列逐欄說明意思，第 {MATERIAL_CE_DATA_START_ROW} 列起填資料；內部參考另檔提供。</p>
            <p className="mt-3 rounded-xl border border-sky-300/20 bg-[#0a1527] p-3 leading-6 text-sky-100">{MATERIAL_HANDOFF_RULES[2]}</p>
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
            <h3 className="text-lg font-bold text-amber-200">3. 原理圖符號與來源欄位</h3>
            <p className="mt-3 leading-6 text-slate-300">{MATERIAL_HANDOFF_RULES[1]}</p>
            <p className="mt-3 rounded-xl border border-amber-300/20 bg-[#0a1527] p-3 leading-6 text-amber-100">
              Schematic_Part 填原理圖符號，例如 CAP；由 CE 在 OrCAD 核對能否叫出該符號。網站依 Excel 顯示此欄內容。
            </p>
            <p className="mt-3 leading-6 text-slate-300">Sourcing Status、phase out 與「零件狀態」仍各自保留來源原文，依你提供的格式與欄位順序交付。</p>
            <p className="mt-3 leading-6 text-slate-300">{MATERIAL_HANDOFF_RULES[3]}</p>
            <p className="mt-3 rounded-xl border border-cyan-300/20 bg-[#0a1527] p-3 leading-6 text-cyan-100">{MATERIAL_HANDOFF_RULES[5]}</p>
          </section>

          <section className="rounded-2xl border border-blue-400/20 bg-[#101d33] p-5" aria-labelledby="handoff-fields-title">
            <h3 id="handoff-fields-title" className="text-lg font-bold text-blue-200">4. 每一欄由誰填、網站放哪裡</h3>
            <p className="mt-2 leading-6 text-slate-300">依你提供的 {MATERIAL_CE_FIELDS.length} 欄格式交付。第 {MATERIAL_CE_HEADER_ROW}、{MATERIAL_CE_MEANING_ROW} 列請保留，第 {MATERIAL_CE_DATA_START_ROW} 列起一列填一個廠商的一個實體料；同一虛擬料下的實體料分列填寫。Schematic_Part 依第 {MATERIAL_CE_MEANING_ROW} 列的說明核對 OrCAD 原理圖符號，PCB_Footprint 為零件 footprint。</p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-blue-400/15" tabIndex={0} role="region" aria-label="CE 交付欄位責任表，可左右捲動">
              <table className="w-full min-w-[940px] text-left text-sm">
                <thead className="bg-blue-400/10 text-blue-200">
                  <tr>{["Excel 固定欄位", `第 ${MATERIAL_CE_MEANING_ROW} 列中文意思`, "填寫／帶出窗口", "填寫規則", "網站位置"].map(label => <th key={label} scope="col" className="px-3 py-3 font-bold">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {MATERIAL_CE_FIELDS.map(field => (
                    <tr key={field.header} className="border-t border-blue-400/10 align-top">
                      <th scope="row" className="px-3 py-3 font-semibold text-slate-100">{field.header}</th>
                      <td className="px-3 py-3 leading-6 text-slate-200">{field.meaning}</td>
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
              <li>第 {MATERIAL_CE_HEADER_ROW} 列表頭與第 {MATERIAL_CE_MEANING_ROW} 列中文意思請保留；第 {MATERIAL_CE_DATA_START_ROW} 列起才是料件資料，中文意思列不會匯入為料件。</li>
              <li>每列填一個廠商的一個 MPN 與實體料號；同一虛擬料下的實體料重複填相同虛擬料號，同一設計位置保留相同 Ref Des。</li>
              <li>新格式依 Ref Des 與系統／模組分組，不以料名或虛擬料號把不同設計位置合併；不要求 CE 另外手動上色。</li>
              <li>保留實體料號前導零；沒有實體料號就留白，不把虛擬料號或 MPN 代填。</li>
              <li>舊檔的 Virtual PN／TX 讀為虛擬料號；Part Number／PEGA P/N 讀為實體料號。第二 MPN、Ref_tmp、LV、CIS/Remark 不再要求 CE 填寫。</li>
              <li>Schematic_Part：原理圖符號(orcad要能叫出原理圖符號)。由 CE 核對後填寫，不再另外填 Symbol 欄。</li>
              <li>舊 BOM 仍可匯入，phase out 缺值顯示未提供；既有追蹤與來源原值繼續保留。</li>
              <li>只保留一張要匯入的資料工作表。網站會自動挑資料最完整的工作表，因此空白範本與示範資料分成兩個檔案。</li>
              <li>每次上傳都會保存為獨立版本，不會覆蓋舊資料。同一塊板再上傳即成為新版本：選檔後在確認視窗指定「作為既有系列的新版本」，RD 的追蹤紀錄會依位號與料號帶到新版，並可在 BOM 管理比對新舊版差異、匯出差異 Excel 給工廠。匯入後核對位號、虛實料號、原理圖符號、phase out、零件狀態與分組，再繼續作業。</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
