import { useState } from "react";
import { CircleHelp, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * First-use guide for AutoCheck. Every statement mirrors behaviour in this
 * module (files.ts, ComparisonInputs, ComparisonWorkspace, ComparisonResults,
 * backup.ts, storage.ts, the library and feedback panels) or the engine under
 * public/comparison (worker limits, pipeline input issues, DRC status tags).
 * Each claim was checked against that source; update the text when the
 * behaviour moves.
 */

const STEPS = [
  {
    title: "填寫比對名稱",
    body: "例如板名「CATANIA PDB」，最多 120 字。若畫面已帶出上一次的比對，要比另一塊板請先按「新比對」。",
  },
  {
    title: "選取 A 舊版、B 新版資料",
    body: "各按「選擇資料夾」或「選擇檔案」，子資料夾也會辨識。每按一次都會取代該版先前選的檔案，不會累加，請一次選齊。版本名稱可在卡片右上角修改，兩版不可相同。",
  },
  {
    title: "確認必要檔案都打勾",
    body: "Net 連線、零件列表、Pin 定義三份 netlist 必須都有。同一項若有多份檔案會出現下拉選單，必須選定一份，選用項目也可選「不使用」。",
  },
  {
    title: "按「開始比對」",
    body: "已有結果時按鈕顯示「重新比對」。工程檔案在你的電腦上處理，不會上傳；完成後結果會自動存在這台瀏覽器。",
  },
] as const;

const FILE_RULES: Array<[string, string]> = [
  ["Net 連線（必要）", "檔名含 pstxnet 的 .dat"],
  ["零件列表（必要）", "檔名含 pstxprt 的 .dat"],
  ["Pin 定義（必要）", "檔名含 pstchip 的 .dat"],
  ["ERP BOM", "所有 .xls、.xlsx、.htm、.html、.csv"],
  ["OrCAD DSN", ".dsn（提供頁面標題與變更紀錄）"],
  ["線路圖 PDF", "所有 .pdf。只會使用 B 新版的 PDF，放在 B 版才能從結果「看圖」跳到新版線路圖"],
];

const STATUS_MEANINGS: Array<[string, string]> = [
  ["改版差異", "A → B 的元件、BOM、連線變動。"],
  ["新增問題", "規則檢查只在新版出現的問題。"],
  ["既有問題", "舊版就已存在的問題，不代表已處理。"],
];

const TABS: Array<[string, string]> = [
  ["比對檢查／審查追蹤", "同一份結果表，可依搜尋、狀態、負責人、嚴重度、類別、頁碼篩選，每頁 50 筆；按「檢視」看詳情並填回覆。"],
  ["Power Tree", "依 pin 與電阻網路推導電源上下游，可縮放。"],
  ["I²C Map", "推導 bus、mux、strap 與裝置位址。"],
  ["位址庫", "I²C 裝置位址規則。從 Datasheet 產生的候選規則要對照 PDF 核對並簽核後才會生效。"],
];

const TRAPS: Array<[string, string]> = [
  ["重新比對會覆蓋舊結果", "比對名稱、A、B 版本名稱三者都相同時，新結果會取代舊結果與報表且無法復原（已填回覆會保留）。不確定時先「匯出備份」。"],
  ["沒放 BOM 會出現大量假警報", "缺少 BOM 時 DNP 規則停用、所有零件視為上件，BOM 檢查也會略過，「輸入完整性」會標示 ERROR。正式審查請兩版都放 ERP BOM。"],
  ["資料只存在這台瀏覽器", "沒有伺服器副本。清除瀏覽器網站資料、使用無痕視窗或換電腦，比對與回覆都會消失，填完重要回覆請隨手「匯出備份」。"],
  ["整個專案資料夾可能太大", "不相關的檔案雖然不會送去比對，仍計入每版上限：最多 1000 份檔案、單檔 64 MiB、整個選取合計 128 MiB。另外 A、B 實際比對的檔案加上進階設定與 Datasheet，合計也不可超過 128 MiB。超過時請改選只放工程檔的資料夾。"],
];

const FAQ: Array<[string, string]> = [
  ["「開始比對」按不下去", "看按鈕旁的提示，會寫出目前卡住的原因：唯讀權限、比對名稱未填、缺少必要 netlist、某一項有多份檔案尚未選定，或檔案超過上限。"],
  ["回覆數一直追不完", "只有「處置」選了值才算已回覆；只填負責人或備註的項目仍算未回覆。"],
  ["在 Excel 裡填的回覆", "下載的 Excel 只供閱讀與存檔，在 Excel 填寫的內容無法匯回系統，請在系統內按「檢視」→「儲存回覆」。"],
  ["換電腦後位址規則不見了", "「匯入備份」不會還原你簽核的位址庫。換電腦前請到「位址庫」→「使用者位址庫 YAML／匯入匯出」按「匯出 YAML」，到新電腦再匯入並「驗證並儲存」。"],
  ["右上角顯示「唯讀」", "沒有編輯權限，只能檢視這個帳號先前在這台瀏覽器存下的比對，也無法匯入任何備份（包括自己匯出的）。"],
  ["比對引擎載入失敗", "例如出現「無法載入比對引擎」、failed to load 或 Failed to fetch。執行套件需要從 cdn.jsdelivr.net、PyPI 等網站下載，請確認網路沒有封鎖，再重新整理頁面。每次重新開啟頁面或按「取消」後都會重新載入。"],
];

export function ComparisonGuide() {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="ghost" onClick={() => setOpen(true)}><CircleHelp />使用說明</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="comparison-guide-dialog">
        <DialogHeader>
          <DialogTitle>AutoCheck 使用說明</DialogTitle>
          <DialogDescription>比對同一塊板子的舊版與新版工程檔，找出連線、元件、BOM 與線路規則的差異，並逐筆追蹤審查處置。</DialogDescription>
        </DialogHeader>

        <section className="comparison-guide-steps" aria-label="四步驟開始">
          <h3>四步驟開始</h3>
          <ol>
            {STEPS.map((step, index) => <li key={step.title}>
              <span className="comparison-guide-step-number" aria-hidden="true">{index + 1}</span>
              <div><strong>{step.title}</strong><p>{step.body}</p></div>
            </li>)}
          </ol>
        </section>

        <section className="comparison-guide-traps" aria-label="容易踩到的地方">
          <h3><TriangleAlert aria-hidden="true" />容易踩到的地方</h3>
          <dl className="comparison-guide-pairs">
            {TRAPS.map(([trap, detail]) => <div key={trap}><dt>{trap}</dt><dd>{detail}</dd></div>)}
          </dl>
        </section>

        <div className="comparison-guide-grid">
          <section aria-label="檔案怎麼辨識">
            <h3>檔案怎麼辨識</h3>
            <dl className="comparison-guide-pairs">
              {FILE_RULES.map(([role, rule]) => <div key={role}><dt>{role}</dt><dd>{rule}</dd></div>)}
            </dl>
            <p className="comparison-guide-note">ERP BOM 與線路圖 PDF 會把所有符合副檔名的檔案都列為候選，資料夾裡有多份時請在下拉選單選定。</p>
          </section>

          <section aria-label="結果怎麼看">
            <h3>結果怎麼看</h3>
            <dl className="comparison-guide-pairs">
              {TABS.map(([tab, purpose]) => <div key={tab}><dt>{tab}</dt><dd>{purpose}</dd></div>)}
            </dl>
            <p className="comparison-guide-note">嚴重度依 ERROR、WARN、INFO 由高到低處理。</p>
            <dl className="comparison-guide-pairs comparison-guide-status">
              {STATUS_MEANINGS.map(([status, meaning]) => <div key={status}><dt>{status}</dt><dd>{meaning}</dd></div>)}
            </dl>
          </section>

          <section aria-label="填寫審查回覆">
            <h3>填寫審查回覆</h3>
            <p>在結果列按「檢視」，填寫：</p>
            <ul>
              <li><strong>處置</strong>：修改、刻意設計、誤報、待討論、N/A</li>
              <li><strong>負責人</strong>與<strong>預計版次</strong></li>
              <li><strong>備註</strong>，再按「儲存回覆」</li>
            </ul>
            <p className="comparison-guide-note">每次修改都會留下紀錄。展開「報表與完整資料」可下載含回覆的 Excel。</p>
          </section>

          <section aria-label="資料存放與備份">
            <h3>資料存放與備份</h3>
            <ul>
              <li><strong>匯出備份</strong>：下載 .autocheck.zip，內含比對結果、審查回覆與原始報表。</li>
              <li><strong>匯入備份</strong>：載入 .autocheck.zip；同名比對會另存成一份「（匯入 …）」，不會覆寫，也不會與現有回覆合併。</li>
              <li><strong>新比對</strong>：清空畫面重新開始，已存的比對不會被刪除，可從「已儲存的比對」切回。</li>
            </ul>
          </section>
        </div>

        <section className="comparison-guide-faq" aria-label="常見問題">
          <h3>常見問題</h3>
          <dl className="comparison-guide-pairs">
            {FAQ.map(([question, answer]) => <div key={question}><dt>{question}</dt><dd>{answer}</dd></div>)}
          </dl>
        </section>

        <section className="comparison-guide-extra" aria-label="選用功能">
          <h3>選用功能</h3>
          <p><strong>進階設定與 I²C Datasheet</strong>（「開始比對」按鈕下方的摺疊區）：可加入規則設定 YAML、Net 電壓對照、電源域、I²C Block Diagram 對照 CSV 與 Datasheet PDF，請在按「開始比對」前選好。畫面已帶出比對結果時，先展開「展開來源檔案，重新比對」才看得到。</p>
          <p><strong>意見收集</strong>：回報問題或建議，可擷取畫面、選取圖片或直接貼上截圖（最多 5 張）。與比對不同，回報內容與截圖<strong>會上傳到伺服器</strong>給管理員查看，送出後無法自行刪除，截圖前請確認畫面上沒有不該外流的線路圖。</p>
        </section>
      </DialogContent>
    </Dialog>
  </>;
}
