import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { MATERIAL_CE_FIELDS, MATERIAL_CE_FORMAT_REVISION, MATERIAL_CE_HEADER_ROW, MATERIAL_CE_MEANING_ROW, MATERIAL_CE_DATA_START_ROW, MATERIAL_HANDOFF_ROLES, MATERIAL_HANDOFF_RULES } from "./materialUploadContract.mjs";
import { MATERIAL_TRACKING_STATUS_OPTIONS } from "./materialTrackingStatus";
import "./materialUploadGuide.css";

const GUIDE_UPDATED_AT = "2026-11-09";
const chapters = [
  { id: "start", title: "快速開始" },
  { id: "ce", title: "CE 交付格式" },
  { id: "versions", title: "BOM 匯入與版本" },
  { id: "find", title: "找料與個人標記" },
  { id: "tracking", title: "追蹤、備註與週報" },
  { id: "spec", title: "SPEC 與 AI 填表" },
  { id: "pages", title: "頁數進度與 PDF AI" },
  { id: "circuit", title: "線路修改與 Review" },
  { id: "roles", title: "分工與常見問題" },
];

export function UploadGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [chapter, setChapter] = useState("start");
  const content = useRef<HTMLElement>(null);
  const index = chapters.findIndex(item => item.id === chapter);
  const templateUrl = `${import.meta.env.BASE_URL}material-upload-template.xlsx?v=${MATERIAL_CE_FORMAT_REVISION}`;
  const referenceUrl = `${import.meta.env.BASE_URL}material-ce-reference.xlsx?v=${MATERIAL_CE_FORMAT_REVISION}`;
  useEffect(() => { if (open) setChapter("start"); }, [open]);
  useEffect(() => { content.current?.scrollTo({ top: 0 }); }, [chapter]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent hideCloseButton className="material-upload-guide" data-testid="material-upload-guide">
      <header className="material-guide-header"><div><DialogTitle>上傳說明・CE／RD 交付規格</DialogTitle><DialogDescription>依工作選章節，查看交付格式與目前網站的操作方式。<span>說明更新 {GUIDE_UPDATED_AT}</span></DialogDescription></div><Button type="button" variant="ghost" aria-label="關閉上傳說明" onClick={() => onOpenChange(false)}><X aria-hidden="true" /></Button></header>
      <div className="material-guide-downloads">
        <Button asChild className="shrink-0"><a href={templateUrl} download="CE_BOM_交付格式.xlsx"><Download aria-hidden="true" />下載 CE 交付格式</a></Button>
        <Button asChild variant="outline" className="shrink-0"><a href={referenceUrl} download="CE_BOM_填寫參考與範例.xlsx"><Download aria-hidden="true" />下載內部欄位參考</a></Button>
        <p>交給 CE：空白交付格式。內部參考與範例另檔提供。</p>
      </div>
      <div className="material-guide-layout">
        <nav className="material-guide-nav" aria-label="使用說明章節">{chapters.map(item => <button key={item.id} type="button" aria-current={chapter === item.id ? "page" : undefined} onClick={() => setChapter(item.id)}>{item.title}<ChevronRight aria-hidden="true" /></button>)}</nav>
        <label className="material-guide-mobile-nav"><span>說明章節</span><select aria-label="選擇說明章節" value={chapter} onChange={event => setChapter(event.target.value)}>{chapters.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <article ref={content} data-testid="material-guide-content" className="material-guide-content" aria-labelledby="material-guide-chapter-title">
          <h3 id="material-guide-chapter-title">{chapters[index].title}</h3>
          {chapter === "start" && <>
            <p className="material-guide-lead">先交付正確格式，再匯入與追蹤。公司正式料號與核准流程仍由原系統維護。</p>
            <ol className="material-guide-steps">
              <li><strong>交給 CE 填寫</strong><p>下載上方空白交付格式。CE 自行整理來源資料、查核與填寫，RD 不必先替 CE 重整 BOM。</p></li>
              <li><strong>收到 CE 檔案後匯入</strong><p>按「上傳 BOM」，在確認視窗選擇專案、新系列或既有系列的新版本，核對資料後匯入。</p></li>
              <li><strong>找料與維護申請進度</strong><p>用搜尋、欄位條件或「我的標記」找料。開啟料件可編輯資料、SPEC 與狀態追蹤；共用 Note 可直接輸入。</p></li>
              <li><strong>記錄圖面與改版</strong><p>「頁數進度」記錄逐頁狀態、標題與備註；「線路修改」保留改動前後圖、逐項 Review 與 Change List。</p></li>
            </ol>
            <aside className="material-guide-note"><strong>先分清楚三件事</strong><p>料號資料是否齊備、公司來源狀態、人工申請進度各有用途，不會互相取代。網站顯示或 AI 整理結果，也不等於公司核准。</p></aside>
          </>}
          {chapter === "ce" && <>
            <p className="material-guide-lead">交付維持 {MATERIAL_CE_FIELDS.length} 欄。主下載檔是單一空白資料工作表，範例與網站說明不混入交付資料。</p>
            <p className="material-guide-note"><strong>第 {MATERIAL_CE_HEADER_ROW} 列：固定表頭　／　第 {MATERIAL_CE_MEANING_ROW} 列：中文意思　／　第 {MATERIAL_CE_DATA_START_ROW} 列起：料件資料</strong></p>
            <p>{MATERIAL_HANDOFF_RULES[2]}</p>
            <h4>15 欄填寫規格</h4>
            <p>欄名、中文意思與填寫規則共用網站的交付定義。手機可逐欄展開查看。</p>
            <div className="material-guide-fields-desktop" data-testid="material-guide-fields-scroll" role="region" aria-label="CE 交付欄位責任表，可左右捲動" tabIndex={0}>
              <table><thead><tr>{["Excel 固定欄位", `第 ${MATERIAL_CE_MEANING_ROW} 列中文意思`, "填寫／帶出窗口", "填寫規則", "網站位置"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{MATERIAL_CE_FIELDS.map(field => <tr key={field.header}><th scope="row">{field.header}</th><td>{field.meaning}</td><td>{field.owner}</td><td>{field.requirement}</td><td>{field.destination}</td></tr>)}</tbody></table>
            </div>
            <div className="material-guide-fields-mobile">{MATERIAL_CE_FIELDS.map(field => <details key={field.header}><summary><strong>{field.header}</strong><span>{field.meaning}</span></summary><dl><dt>填寫／帶出窗口</dt><dd>{field.owner}</dd><dt>填寫規則</dt><dd>{field.requirement}</dd><dt>網站位置</dt><dd>{field.destination}</dd></dl></details>)}</div>
            <h4>交回前確認</h4><ul><li>每列只填一個廠商的一個 MPN 與實體料號；同一虛擬料下的實體料分列，保留完整 Ref Des 與原用量。</li><li>保留前導零；沒有實體料號時留白，不以虛擬料號或 MPN 代填。</li><li>{MATERIAL_HANDOFF_RULES[1]}</li><li>{MATERIAL_HANDOFF_RULES[5]}</li><li>只保留要匯入的資料工作表，第 {MATERIAL_CE_MEANING_ROW} 列中文說明不可當成料件。</li></ul>
            <p className="material-guide-note">{MATERIAL_HANDOFF_RULES[4]}</p>
          </>}
          {chapter === "versions" && <>
            <p className="material-guide-lead">每次上傳都保存為獨立版本。先選對專案與系列，再確認這次是新板子還是同一塊板的新版。</p>
            <ol className="material-guide-steps"><li><strong>選檔與指定歸屬</strong><p>按「上傳 BOM」，選擇 Excel。在確認視窗指定專案，並選「建立新 BOM 系列」或「作為既有系列的新版本」。同一塊板再上傳即成為新版本。</p></li><li><strong>核對匯入結果</strong><p>檢查位號、用量、MPN、虛擬／實體料號、Schematic_Part、phase out 與零件狀態，並確認主料與替代廠商關係。</p></li><li><strong>到 BOM 管理查版本</strong><p>左側依專案找系列，右側看版本、上傳時間、追蹤帶入及原檔。可檢視、比對版本、下載原檔或匯出差異 Excel；原檔下載依該版是否有保存原檔而定。</p></li></ol>
            <aside className="material-guide-note"><strong>目前版本與歷史版本</strong><p>料件與追蹤在目前版本維護；歷史版本唯讀，可檢視與比對。上傳新版會依位號與料號帶入既有追蹤，請在差異檢視核對「追蹤未帶入」項目。</p></aside>
            <h4>舊檔仍可匯入</h4><p>Virtual PN／TX 讀為虛擬料號；Part Number／PEGA P/N 讀為實體料號。第二 MPN、Ref_tmp、LV、CIS/Remark 不再要求 CE 填寫，舊資料與來源原值仍保留相容。</p>
          </>}
          {chapter === "find" && <>
            <p className="material-guide-lead">先確認目前 BOM，再找料。位號合併與主料優先順序只改變畫面呈現，原始 BOM 紀錄仍保留。</p>
            <h4>搜尋與欄位篩選</h4><ul><li>關鍵字可找料名、MPN、廠商與料號，也能命中替代廠商，並保留原主料上下文。</li><li>欄位篩選依顯示主料判斷；主料符合後，再查看其相關替代料。</li><li>作用中的條件會顯示在篩選標籤，可個別移除或按「全部清除」。清除條件不會換掉專案或 BOM。</li></ul>
            <h4>相同主料與替代料</h4><p>相同主料可合併顯示，展開查看來源位置。各位置的用量、專案與替代料關係保留，不會刪除或合併資料庫原始紀錄。</p>
            <p>風險／ODM 不建議用料置後；其餘依「有虛擬料號 → 有實體料號且有有效 PCB_Footprint → 只有實體料號 → 未編料」排列。同排名保留原主料。這是顯示順序，不代表工程或 AVL 核准。</p>
            <h4>我的標記、欄位與匯出</h4><ul><li>點星號標記料件，再按「我的標記」篩出；標記只屬於目前帳號／工作區，其他帳號看不到。</li><li>按「欄位」選擇要看的內容，例如虛擬料號、實體料號與狀態。</li><li>「匯出顯示欄位」依目前欄位與篩選範圍匯出全部符合的廠商明細，不只匯出畫面當頁。</li></ul>
          </>}
          {chapter === "tracking" && <>
            <p className="material-guide-lead">「料號待補」是料號資料條件；人工申請進度請看「狀態追蹤」。有料號、已完成或缺原理圖符號，不應混成同一種狀態。</p>
            <h4>更新本次狀態</h4><p>開啟料件的「狀態追蹤」，記錄本次狀態與說明，再按「儲存資料與追蹤」。負責人可另行指派，更新人預設目前帳號。</p><ul className="material-guide-statuses">{MATERIAL_TRACKING_STATUS_OPTIONS.map(status => <li key={status}>{status}</li>)}</ul>
            <p>「料號申請中」表示全新料號；「SYMBOL申請中」表示已有料號但缺 SYMBOL。「需申請」也是本次狀態選項。網站不會只因 Schematic_Part 有無文字就自動建立這些人工申請進度。</p>
            <h4>共用 Note 自動儲存</h4><p>停打約 0.65 秒、按 Enter 或離開欄位會送出；儲存中仍能繼續輸入。請留意「儲存中／已儲存／失敗」提示，失敗時可重試。</p><p>兩人同時修改同一格時，保留你的草稿並顯示最新內容，可選「採用最新」或「儲存我的草稿」。連線正常時會同步他人的已儲存更新；離線、重新連線或網路較慢時，請留意儲存與連線狀態。</p>
            <h4>待處理料與每週申請進度</h4><ul><li>曾人工申請的料件，即使已取得料號或已完成，仍保留在這張板子的申請過程；一般匯入的齊備料不因此全數算成申請紀錄。</li><li>「含缺料號的替代廠商」會影響納入範圍；每週進度沿用開啟時的勾選狀態。</li><li>按台北時間週一至週日，依有日期的追蹤歷史整理；本週截至統計時間，無日期紀錄不補造舊週。</li><li>料號與負責人是目前資料，不代表還原歷史 BOM 或歷史負責人。週報篩選、彙總與 Excel 使用同一批申請追蹤料，匯出不受畫面分頁限制。</li></ul>
            <aside className="material-guide-note"><strong>共用備註與個人標記不同</strong><p>Note 是共用資料；只有自己要看的待辦，請用「我的標記」。</p></aside>
          </>}
          {chapter === "spec" && <>
            <p className="material-guide-lead">先保存正確料件的 SPEC，再選來源交給 AI。附件能保存的格式，與 AI 能解析的格式是兩件事。</p>
            <h4>上傳與下載 SPEC</h4><ul><li>在料件編輯器的 SPEC 區多選或拖入附件，可一次加入 10 檔以上，每檔上限 50 MB，不需要先壓縮。</li><li>支援 PDF、Office、圖片及 GLB／GLTF／STP／STEP／STL／DWG／DXF 等工程檔案。每份附件可單獨下載原檔，舊版單一附件也保留相容。</li><li>新檔案以追加方式加入。部分失敗時保留成功項目，依失敗檔名重試；完成後按「儲存資料與追蹤」。</li></ul>
            <h4>AI 依照片填表</h4><ol className="material-guide-steps"><li><strong>選擇這個料件的 SPEC</strong><p>只把已選來源交給分析；附件沒有被選取，就不會作為本次填值來源。</p></li><li><strong>加入要填的表格照片</strong><p>可貼上、多選或拖入多張照片，後續加入是追加，可逐張預覽與移除。照片定義表格格式，數據仍來自已選 SPEC。</p></li><li><strong>核對結果與來源</strong><p>依照片順序檢查欄列、數值與來源查核。Excel 逐張分頁，結果不會自動寫回 BOM。</p></li></ol>
            <p className="material-guide-note"><strong>本次 AI 分析容量</strong><br />最多 20 張照片、20 份 SPEC 輸入，合計 18 MB，包含解壓／解析後資料。AI 支援 PDF、PNG／JPG／WEBP、TXT／CSV／TSV／MD、RAR、STP／STEP；其他可保存的工程附件不代表都能直接由 AI 判讀。</p>
          </>}
          {chapter === "pages" && <>
            <p className="material-guide-lead">「頁數進度」用表格記錄每一頁的狀態、目前頁、頁面標題與備註。總頁數上限 500 頁，標題可以手動填寫或用 PDF AI 協助。</p>
            <h4>手動更新頁數進度</h4><p>設定總頁數與目前做到的頁數，再逐頁選「已完成／待處理／已完成但缺料」。批次設定會更新指定範圍的狀態，標題與備註保留。最後按「儲存頁數進度」。手機可在表格內左右捲動。</p>
            <h4>PDF AI 讀取頁面標題</h4><ol className="material-guide-steps"><li><strong>選擇 PDF，先看截圖</strong><p>單份上限 50 MB、500 頁。選檔後顯示實際頁數與標題截圖；實際頁數和系統上限分開顯示。可切頁、直接跳頁與放大核對。</p></li><li><strong>選 AI 服務並辨識</strong><p>按「辨識全部頁面」，全檔每批 8 頁處理。完成後逐頁修正標題；未辨識的內容請參照原圖補填。</p></li><li><strong>先套用，再儲存</strong><p>「套用 N 頁」只帶回頁數進度表單，仍需按「儲存頁數進度」才保存。取消辨識或不完整結果不會改掉已儲存進度。</p></li></ol>
            <aside className="material-guide-note"><strong>原進度會保留</strong><p>辨識只協助填標題，原完成狀態與備註保留；空白辨識不蓋舊標題，較短 PDF 保留後面既有頁面。特殊掃描或沒有可辨識 Title 的圖面，請先檢查截圖與結果。</p></aside>
          </>}
          {chapter === "circuit" && <>
            <p className="material-guide-lead">用「線路修改」取代分散的 Excel、文字與截圖。打開就能直接記錄，每一處改動各一項，方便工程師更新與主管逐項 Review。</p>
            <ol className="material-guide-steps"><li><strong>直接開始記錄</strong><p>打開「線路修改」就是可以填寫的表單：填標題、Ref／Net／頁碼、原因與說明，輸入後自動建立並儲存；下一項按左上的「新增修改」。還沒輸入內容的新修改不會留下紀錄。沒有批次時會自動建立，例如「V1 → V2 線路修改」；要自訂名稱與版次，先按「新增批次」。</p></li><li><strong>貼上修改前後的圖</strong><p>截圖後按 Ctrl+V，圖會加到標示「貼上會加到這裡」的那一格；點另一格切換，或把檔案直接拖到要放的那一格，也可多選上傳。每項最多 200 張、每張 50 MB，加入時會追加，不需壓縮；移除的圖片可立即復原。</p></li><li><strong>標示位置並保存</strong><p>點圖放大，用「位置標記」或「框選」連續標出改動並補上說明，原圖保留；放錯格可在放大視窗改「圖片用途」。停打約 0.8 秒會自動儲存，也可按「儲存修改」；失敗圖片可重試。</p></li><li><strong>逐項送出 Review</strong><p>標題加上修改說明（或修改後圖片）齊全後，按「送出 Review」。有料號申請編輯權限的人皆可「確認」或填寫原因後「退回補充」，退回原因會顯示在該項目最上方。修改已確認內容會保留原紀錄，建立需要重新 Review 的修訂。</p></li><li><strong>查看歷史與匯出</strong><p>「歷史」可回查操作者、時間、意見及舊修訂。「匯出 Change List」匯出目前篩選的全部項目、Review 歷史及標註預覽；要匯出整批，先清除篩選。</p></li></ol>
            <p className="material-guide-note">Excel 圖片是可攜式標註預覽；原圖與舊修訂留在網站，可另行下載原圖。Change List 不等同整個改版批次的原檔離線封存。</p>
          </>}
          {chapter === "roles" && <>
            <p className="material-guide-lead">公司系統、CE、RD 與網站各有分工。整理、顯示與追蹤，不會取代正式的選料及核准權責。</p>
            <dl className="material-guide-roles">{MATERIAL_HANDOFF_ROLES.map(role => <div key={role.role}><dt>{role.role}</dt><dd><p>{role.responsibility}</p><strong>產出：{role.output}</strong></dd></div>)}</dl>
            <p className="material-guide-note">{MATERIAL_HANDOFF_RULES[0]}</p>
            <h4>常見問題</h4><details className="material-guide-faq"><summary>為什麼有實體料號，仍可能顯示未處理？</summary><p>料號是否齊備與人工追蹤是不同資料。請先確認目前 BOM、所選料件與其追蹤歷史，不只用料號是否存在判斷申請進度。</p></details><details className="material-guide-faq"><summary>同一主料的多個位置，合併後資料會不見嗎？</summary><p>合併的是畫面，展開仍可看來源位置；原始 BOM 紀錄、各位置用量與替代料關係保留。</p></details><details className="material-guide-faq"><summary>CE 需要另外填網站的追蹤、單號與 EE 嗎？</summary><p>{MATERIAL_HANDOFF_RULES[3]}</p></details><details className="material-guide-faq"><summary>填了 Schematic_Part，就代表網站驗證過 OrCAD 了嗎？</summary><p>{MATERIAL_HANDOFF_RULES[5]}</p></details>
          </>}
        </article>
      </div>
      <footer className="material-guide-footer"><span>{index + 1} / {chapters.length}</span><div><Button type="button" variant="outline" disabled={index === 0} onClick={() => setChapter(chapters[index - 1].id)}><ChevronLeft aria-hidden="true" />上一節</Button><Button type="button" variant="outline" disabled={index === chapters.length - 1} onClick={() => setChapter(chapters[index + 1].id)}>下一節<ChevronRight aria-hidden="true" /></Button><Button type="button" onClick={() => onOpenChange(false)}>關閉說明</Button></div></footer>
    </DialogContent>
  </Dialog>;
}
