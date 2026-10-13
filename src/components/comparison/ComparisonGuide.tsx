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
    title: "填比對名稱",
    body: "通常填板名，例如 CATANIA PDB。畫面上還是上一次的比對，要比別塊板就先按「新比對」。",
  },
  {
    title: "選 A、B 兩版的檔案",
    body: "A 放舊版、B 放新版，用「選擇資料夾」或「選擇檔案」都行，子資料夾也會找。重選會整批換掉，不會疊加，所以一次選齊。版本名稱在卡片右上角改，兩版不能同名。",
  },
  {
    title: "確認三份 netlist 都有勾",
    body: "pstxnet、pstxprt、pstchip 一定要有。同一項找到好幾份會出現下拉選單，挑一份就好；BOM、DSN、PDF 不想用就選「不使用」。",
  },
  {
    title: "按「開始比對」",
    body: "比過一次後按鈕會變成「重新比對」。檔案只在你的電腦上跑，不會上傳，比完結果自動存在這個瀏覽器。",
  },
] as const;

const FILE_RULES: Array<[string, string]> = [
  ["Net 連線（必要）", "檔名有 pstxnet 的 .dat"],
  ["零件列表（必要）", "檔名有 pstxprt 的 .dat"],
  ["Pin 定義（必要）", "檔名有 pstchip 的 .dat"],
  ["ERP BOM", ".xls、.xlsx、.htm、.html、.csv"],
  ["OrCAD DSN", ".dsn，用來抓頁面標題和變更紀錄"],
  ["線路圖 PDF", ".pdf，只用 B 版的。放在 B 版，結果裡的「看圖」才會跳到新版線路圖"],
];

const STATUS_MEANINGS: Array<[string, string]> = [
  ["改版差異", "A 到 B 之間元件、BOM、連線的變動"],
  ["新增問題", "新版才有的規則問題"],
  ["既有問題", "舊版就有的問題，一樣要看"],
];

const TABS: Array<[string, string]> = [
  ["比對檢查／審查追蹤", "同一張結果表，可以用搜尋、狀態、負責人、嚴重度、類別、頁碼篩，一頁 50 筆。按「檢視」看細節、填回覆。"],
  ["Power Tree", "從 pin 和電阻網路推出電源的上下游，可以縮放。"],
  ["I²C Map", "推出 bus、mux、strap 和每個裝置的位址。"],
  ["位址庫", "I²C 裝置的位址規則。從 Datasheet 產生的候選規則，要對過 PDF、簽核之後才會生效。"],
];

const WARNINGS: Array<[string, string]> = [
  ["同名重新比對會蓋掉舊的", "比對名稱、A、B 版本名稱都跟上次一樣時，重新比對會直接蓋掉舊結果和報表，救不回來，只有回覆會留著。沒把握就先匯出備份。"],
  ["沒放 BOM 會多一堆假警報", "沒有 BOM 就分不出哪些零件 DNP，全部當成有上件，BOM 檢查也會跳過，「輸入完整性」會報 ERROR。正式審查兩版都要放 ERP BOM。"],
  ["資料只存在這個瀏覽器", "伺服器上沒有副本。清掉瀏覽器資料、開無痕或換電腦，比對和回覆就沒了。回覆填完記得匯出備份。"],
  ["整個專案資料夾丟進來可能超量", "用不到的檔案也算在上限裡：每版最多 1000 個檔案、單檔 64 MiB、合計 128 MiB。A、B 實際拿去比的檔案加上進階設定和 Datasheet，總共也不能超過 128 MiB。超過的話，另外開一個只放工程檔的資料夾再選。"],
];

const FAQ: Array<[string, string]> = [
  ["「開始比對」按不下去", "看按鈕旁邊那行字，會寫卡在哪裡：唯讀、沒填名稱、缺 netlist、有項目還沒挑檔案，或檔案超量。"],
  ["填了回覆還算未回覆", "要選了「處置」才算，只填負責人或備註不算。"],
  ["Excel 裡填的回覆能匯回來嗎", "不行。Excel 只是給人看、存檔用的，回覆要在系統裡按「檢視」填，再按「儲存回覆」。"],
  ["換電腦後位址規則不見了", "匯入備份不會帶回位址庫。換電腦前先到「位址庫」→「使用者位址庫 YAML／匯入匯出」按「匯出 YAML」，到新電腦匯入後按「驗證並儲存」。"],
  ["右上角寫「唯讀」", "這個帳號沒有編輯權限，只能看這個瀏覽器之前存的比對，也不能匯入備份，自己匯出的也一樣。"],
  ["比對引擎載入失敗", "看到「無法載入比對引擎」、failed to load 或 Failed to fetch，多半是網路連不到 cdn.jsdelivr.net 或 PyPI。確認連得上再重新整理。每次重開頁面或按「取消」都會重新載入一次。"],
];

