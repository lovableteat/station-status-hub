import { useState, type ReactNode } from "react";
import { ChevronDown, CircleHelp, ClipboardCheck, Download, FolderOpen, Info, ListChecks, PenLine, Play, TriangleAlert, Undo2, type LucideIcon } from "lucide-react";
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

type Note = { tone: "warn" | "info"; text: string };
type FlowStep = {
  icon: LucideIcon;
  title: ReactNode;
  sub?: string;
  notes?: Note[];
  /** Label on the arrow coming into this step. */
  via?: string;
  phase: "before" | "after";
  shape?: "terminal";
};

const PREPARE: FlowStep[] = [
  { icon: PenLine, title: "填比對名稱", sub: "通常填板名", phase: "before", shape: "terminal", notes: [{ tone: "info", text: "有舊結果時，換板按「新比對」，同板展開來源檔案" }] },
  { icon: FolderOpen, title: "選 A 舊版、B 新版", sub: "每版都放 Netlist、BOM、電路圖 PDF", phase: "before", notes: [{ tone: "info", text: "卡片右上角填版本名稱，例如 EVT、DVT" }, { tone: "info", text: "瀏覽器問要不要上傳，按「上傳」，檔案不會離開電腦" }, { tone: "warn", text: "重選會整批換掉，要一次選齊" }] },
];

const RUN: FlowStep[] = [
  { icon: Play, title: "按「開始比對」", sub: "比過的會顯示「重新比對」", via: "可以", phase: "before", notes: [{ tone: "warn", text: "名稱、版本名稱跟已存的一樣，會蓋掉那份" }] },
  { icon: ListChecks, title: "看結果", sub: "先看 ERROR，再看 WARN", via: "比完", phase: "after" },
  { icon: ClipboardCheck, title: "按「檢視」填回覆", sub: "一定要選處置，再按「儲存回覆」", phase: "after" },
  { icon: Download, title: "匯出備份", sub: "下載 .autocheck.zip", phase: "after", shape: "terminal", notes: [{ tone: "warn", text: "資料只存在這個瀏覽器，換電腦就沒了" }] },
];

const FILE_CHIPS: Array<{ level: "required" | "suggested" | "optional"; label: string; files: string[] }> = [
  { level: "required", label: "兩版皆必要", files: ["Netlist 三份 .dat", "BOM 用料表", "電路圖 PDF"] },
  { level: "optional", label: "選用", files: ["DSN 設計原檔", "IC Datasheet 規格書", "進階規則設定"] },
];

const FILE_RULES: Array<[string, string]> = [
  ["Netlist 連線資料（必要）", "pstxnet.dat：記錄哪些接腳連在同一條線上"],
  ["Netlist 零件資料（必要）", "pstxprt.dat：記錄元件名稱與零件資料"],
  ["Netlist 接腳資料（必要）", "pstchip.dat：記錄元件接腳定義"],
  ["零件用料表 BOM（必要）", "每版皆需，支援 .xls、.xlsx、.htm、.html、.csv"],
  ["電路圖 PDF（必要）", "每版皆需電路圖 .pdf；結果裡按「看圖」會開啟新版 PDF"],
  ["電路設計原檔 DSN（選用）", "OrCAD .dsn，用來抓頁面標題和變更紀錄"],
];

const STATUS_MEANINGS: Array<[string, string]> = [
  ["改版差異", "A 到 B 之間元件、BOM、連線的變動"],
  ["新增問題", "新版才有的規則問題"],
  ["既有問題", "舊版就有的問題，一樣要看"],
];

const TABS: Array<[string, string]> = [
  ["比對檢查／審查追蹤", "兩個分頁是同一張結果表。"],
  ["Power Tree", "從 pin 和電阻網路推出電源的上下游，可以縮放。"],
  ["I²C Map", "推出 bus、mux、strap 和每個裝置的位址。"],
  ["位址庫", "I²C 裝置的位址規則。可選取整個 Datasheet 資料夾，批次產生候選規則；每份要對過 PDF、簽核之後才會生效。"],
];

