import { useRef, useState, type ReactNode } from "react";
import {
  ArrowDownUp,
  BookOpen,
  ClipboardPaste,
  Download,
  Eye,
  FolderInput,
  FolderPlus,
  FolderUp,
  Keyboard,
  LayoutPanelLeft,
  Link2,
  LockKeyhole,
  MousePointerClick,
  Pencil,
  Scissors,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type FileLibraryManualSection =
  | "layout"
  | "upload"
  | "find"
  | "preview"
  | "select"
  | "organize"
  | "share"
  | "permission"
  | "keys";

const Kbd = ({ children }: { children: ReactNode }) => <kbd className="file-manual-kbd">{children}</kbd>;
const Ui = ({ icon: Icon, children }: { icon?: typeof Upload; children: ReactNode }) => (
  <span className="file-manual-ui">{Icon && <Icon aria-hidden="true" />}{children}</span>
);

const SECTIONS: { id: FileLibraryManualSection; title: string; icon: typeof Upload }[] = [
  { id: "layout", title: "畫面介紹", icon: LayoutPanelLeft },
  { id: "upload", title: "上傳檔案", icon: Upload },
  { id: "find", title: "找檔案、找同事的檔案", icon: Search },
  { id: "preview", title: "預覽與下載", icon: Eye },
  { id: "select", title: "選取多個檔案", icon: MousePointerClick },
  { id: "organize", title: "改名、移動、刪除", icon: FolderInput },
  { id: "share", title: "分享給同事", icon: Link2 },
  { id: "permission", title: "誰可以改哪些檔案", icon: LockKeyhole },
  { id: "keys", title: "快捷鍵", icon: Keyboard },
];

const KEYS: [ReactNode, string][] = [
  [<><Kbd>點一下</Kbd></>, "選取一個項目，右邊預覽"],
  [<><Kbd>Ctrl</Kbd>＋點一下</>, "加選或取消某一個"],
  [<><Kbd>Shift</Kbd>＋點一下</>, "從上一個選到這一個"],
  [<><Kbd>Ctrl</Kbd>＋<Kbd>A</Kbd></>, "全選目前清單"],
  [<><Kbd>Esc</Kbd></>, "取消選取"],
  [<><Kbd>↑</Kbd> <Kbd>↓</Kbd> <Kbd>Home</Kbd> <Kbd>End</Kbd></>, "移動選取；加 Shift 可連續選取"],
  [<><Kbd>Enter</Kbd> 或按兩下</>, "開啟資料夾、預覽檔案、開啟 Excel"],
  [<><Kbd>Backspace</Kbd>、<Kbd>Alt</Kbd>＋<Kbd>←</Kbd></>, "回到上一個位置"],
  [<><Kbd>Alt</Kbd>＋<Kbd>→</Kbd></>, "前進"],
  [<><Kbd>Alt</Kbd>＋<Kbd>↑</Kbd></>, "上一層資料夾"],
  [<><Kbd>F2</Kbd></>, "重新命名"],
  [<><Kbd>Delete</Kbd></>, "刪除（一定會先確認）"],
  [<><Kbd>Ctrl</Kbd>＋<Kbd>X</Kbd>、<Kbd>Ctrl</Kbd>＋<Kbd>V</Kbd></>, "剪下後貼到別的資料夾＝移動"],
  [<><Kbd>Ctrl</Kbd>＋<Kbd>E</Kbd> 或 <Kbd>/</Kbd></>, "跳到搜尋框"],
  [<><Kbd>Alt</Kbd>＋<Kbd>P</Kbd></>, "開關預覽窗格"],
  [<><Kbd>?</Kbd></>, "打開這本手冊的快捷鍵頁"],
  [<>直接打字</>, "跳到名稱開頭相符的項目"],
  [<>右鍵</>, "顯示這個項目能做的所有操作"],
];

function Section({ id, title, icon: Icon, children }: { id: FileLibraryManualSection; title: string; icon: typeof Upload; children: ReactNode }) {
  return (
    <section className="file-manual-section" id={`file-manual-${id}`} data-section={id}>
      <h3><span className="file-manual-section-icon"><Icon aria-hidden="true" /></span>{title}</h3>
      {children}
    </section>
  );
}

/** The 操作手冊 for the 檔案上傳 page: one dialog with a table of contents and short, task-based sections. */
export function FileLibraryManual({
  open,
  onOpenChange,
  initialSection = "layout",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: FileLibraryManualSection;
}) {
  const [active, setActive] = useState<FileLibraryManualSection>(initialSection);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const jump = (id: FileLibraryManualSection, behavior: ScrollBehavior = "smooth") => {
    setActive(id);
    const body = bodyRef.current;
    const target = body?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!target || !body) return;
    // offsetTop (the body is the offset parent) ignores the dialog's opening zoom, unlike client rects.
    const top = id === SECTIONS[0].id ? 0 : target.offsetTop - 8;
    body.scrollTo({ top, behavior });
  };

  // Highlight the section being read while scrolling.
  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const sections = [...body.querySelectorAll<HTMLElement>("[data-section]")];
    // At the very bottom the last (short) section can never reach the top, so it counts as the current one.
    const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 2;
    const current = atBottom ? sections[sections.length - 1] : sections.filter((section) => section.offsetTop - body.scrollTop <= 32).pop() ?? sections[0];
    const id = current?.dataset.section as FileLibraryManualSection | undefined;
    if (id && id !== active) setActive(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="file-manual-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => jump(initialSection, "auto"));
        }}
      >
        <DialogHeader className="file-manual-header">
          <DialogTitle><BookOpen aria-hidden="true" />檔案上傳操作手冊</DialogTitle>
          <DialogDescription>操作方式和 Windows 檔案總管一樣。這裡整理每天會用到的做法，左邊點標題可以直接跳過去。</DialogDescription>
        </DialogHeader>
        <div className="file-manual-layout">
          <nav className="file-manual-toc" aria-label="手冊目錄">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={cn(active === section.id && "is-active")}
                aria-current={active === section.id ? "true" : undefined}
                onClick={() => jump(section.id)}
              >
                <section.icon aria-hidden="true" />{section.title}
              </button>
            ))}
          </nav>
          <div className="file-manual-body" ref={bodyRef} onScroll={onScroll}>
            <Section id="layout" title="畫面介紹" icon={LayoutPanelLeft}>
              <div className="file-manual-map" aria-hidden="true">
                <div className="is-command">① 命令列：上傳、新增資料夾、剪下、貼上、重新命名、移至、下載、刪除…</div>
                <div className="is-address">② 位置與搜尋：← → ↑、目前位置、搜尋、格式</div>
                <div className="is-nav">③ 使用者空間<br />我的空間<br />管理員<br />其他使用者<br />所有檔案</div>
                <div className="is-list">④ 檔案清單<br />點欄位標題可排序</div>
                <div className="is-preview">⑤ 預覽窗格<br />直接看內容</div>
                <div className="is-status">⑥ 狀態列：項目數、已選取幾個、權限</div>
              </div>
              <ol>
                <li><strong>命令列</strong>的按鈕會依你選的項目自動變亮或變灰，灰色代表現在不能用，滑鼠停在上面會說明原因。</li>
                <li><strong>左邊、右邊的邊界可以拖曳</strong>調整寬度，按兩下邊界恢復預設；調好的寬度下次會記住。</li>
                <li>右上角 <Ui icon={LayoutPanelLeft}>預覽窗格</Ui> 可以開關預覽；<Ui icon={ArrowDownUp}>排序</Ui>、<Ui>檢視</Ui> 可以切換排序與「詳細資料／大圖示」。</li>
              </ol>
            </Section>

            <Section id="upload" title="上傳檔案" icon={Upload}>
              <ol>
                <li>先在左邊選擇使用者空間，再從右側清單進入要放檔案的資料夾。</li>
                <li>按 <Ui icon={Upload}>上傳檔案</Ui> 選檔案；整個資料夾就按 <Ui icon={FolderUp}>上傳資料夾</Ui>，裡面的層級會保留。</li>
                <li><strong>更快的做法：</strong>直接把電腦裡的檔案或資料夾<strong>拖進清單</strong>。拖到某個資料夾上會直接傳進那個資料夾，畫面會寫「放開以上傳到「○○」」。</li>
                <li>上傳時右下角會顯示大大的百分比與進度條，可以按取消。</li>
              </ol>
              <p className="file-manual-note">一次最多 20 個檔案，單檔與整批都不能超過 1 GB。失敗的檔案會列在上方，按 <Ui>重試未上傳檔案</Ui> 就會重傳；直接拖資料夾進來不會再跳瀏覽器的確認視窗。</p>
            </Section>

            <Section id="find" title="找檔案、找同事的檔案" icon={Search}>
              <ol>
                <li>左邊只列人名：<Ui>我的空間</Ui>、<Ui>管理員</Ui>、<Ui>其他使用者</Ui>。人很多時在 <Ui>篩選人員…</Ui> 打名字或帳號。點一下就打開那個人的空間，資料夾與檔案顯示在右側清單。</li>
                <li>搜尋框打關鍵字就會即時篩選。旁邊的範圍可以選 <Ui>目前資料夾</Ui>、<Ui>整個空間</Ui> 或 <Ui icon={Users}>所有人的檔案</Ui>。</li>
                <li>搜尋結果會多一欄 <strong>位置</strong>，告訴你檔案在哪個資料夾；點位置或按右鍵 <Ui>開啟檔案位置</Ui>，就會跳到那個資料夾並選好檔案。</li>
                <li>用 <Ui>全部格式</Ui> 只看 PDF、Excel、圖片、3D 圖檔等；點欄位標題（名稱、修改日期、類型、大小）排序，再點一次反過來。</li>
                <li>上方 ← → 可以回到剛剛看過的位置，↑ 回上一層；路徑上的 › 可以直接跳到同一層的其他資料夾。</li>
              </ol>
              <p className="file-manual-note">目前的搜尋、格式條件會以「搜尋：…」「格式：…」標籤顯示在清單上方，點 × 個別清除，或按 <Ui>全部清除</Ui>。</p>
            </Section>

            <Section id="preview" title="預覽與下載" icon={Eye}>
              <ol>
                <li><strong>點一下檔案，右邊就會顯示內容：</strong>PDF、圖片、SVG、Excel（可切換工作表）、文字檔、ZIP 內的檔案清單都能直接看，用 ↑ ↓ 逐一切換。</li>
                <li>預覽上方有 <Ui icon={Download}>下載</Ui>；Excel 可以按 <Ui>直接編輯 Excel</Ui> 在網頁上修改並存回原檔。</li>
                <li>滑過清單的檔案，列尾會出現 <Ui icon={Download}>下載</Ui>，一下就能下載；1 GB 以下的檔案也可以<strong>直接拖到桌面</strong>存檔（Chrome／Edge，一次一個）。超過 64 MB 的檔案第一次拖曳時會先準備，右下角顯示進度，準備好會提示，再拖一次就好。</li>
                <li>選好多個檔案再按 <Ui icon={Download}>下載</Ui>，只會問一次要存到哪個資料夾，所有檔案一起存進去，同名的會自動加 (1)、(2)。</li>
              </ol>
              <p className="file-manual-note">拖到桌面時如果出現「遭到貴機構封鎖」，是公司 Chrome 的下載政策擋下來的，請改按 <Ui icon={Download}>下載</Ui>。一次拖多個檔案或拖資料夾也請用 <Ui icon={Download}>下載</Ui>。</p>
              <p className="file-manual-note">3D、PCB、PowerPoint 等工程檔需要下載後用對應軟體開啟。特別大的試算表或壓縮檔，會先顯示「載入預覽」按鈕，避免拖慢清單。</p>
            </Section>

            <Section id="select" title="選取多個檔案" icon={MousePointerClick}>
              <ol>
                <li><strong>勾左邊的方框</strong>就能一個一個加選，整個方框那一欄都可以點。</li>
                <li>和檔案總管一樣：<Kbd>Ctrl</Kbd>＋點一下加選、<Kbd>Shift</Kbd>＋點一下選一整段、<Kbd>Ctrl</Kbd>＋<Kbd>A</Kbd> 全選、<Kbd>Esc</Kbd> 取消。</li>
                <li>清單標題列的方框可以一次全選或全部取消。</li>
                <li>選好後，命令列右邊和狀態列會顯示「已選取 N 個項目」與總大小，預覽窗格會列出選了哪些。</li>
              </ol>
              <p className="file-manual-note">只點一下「列」本身會改成只選那一個；要加選請點方框或按住 Ctrl。</p>
            </Section>

            <Section id="organize" title="改名、移動、刪除" icon={FolderInput}>
              <ol>
                <li><Ui icon={FolderPlus}>新增資料夾</Ui>：會直接出現「新增資料夾」並讓你輸入名稱，按 Enter 完成。</li>
                <li><Ui icon={Pencil}>重新命名</Ui> 或按 <Kbd>F2</Kbd>：直接在清單上改，副檔名不會被選到，Enter 儲存、Esc 取消。</li>
                <li><strong>移動</strong>有三種：把檔案拖到左邊或清單裡的資料夾、路徑列上；或按 <Ui icon={Scissors}>剪下</Ui>（<Kbd>Ctrl</Kbd>＋<Kbd>X</Kbd>），到目標資料夾按 <Ui icon={ClipboardPaste}>貼上</Ui>（<Kbd>Ctrl</Kbd>＋<Kbd>V</Kbd>）；或按 <Ui icon={FolderInput}>移至</Ui> 選目標資料夾。</li>
                <li>移動和改名後，右上角提示會有 <Ui>復原</Ui> 按鈕，按了就改回去。</li>
                <li><Ui icon={Trash2}>刪除</Ui> 或按 <Kbd>Delete</Kbd>：一定會先跳出確認，列出要刪的項目。<strong>刪除是永久的，無法復原。</strong></li>
              </ol>
              <p className="file-manual-note">移動只能在同一個人的空間裡進行；要給別人，請下載後由對方上傳，或用「複製連結」讓對方直接下載。</p>
            </Section>

            <Section id="share" title="分享給同事" icon={Link2}>
              <ol>
                <li>選一個檔案或資料夾，按 <Ui icon={Link2}>複製連結</Ui>（或右鍵 → 複製連結）。</li>
                <li>把連結貼到訊息或信件。同事登入後打開，會直接到那個位置並選好那個檔案。</li>
                <li>重新整理頁面也會停在原本的位置，不用重新找。</li>
              </ol>
            </Section>

            <Section id="permission" title="誰可以改哪些檔案" icon={LockKeyhole}>
              <ul>
                <li><strong>我的空間：</strong>你可以上傳、改名、移動、刪除。</li>
                <li><strong>別人的空間：</strong>大家都能瀏覽、預覽、下載；只有本人與管理員能修改。唯讀時按鈕會變灰，狀態列會寫「唯讀：可以瀏覽與下載，不能修改」。</li>
                <li><strong>所有檔案（所有人）：</strong>依擁有者分組列出每個人的檔案，並標示擁有者與位置；在這裡上傳的檔案會放進你自己的空間。</li>
              </ul>
            </Section>

            <Section id="keys" title="快捷鍵" icon={Keyboard}>
              <dl className="file-manual-keys">
                {KEYS.map(([keys, description], index) => <div key={index}><dt>{keys}</dt><dd>{description}</dd></div>)}
              </dl>
            </Section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