export function ComparisonGuide() {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="ghost" onClick={() => setOpen(true)}><CircleHelp />使用說明</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="comparison-guide-dialog">
        <DialogHeader>
          <DialogTitle>AutoCheck 使用說明</DialogTitle>
          <DialogDescription>拿同一塊板的舊版和新版工程檔來比，看連線、零件、BOM 改了什麼、哪些規則沒過，問題直接在結果表裡回覆。</DialogDescription>
        </DialogHeader>

        <section className="comparison-guide-steps" aria-label="怎麼開始">
          <h3>怎麼開始</h3>
          <ol>
            {STEPS.map((step, index) => <li key={step.title}>
              <span className="comparison-guide-step-number" aria-hidden="true">{index + 1}</span>
              <div><strong>{step.title}</strong><p>{step.body}</p></div>
            </li>)}
          </ol>
        </section>

        <section className="comparison-guide-traps" aria-label="注意">
          <h3><TriangleAlert aria-hidden="true" />注意</h3>
          <dl className="comparison-guide-pairs">
            {WARNINGS.map(([warning, detail]) => <div key={warning}><dt>{warning}</dt><dd>{detail}</dd></div>)}
          </dl>
        </section>

        <div className="comparison-guide-grid">
          <section aria-label="會抓哪些檔案">
            <h3>會抓哪些檔案</h3>
            <dl className="comparison-guide-pairs">
              {FILE_RULES.map(([role, rule]) => <div key={role}><dt>{role}</dt><dd>{rule}</dd></div>)}
            </dl>
            <p className="comparison-guide-note">BOM 和 PDF 只看副檔名，資料夾裡有好幾份就會出現下拉選單讓你挑。</p>
          </section>

          <section aria-label="結果怎麼看">
            <h3>結果怎麼看</h3>
            <dl className="comparison-guide-pairs">
              {TABS.map(([tab, purpose]) => <div key={tab}><dt>{tab}</dt><dd>{purpose}</dd></div>)}
            </dl>
            <p className="comparison-guide-note">先處理 ERROR，再看 WARN，INFO 最後。</p>
            <dl className="comparison-guide-pairs comparison-guide-status">
              {STATUS_MEANINGS.map(([status, meaning]) => <div key={status}><dt>{status}</dt><dd>{meaning}</dd></div>)}
            </dl>
          </section>

          <section aria-label="回覆問題">
            <h3>回覆問題</h3>
            <p>在結果表按「檢視」，填這幾欄：</p>
            <ul>
              <li><strong>處置</strong>：修改、刻意設計、誤報、待討論、N/A</li>
              <li><strong>負責人</strong>、<strong>預計版次</strong></li>
              <li><strong>備註</strong>，填完按「儲存回覆」</li>
            </ul>
            <p className="comparison-guide-note">每次修改都有紀錄。要 Excel 就展開「報表與完整資料」下載，裡面有回覆。</p>
          </section>

          <section aria-label="存檔與備份">
            <h3>存檔與備份</h3>
            <ul>
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
          <p><strong>進階設定與 I²C Datasheet</strong>：在「開始比對」按鈕下面的摺疊區，可以放規則設定 YAML、Net 電壓對照、電源域、I²C Block Diagram 對照 CSV 和 Datasheet PDF，要在比對前選好。畫面上已經有結果的話，先展開「展開來源檔案，重新比對」才看得到。</p>
          <p><strong>意見收集</strong>：回報問題或建議，可以截圖、選圖片或直接貼上，最多 5 張。這個會上傳到伺服器給管理員看，送出後自己刪不掉，截圖前確認畫面上沒有不能外流的線路圖。</p>
        </section>
      </DialogContent>
    </Dialog>
  </>;
}