const FAQ: Array<[string, string]> = [
  ["重新比對會蓋掉什麼", "比對名稱、A、B 版本名稱跟已存的某份一樣，就會蓋掉那份的結果和報表，救不回來，只有回覆會留著。沒把握就先匯出備份。"],
  ["為什麼 BOM、電路圖 PDF 都是必要", "BOM 用來辨識用料與不上件零件，電路圖 PDF 用來對照問題位置。A、B 都要備齊這兩份與 Netlist 三份 .dat，少任何一份都不能開始比對。IC Datasheet 是額外的元件規格書，不是這裡的電路圖 PDF。"],
  ["Excel 裡填的回覆能匯回來嗎", "不行，Excel 只能看。要 Excel 就展開「報表與完整資料」下載，回覆要在系統裡填。"],
  ["換電腦後位址規則不見了", "匯入備份不會帶回位址庫。換電腦前先到「位址庫」→「使用者位址庫 YAML／匯入匯出」按「匯出 YAML」，到新電腦匯入後按「驗證並儲存」。"],
  ["右上角寫「唯讀」", "這個帳號沒有編輯權限：能看這個瀏覽器存過的比對、能匯出備份，不能比對、回覆或匯入。"],
  ["比對引擎載入失敗", "看到「無法載入比對引擎」或 Failed to fetch，多半是連不到 cdn.jsdelivr.net 或 PyPI，確認網路後重新整理。"],
];

function FlowNotes({ notes }: { notes?: Note[] }) {
  if (!notes?.length) return <div className="comparison-flow-notes" />;
  return <div className="comparison-flow-notes">
    {notes.map(note => <p key={note.text} className="comparison-flow-note" data-tone={note.tone}>
      {note.tone === "warn" ? <TriangleAlert aria-hidden="true" /> : <Info aria-hidden="true" />}
      <span>{note.text}</span>
    </p>)}
  </div>;
}

function FlowRow({ step, number }: { step: FlowStep; number: number }) {
  const Icon = step.icon;
  return <li className="comparison-flow-row" data-phase={step.phase}>
    {step.via && <span className="comparison-flow-via">{step.via}</span>}
    <div className="comparison-flow-node" data-shape={step.shape}>
      <span className="comparison-flow-number" aria-hidden="true">{number}</span>
      <div><strong>{step.title}</strong>{step.sub && <small>{step.sub}</small>}</div>
      <Icon className="comparison-flow-icon" aria-hidden="true" />
    </div>
    <FlowNotes notes={step.notes} />
  </li>;
}

export function ComparisonGuide() {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" className="comparison-guide-trigger" onClick={() => setOpen(true)}><CircleHelp />使用說明</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="comparison-guide-dialog">
        <DialogHeader>
          <DialogTitle>AutoCheck 使用說明</DialogTitle>
          <DialogDescription>舊版、新版工程檔比一比，問題直接在結果表裡回覆。</DialogDescription>
        </DialogHeader>

        <section className="comparison-guide-examples" aria-label="檔案準備範例圖">
          <h3>照這樣準備兩個版本的檔案</h3>
          <p>依資料夾與檔案截圖整理的範例；資料夾名稱可不同，系統依檔名與副檔名辨識。點圖可放大。</p>
          <div className="comparison-guide-example-grid">
            <figure><a href={`${import.meta.env.BASE_URL}comparison/guides/revision-folders.svg`} target="_blank" rel="noopener noreferrer" aria-label="放大版本資料夾範例圖"><img src={`${import.meta.env.BASE_URL}comparison/guides/revision-folders.svg`} width="640" height="360" alt="EVT 版本資料夾內放 BOM、Netlist、Schematic 子資料夾，分別準備用料表、三份 DAT、電路圖 PDF。" /></a><figcaption>每版各選一個資料夾，BOM、Netlist、電路圖 PDF 都要有。</figcaption></figure>
            <figure><a href={`${import.meta.env.BASE_URL}comparison/guides/netlist-files.svg`} target="_blank" rel="noopener noreferrer" aria-label="放大 Netlist 檔案範例圖"><img src={`${import.meta.env.BASE_URL}comparison/guides/netlist-files.svg`} width="640" height="360" alt="Netlist 必須包含 pstxnet.dat 連線資料、pstxprt.dat 零件資料、pstchip.dat 接腳資料。" /></a><figcaption>Netlist 三份 .dat 都是必要；元件規格書 IC Datasheet 是選用。</figcaption></figure>
          </div>
        </section>

        <section className="comparison-flow-wrap" aria-label="操作流程">
          <ol className="comparison-flow">
            {PREPARE.map((step, index) => <FlowRow key={index} step={step} number={index + 1} />)}
            <li className="comparison-flow-row is-decision" data-phase="before">
              <div className="comparison-flow-node" data-shape="decision">
                <span className="comparison-flow-diamond" aria-hidden="true" />
                <div><strong>比對按鈕能按嗎？</strong></div>
              </div>
              <div className="comparison-flow-branch">
                <span className="comparison-flow-branch-arrow">不能</span>
                <div className="comparison-flow-branch-box">
                  <p><strong>看按鈕旁那行字</strong>照著改</p>
                  <small><Undo2 aria-hidden="true" />改好就能按</small>
                </div>
              </div>
            </li>
            {RUN.map((step, index) => <FlowRow key={index} step={step} number={PREPARE.length + index + 1} />)}
          </ol>

          <div className="comparison-flow-files">
            <span className="comparison-flow-files-title">要放的檔案</span>
            {FILE_CHIPS.map(group => <span key={group.level} className="comparison-flow-file-group" data-level={group.level}>
              <em>{group.label}</em>
              {group.files.map(file => <code key={file}>{file}</code>)}
            </span>)}
          </div>
        </section>

        <details className="comparison-guide-more">
          <summary>詳細說明與常見問題<ChevronDown aria-hidden="true" /></summary>
          <div className="comparison-guide-grid">
            <section aria-label="會抓哪些檔案">
              <h3>會抓哪些檔案</h3>
              <dl className="comparison-guide-pairs">
                {FILE_RULES.map(([role, rule]) => <div key={role}><dt>{role}</dt><dd>{rule}</dd></div>)}
              </dl>
              <p className="comparison-guide-note">BOM 和 PDF 只看副檔名，資料夾裡有好幾份就會出現下拉選單讓你挑。用不到的檔案也算在上限裡：每版最多 1000 個檔案、單檔 64 MiB、合計 128 MiB；A、B 實際拿去比的檔案加上進階設定和 Datasheet，總共也不能超過 128 MiB。超過就另外開一個只放工程檔的資料夾。</p>
            </section>

            <section aria-label="結果怎麼看">
              <h3>結果怎麼看</h3>
              <dl className="comparison-guide-pairs">
                {TABS.map(([tab, purpose]) => <div key={tab}><dt>{tab}</dt><dd>{purpose}</dd></div>)}
              </dl>
              <dl className="comparison-guide-pairs comparison-guide-status">
                {STATUS_MEANINGS.map(([status, meaning]) => <div key={status}><dt>{status}</dt><dd>{meaning}</dd></div>)}
              </dl>
            </section>

            <section aria-label="存檔與備份">
              <h3>存檔與備份</h3>
              <ul>
                <li><strong>自動存檔</strong>：比完結果存在這個瀏覽器，伺服器上沒有副本。清掉瀏覽器資料、開無痕或換電腦就沒了。</li>
                <li><strong>匯出備份</strong>：下載 .autocheck.zip，結果、回覆、原始報表都在裡面。</li>
                <li><strong>匯入備份</strong>：讀回 .autocheck.zip。名稱重複會另存成「（匯入 …）」，不會蓋掉現有的，回覆也不會合併。</li>
                <li><strong>新比對</strong>：清空畫面重來。之前存的比對都還在，從「已儲存的比對」切回去就好。</li>
              </ul>
            </section>
          </div>

          <section className="comparison-guide-faq" aria-label="常見問題">
            <h3>常見問題</h3>
            <dl className="comparison-guide-pairs">
              {FAQ.map(([question, answer]) => <div key={question}><dt>{question}</dt><dd>{answer}</dd></div>)}
            </dl>
          </section>

          <section className="comparison-guide-extra" aria-label="其他功能">
            <h3>其他功能</h3>
            <p><strong>選用工具：IC Datasheet 與進階設定</strong>：在「開始比對」按鈕下面，可按「選擇 Datasheet 資料夾」一次加入整批 PDF，包含子資料夾；也能繼續加入其他資料夾，非 PDF 會略過。本次比對的 A、B、選用工具與 Datasheet 合計上限 128 MiB／1000 份。較大的資料夾可到位址庫按「批次產生候選規則」，逐份處理、核對與簽核。IC Datasheet 是選用資料，不會代替必要的電路圖 PDF。規則設定 YAML、電壓對照、電源域與 I²C 對照 CSV 仍可在這裡加入。</p>
            <p><strong>意見收集</strong>：回報問題或建議，可以截圖、選圖片或直接貼上，最多 5 張。這個會上傳到伺服器給管理員看，送出後自己刪不掉，截圖前確認畫面上沒有不能外流的線路圖。</p>
          </section>
        </details>
      </DialogContent>
    </Dialog>
  </>;
}
