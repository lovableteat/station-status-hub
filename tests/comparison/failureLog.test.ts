import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildFailureLog, cleanLogText, clipLogText, csvRows, engineTextRows, ERP_HEAD, explainFailure, FAILURE_DESCRIPTION_LIMIT, FAILURE_LOG_PREFIX, FAILURE_TITLE_LIMIT, filesNamedIn, findErpHeader, findOrcadHeader, isFailureLogTitle, ORCAD_HEAD, previewInputFile, previewSheetRows, settlePreviews, shouldRecordFailure, summarizeEngineError, tailLogText } from "../../src/components/comparison/failureLog.ts";
import { FAILURE_KEEP_MS, FAILURE_QUEUE_LIMIT, FAILURE_SEND_TRIES, failureQueueKey, flushFailureQueue, isConnectionProblem, isContentRefusal, queueFailureRecord, readFailureQueue, sendFailureRecord, type FailureLogSink, type FailureRecord } from "../../src/components/comparison/failureLogStore.ts";
import { filterFeedbackReports } from "../../src/components/comparison/feedback/core.ts";
import type { FeedbackDraft, FeedbackReport } from "../../src/components/comparison/feedback/types.ts";

// Characters that must not sit in a source file as themselves.
const MARK = String.fromCharCode(0xFEFF), NUL = String.fromCharCode(0), BELL = String.fromCharCode(7), ESC = String.fromCharCode(27), HALF = String.fromCharCode(0xD800), REPLACEMENT = String.fromCharCode(0xFFFD);

// The shape of the message a user pasted on 2026-11-19, as the browser engine reports it (file name replaced).
const TRACEBACK = `Traceback (most recent call last):
  File "/lib/python313.zip/_pyodide/_base.py", line 597, in eval_code_async
    await CodeRunner(
    ...<9 lines>...
    .run_async(globals, locals)
  File "/lib/python313.zip/_pyodide/_base.py", line 411, in run_async
    coroutine = eval(self.code, globals, locals)
  File "<exec>", line 1, in <module>
  File "<exec>", line 456, in autocheck_dispatch
  File "<exec>", line 337, in _run
  File "/engine/autocheck/pipeline.py", line 76, in run
    a, wa = build_design(a_label, a_files, cfg)
            ~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^
  File "/engine/autocheck/loader.py", line 180, in build_design
    load_bom(d, files["bom"])
    ~~~~~~~~^^^^^^^^^^^^^^^^^
  File "/engine/autocheck/parsers/bom_erp.py", line 214, in load_bom
    items, problems = parse_bom(path)
                      ~~~~~~~~~^^^^^^
  File "/engine/autocheck/parsers/bom_erp.py", line 172, in parse_bom
    raise ValueError(f"BOM header not recognised in {path.name} (ERP / Agile / NVIDIA / OrCAD)")
ValueError: BOM header not recognised in QA_BOARD_20261019.BOM (ERP / Agile / NVIDIA / OrCAD)
`;
const REASON = "ValueError: BOM header not recognised in QA_BOARD_20261019.BOM (ERP / Agile / NVIDIA / OrCAD)";
const crash = (reason: string) => `Traceback (most recent call last):\n  File "/engine/autocheck/x.py", line 3, in f\n    work()\n${reason}`;
const utf8 = (text: string) => new TextEncoder().encode(text);
const utf16le = (text: string) => { const bytes = new Uint8Array(2 + text.length * 2); bytes[0] = 0xFF; bytes[1] = 0xFE; for (let index = 0; index < text.length; index++) { const code = text.charCodeAt(index); bytes[2 + index * 2] = code & 255; bytes[3 + index * 2] = code >> 8; } return bytes; };
const note = (name = "QA_BOARD_20261019.BOM", size = 100, side = "A") => ({ side, path: name, size });
const ORCAD = ["Cover Page  Revised: Monday, October 19, 2026", "QA BOARD          Revision: 1.0", "", "Bill Of Materials         October 19,2026      10:22:33\tPage1", "", "Item\tQuantity\tReference\tPart", "______________________________________________", "", "1\t2\tC1,C2\t0.1UF/16V", "2\t1\tR1\t10KOhm"].join("\r\n");
const said = (bytes: Uint8Array, name: string, bom = true) => previewInputFile(bytes, note(name), bom).notes.join("");

test("the engine's traceback is reduced to its reason and the engine positions", () => {
  const summary = summarizeEngineError(TRACEBACK);
  assert.equal(summary.traceback, true);
  assert.equal(summary.reason, REASON);
  assert.equal(summary.kind, "ValueError");
  assert.deepEqual(summary.frames, ["parsers/bom_erp.py:172 parse_bom", "parsers/bom_erp.py:214 load_bom", "loader.py:180 build_design", "pipeline.py:76 run"]);
  // A message that is not a traceback is kept whole.
  assert.deepEqual(summarizeEngineError("A 缺少必要 netlist：pstxnet.dat"), { reason: "A 缺少必要 netlist：pstxnet.dat", kind: "", frames: [], traceback: false });
  // The last exception of a chained traceback is the one that was raised; a message over several lines is kept.
  const chained = `Traceback (most recent call last):\n  File "/engine/autocheck/a.py", line 1, in f\n    x()\nKeyError: 'k'\n\nDuring handling of the above exception, another exception occurred:\n\nTraceback (most recent call last):\n  File "/engine/autocheck/b.py", line 9, in g\n    y()\nRuntimeError: first line\nsecond line`;
  assert.equal(summarizeEngineError(chained).reason, "RuntimeError: first line\nsecond line");
  assert.equal(summarizeEngineError("").reason, "沒有錯誤訊息");
});

test("a failure is explained in words, and the explanation claims nothing the message does not say", () => {
  const bom = explainFailure(summarizeEngineError(TRACEBACK));
  assert.equal(bom.headline, "BOM「QA_BOARD_20261019.BOM」讀不出表頭");
  assert.match(bom.detail, /ERP.*Agile.*NVIDIA.*OrCAD/);
  assert.match(bom.steps.join(""), /至少三個引擎認得的欄名/);
  assert.equal(explainFailure(summarizeEngineError("ValueError: BOM column for 'ref' not found; have ['主件料號', '品名']")).headline, "BOM 少了「位號（插件位置／Reference）」這一欄");
  assert.equal(explainFailure(summarizeEngineError("無法載入比對引擎，請檢查網路後重試")).headline, "比對引擎沒有載入成功");
  assert.equal(explainFailure(summarizeEngineError("執行超過 10 分鐘，已停止；請縮小輸入或重新執行")).headline, "比對跑超過 10 分鐘，已經停止");
  assert.equal(explainFailure(summarizeEngineError("A 缺少必要 netlist：pstxnet.dat")).headline, "A 缺少必要 netlist：pstxnet.dat");

  // The comparison server not answering is not the browser engine failing to download.
  const unreachable = "無法連線到比對伺服器 autocheck.local:8000（TypeError: Failed to fetch）；確認伺服器已啟動、位址正確，且允許這個網站存取";
  const server = explainFailure(summarizeEngineError(unreachable));
  assert.equal(server.headline, "連不到比對伺服器");
  assert.equal(server.detail, unreachable, "the message with the address is shown");
  assert.doesNotMatch(server.steps.join(""), /jsdelivr|PyPI/);

  // A long message is not cut off: the whole of it is the detail.
  const long = `結果已產生，但本機儲存失敗；請立即匯出備份。${"儲存空間不足".repeat(30)}`;
  const kept = explainFailure(summarizeEngineError(long));
  assert.ok(kept.headline.endsWith("…") && kept.headline.length <= 100);
  assert.equal(kept.detail, long);

  // The page's own bridge raises messages for the user in Chinese: they speak for themselves.
  const fixable = explainFailure(summarizeEngineError(crash("ValueError: i2c 設定必須是欄位對照")));
  assert.deepEqual(fixable, { headline: "i2c 設定必須是欄位對照", detail: "", steps: [] });

  // Only the bridge's ValueError speaks to the user; another error that quotes a Chinese name is an engine failure.
  assert.equal(explainFailure(summarizeEngineError(crash("KeyError: '品名'"))).headline, "比對引擎執行時出錯");
  // csv.reader names no file: what its messages usually mean, hedged.
  const csvError = explainFailure(summarizeEngineError(`Traceback (most recent call last):\n  File "/engine/autocheck/parsers/bom_erp.py", line 123, in _flat_rows\n    return [r for r in csv.reader(io.StringIO(read_text(path)))]\n_csv.Error: new-line character seen in unquoted field - do you need to open the file with newline=''?`));
  assert.equal(csvError.headline, "CSV 檔讀不出來");
  assert.match(csvError.detail, /常見的原因是檔案存成 UTF-16/);
  const unknown = explainFailure(summarizeEngineError(crash("ZeroDivisionError: division by zero")));
  assert.equal(unknown.headline, "比對引擎執行時出錯");
  assert.match(unknown.detail, /ZeroDivisionError: division by zero/);
  assert.doesNotMatch(unknown.steps.join(""), /不是操作錯誤|管理員會/, "the page cannot know whose doing it is, nor whether the record was sent");
});

test("a stopped job and an empty message are not failures; the title prefix marks an automatic record", () => {
  assert.equal(shouldRecordFailure("已取消執行"), false);
  assert.equal(shouldRecordFailure("  "), false);
  assert.equal(shouldRecordFailure("執行超過 10 分鐘，已停止；請縮小輸入或重新執行"), true);
  assert.equal(isFailureLogTitle(`${FAILURE_LOG_PREFIX}比對：x`), true);
  assert.equal(isFailureLogTitle("BOM 差異沒有顯示"), false);
});

test("the header rules are the engine's own: same column names, same split, same readers", async () => {
  const orcad = await readFile(new URL("../../public/comparison/engine/autocheck/parsers/bom_orcad.py", import.meta.url), "utf8");
  const block = orcad.slice(orcad.indexOf("HEAD = {"), orcad.indexOf("\n}\n", orcad.indexOf("HEAD = {")));
  const engine = Object.fromEntries([...block.matchAll(/"(\w+)":\s*\[([^\]]*)\]/g)].map(match => [match[1], [...match[2].matchAll(/"([^"]*)"/g)].map(name => name[1])]));
  assert.deepEqual(JSON.parse(JSON.stringify(ORCAD_HEAD)), engine, "ORCAD_HEAD must follow bom_orcad.HEAD after an engine update");
  assert.match(orcad, /def find_header\(rows: list\[list\[str\]\], scan: int = 60\)/);
  assert.match(orcad, /"ref" in cols and \(\{"value", "pn", "mpn"\} & cols\.keys\(\)\) and len\(cols\) >= 3/);
  assert.ok(orcad.includes('return [re.split(r"\\s{2,}", ln.strip()) for ln in lines]'), "a report without a tab is split on two or more spaces");

  const erp = await readFile(new URL("../../public/comparison/engine/autocheck/parsers/bom_erp.py", import.meta.url), "utf8");
  const cols = erp.slice(erp.indexOf("COLS = {"), erp.indexOf("\n}\n", erp.indexOf("COLS = {")));
  const company = Object.fromEntries([...cols.matchAll(/"(\w+)":\s*\[([^\]]*)\]/g)].map(match => [match[1], [...match[2].matchAll(/"([^"]*)"/g)].map(name => name[1])]));
  assert.deepEqual(JSON.parse(JSON.stringify(ERP_HEAD)), company, "ERP_HEAD must follow bom_erp.COLS after an engine update");
  assert.ok(erp.includes("for i in range(min(30, len(df))):"));
  assert.ok(erp.includes('return tuple(_col(df, k) for k in ("pn", "desc", "spec", "qty", "ref"))'), "all five ERP columns are required");
  // The reader is picked by the extension; the 判斷 sentences rely on exactly these branches.
  assert.ok(erp.includes('if suf in (".bom", ".txt"):') && erp.includes("return bom_orcad.text_rows(read_text(path))"));
  assert.ok(erp.includes('elif suf == ".csv":') && erp.includes("return [r for r in csv.reader(io.StringIO(read_text(path)))]"));
  assert.ok(erp.includes('if path.suffix.lower() not in (".xls", ".xlsx"):'));
  const reader = await readFile(new URL("../../public/comparison/engine/autocheck/parsers/__init__.py", import.meta.url), "utf8");
  assert.ok(reader.includes('for enc in ("utf-8", "cp950", "latin-1"):'), 'no UTF-16, and "utf-8" keeps the BOM mark');

  assert.deepEqual(engineTextRows(["a\tb", "c  d"]), [["a", "b"], ["c  d"]]);
  assert.deepEqual(engineTextRows(["a   b", " c  d "]), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(csvRows('a,"b,1",c\r\n"x ""y""",,z\n'), [["a", "b,1", "c"], ['x "y"', "", "z"]]);
  assert.equal(findOrcadHeader([["Item", "Quantity", "Reference", "Part"]])?.index, 0);
  assert.equal(findOrcadHeader([["Reference", "Part"]]), null, "two known columns are not enough");
  assert.equal(findOrcadHeader([["Item", "Qty", "Location"]]), null, "nothing names the part");
  assert.equal(findOrcadHeader([["Ref_Des", "Part.Number", "QTY"]])?.index, 0, "case, '_' and '.' do not matter");
  // Python's strip() keeps the BOM mark, so the first column name behind it is not recognised.
  assert.equal(findOrcadHeader([[`${MARK}Reference`, "Value", "Qty"]]), null);
  assert.equal(findOrcadHeader([[`${MARK}Item`, "Quantity", "Reference", "Part"]])?.index, 0, "three other columns still make a header");
  assert.deepEqual(findErpHeader([["x"], ["項次", "主件料號", "品名", "規格", "組成用量", "插件位置"]]), { index: 1, missing: [] });
  assert.deepEqual(findErpHeader([["主件料號", "品名", "插件位置"]]), { index: 0, missing: ["spec", "qty"] });
  assert.equal(findErpHeader([["part number", "reference"]]), null, "the ERP rule is exact");
});

test("a text report (.BOM / .txt): what the engine makes of it", () => {
  const fine = previewInputFile(utf8(ORCAD), note(), true);
  assert.equal(fine.format, "文字檔（UTF-8，Tab 分隔）");
  assert.match(fine.notes.join(""), /照這一頁對引擎規則的比對，第 6 行符合 OrCAD 的表頭（認得：項次、數量、位號、零件值）。這次仍然失敗，原因不在表頭的寫法/);
  assert.equal(fine.headerFound, true);
  assert.equal(fine.lines[0], "  1│Cover Page  Revised: Monday, October 19, 2026");
  assert.ok(fine.lines.includes("  6│Item ⇥ Quantity ⇥ Reference ⇥ Part"), "tabs are made visible and the header line is shown");
  assert.ok(fine.lines.every(line => !/[\r\t]/.test(line)));

  const wide = previewInputFile(utf16le(ORCAD), note(), true);
  assert.equal(wide.format, "文字檔（UTF-16，Tab 分隔）");
  assert.match(wide.notes[0], /UTF-16 編碼。引擎讀文字檔只試 UTF-8、Big5、Latin-1.*請另存成 UTF-8 或 ANSI 再試。/);
  assert.equal(wide.notes[1], "內容本身的表頭在第 6 行，寫法符合引擎的規則。");
  assert.equal(wide.headerFound, false, "the engine cannot read it, whatever the content");
  assert.equal(previewInputFile(utf16le(ORCAD).subarray(2), note(), true).format, "文字檔（UTF-16（沒有檔頭記號），Tab 分隔）");
  assert.match(said(utf16le("hello\r\nworld\r\n"), "x.BOM"), /UTF-16 編碼.*換掉編碼之後還要注意：前 60 行找不到表頭行/);

  assert.match(said(utf8(ORCAD.replace("Item\tQuantity\tReference\tPart", "Item Quantity Reference Part")), "x.BOM"), /第 6 行看起來是表頭，欄位之間看起來是單一空白。引擎用 Tab 切欄位，所以這一行被當成 1 格，對不上表頭。請改成用 Tab 分隔再試。/);
  assert.match(said(utf8("Item,Quantity,Reference,Part\r\n1,2,\"C1,C2\",0.1UF\r\n"), "x.txt"), /第 1 行看起來是表頭，欄位之間看起來是逗號。整份檔案沒有 Tab，引擎改用兩個以上的空白切欄位/);

  // A real header below line 60 is named exactly; a line that only reads like one promises nothing.
  const title = Array.from({ length: 70 }, (_, index) => `title line ${index + 1}`);
  const late = previewInputFile(utf8([...title, "Item\tQuantity\tReference\tPart", "1\t1\tC1\t0.1UF"].join("\n")), note(), true);
  assert.match(late.notes.join(""), /第 71 行符合 OrCAD 的表頭（認得：項次、數量、位號、零件值），但引擎只找前 60 行。請把表頭移到前 60 行內再試。/);
  assert.ok(late.lines.includes(" 71│Item ⇥ Quantity ⇥ Reference ⇥ Part"), "the line the note talks about is shown although it is far down");
  assert.ok(late.lines.includes("   …"));
  assert.equal(said(utf8([...title, "Reference list of parts and values"].join("\n")), "x.BOM"), "前 60 行找不到表頭行。引擎需要一欄位號（Reference、RefDes、Designator、Location…）加一欄零件（Part、Value、Part Number、料號、MPN…），而且認得的欄名至少三個。");

  assert.match(said(utf8("Ref Des\tPart Name\tQty\nC1\tCAP\t1\n"), "x.BOM"), /第 1 行看起來是表頭（Ref Des｜Part Name｜Qty），其中引擎認得的欄名只有：位號、數量。引擎需要一欄位號/);
  assert.match(said(utf8("hello\nworld\n"), "x.BOM"), /前 60 行找不到表頭行/);

  // "UTF-8 with BOM": the engine keeps the mark on the first column name.
  const marked = previewInputFile(utf8(`${MARK}Reference\tValue\tQty\nC1\t1uF\t1\n`), note("x.BOM"), true);
  assert.equal(marked.format, "文字檔（UTF-8（有檔頭記號 BOM），Tab 分隔）");
  assert.match(marked.notes.join(""), /開頭有 UTF-8 的檔頭記號.*第 1 行第一欄的欄名對不上；去掉之後第 1 行就符合 OrCAD 的表頭（認得：位號、零件值、數量）。請另存成不帶 BOM 的 UTF-8 或 ANSI 再試。/);
  assert.equal(marked.lines[0], "  1│Reference ⇥ Value ⇥ Qty", "the mark itself is not shown");
  assert.equal(marked.headerFound, false);

  for (const preview of [fine, wide, late, marked]) assert.doesNotMatch(preview.notes.join(""), /就讀得到|就能比對|應該讀得到/, "no promise the page cannot keep");
});

test("the engine picks its reader by the extension, and the 判斷 follows it", () => {
  // .csv is split on commas, not on tabs or spaces.
  const csv = said(utf8("RefDes,Part Name,Qty\nC1,CAP,1\n"), "bom.csv");
  assert.match(csv, /第 1 列看起來是表頭（RefDes｜Part Name｜Qty），其中引擎認得的欄名只有：位號、數量。/);
  assert.doesNotMatch(csv, /Tab|空白切欄位|逗號/);
  assert.match(said(utf8("Designator,Comment,Quantity,Footprint\nC1,1uF,1,0402\n"), "bom.csv"), /第 1 列符合 OrCAD 的表頭（認得：位號、零件值、數量、Footprint）。這次仍然失敗/);
  // Excel's "CSV UTF-8" puts the BOM mark in front: the OrCAD reader keeps it, the ERP reader (pandas) drops it.
  assert.match(said(utf8(`${MARK}Designator,Comment,Quantity,Footprint\nC1,1uF,1,0402\n`), "bom.csv"), /開頭有 UTF-8 的檔頭記號.*第 1 列第一欄的欄名對不上；去掉之後第 1 列就符合 OrCAD 的表頭/);
  assert.match(said(utf8(`${MARK}主件料號,品名,規格,組成用量,插件位置\nP1,CAP,1uF,1,C1\n`), "bom.csv"), /第 1 列符合公司 ERP 的表頭（五個欄位都有）。這次仍然失敗/);
  assert.equal(said(utf8("主件料號,品名,組成用量,插件位置\nP1,CAP,1,C1\n"), "bom.csv"), "第 1 列是公司 ERP 的表頭列，但少了：規格（Spec）。引擎要料號、品名、規格、用量、位號五欄都在才當成 ERP 的 BOM。");

  // Text behind an Excel extension is opened as a workbook and fails, whatever the text says.
  const disguised = previewInputFile(utf8(ORCAD), note("bom.xlsx"), true);
  assert.equal(disguised.spreadsheet, false);
  assert.equal(disguised.headerFound, false);
  assert.match(disguised.notes.join(""), /^副檔名是 \.xlsx，內容卻是純文字，不是 Excel 活頁簿。引擎依副檔名把它當活頁簿開，所以讀不出來。/);
  assert.doesNotMatch(disguised.notes.join(""), /符合/);

  // The container of an old workbook is also that of an OrCAD design: only the extension tells them apart.
  const compound = Uint8Array.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), zip = Uint8Array.from([0x50, 0x4B, 3, 4, 20, 0]);
  assert.equal(previewInputFile(compound, note("bom.xls"), true).spreadsheet, true);
  assert.equal(previewInputFile(zip, note("bom.xlsx"), true).format, "Excel 活頁簿（.xlsx）");
  const design = previewInputFile(compound, note("board.dsn"), false);
  assert.match(design.format, /^OLE 複合檔/);
  assert.equal(design.spreadsheet, false);
  assert.match(said(zip, "bom.BOM"), /^副檔名是 \.bom，內容卻不是文字。引擎依副檔名把它當文字報表讀/);

  const big5 = Uint8Array.from(Buffer.from("a544a5f3aec6b8b909ab7ea65709b357aee609b2d5a6a8a5ceb67109b4a1a5f3a6ecb86d", "hex"));
  const erp = previewInputFile(big5, note("bom.txt"), false);
  assert.equal(erp.format, "文字檔（Big5／ANSI，Tab 分隔）");
  assert.equal(erp.lines[0], "  1│主件料號 ⇥ 品名 ⇥ 規格 ⇥ 組成用量 ⇥ 插件位置");
  assert.deepEqual(erp.notes, [], "a file the engine did not read as a BOM gets no BOM diagnosis");

  assert.equal(previewInputFile(new Uint8Array(0), note(), true).format, "空檔案");
  assert.equal(previewInputFile(utf8("%PDF-1.7\n"), note(), true).notes[0], "這是 PDF，不是 BOM。");
  assert.equal(previewInputFile(Uint8Array.from([1, 0, 0, 2, 0, 0, 0, 9]), note(), true).format, "二進位檔");
  // A .csv as pandas reads it for the ERP header: UTF-8 only, and no row wider than the first.
  const big5Csv = Uint8Array.from(Buffer.from("a544a5f3aec6b8b92cab7ea6572cb357aee62cb2d5a6a8a5ceb6712cb4a1a5f3a6ecb86d0a50312c4341502c31752c312c43310a", "hex"));
  const big5Said = previewInputFile(big5Csv, note("bom.csv"), true);
  assert.match(big5Said.notes.join(""), /^這份 \.csv 是 Big5／ANSI 編碼。引擎讀 \.csv 的公司 ERP 格式時用 UTF-8，中文欄名會讀成亂碼/);
  assert.equal(big5Said.headerFound, false);
  const titled = previewInputFile(utf8("QA BOARD BOM\n主件料號,品名,規格,組成用量,插件位置\nP1,CAP,1uF,1,C1\n"), note("bom.csv"), true);
  assert.match(titled.notes.join(""), /^第 1 列只有 1 格，第 2 列有 5 格。引擎讀 \.csv 的公司 ERP 格式時以第 1 列的格數為準/);
  assert.equal(titled.notes.length, 1, "no OrCAD sentence about the same row");
  assert.ok(titled.lines.includes("  2│主件料號,品名,規格,組成用量,插件位置"));
  assert.equal(titled.headerFound, false);
  assert.match(said(utf8("Item\tQuantity\tReference\tPart\n1\t1\tC1\t1uF\n"), "bom.csv"), /欄位之間是 Tab，不是逗號。引擎讀 \.csv 只用逗號切欄位/);
  // The company ERP header below row 30 is named for what it is.
  const farDown = [...Array.from({ length: 34 }, (_, index) => `note ${index + 1},,,,,`), "項次,主件料號,品名,規格,組成用量,插件位置", "1,P1,CAP,1uF,1,C1"].join("\n");
  assert.match(said(utf8(farDown), "bom.csv"), /第 35 列是公司 ERP 的表頭列，但引擎只在前 30 列找公司 ERP 的表頭。/);
  // HTML saved under .BOM, and a sample that is not the whole file.
  assert.match(said(utf8("<html><body><table><tr><td>主件料號</td></tr></table>"), "bom.BOM"), /^這份檔案的內容是 HTML 表格（網頁格式），副檔名卻是 \.bom。/);
  const big = utf8(`${"filler text line without tabs here\n".repeat(2400)}`);
  assert.ok(big.length > 64 * 1024);
  assert.doesNotMatch(said(big, "x.BOM"), /整份檔案沒有 Tab/, "only the start was read");
  const html = previewInputFile(utf8("<html><body><table><tr><td>主件料號</td></tr></table>"), note("bom.xls"), true);
  assert.match(html.format, /^HTML 表格/);
  assert.match(html.notes[0], /這一頁沒有解開表格，所以不能說是哪一欄對不上/);
});

test("a workbook's first rows get the same checks, and a healthy namesake is not blamed", () => {
  const workbook = previewInputFile(Uint8Array.from([0x50, 0x4B, 3, 4, 20, 0]), note("bom.xlsx"), true);
  assert.deepEqual(workbook.lines, []);
  const sheet = previewSheetRows([["BOM report"], ["Ref Des", "Part Name", "Qty"], ["C1", "CAP", "1"]], workbook, true);
  assert.match(sheet.notes.join(""), /^引擎只讀第一個工作表。.*第 2 列看起來是表頭/);
  assert.equal(sheet.lines[1], "  2│Ref Des ⇥ Part Name ⇥ Qty");
  const complete = previewSheetRows([["項次", "主件料號", "品名", "規格", "組成用量", "插件位置"]], workbook, true);
  assert.match(complete.notes.join(""), /^照這一頁對引擎規則的比對，第 1 列符合公司 ERP 的表頭（五個欄位都有）。這次仍然失敗/);
  assert.equal(complete.headerFound, true);
  assert.match(previewSheetRows([["主件料號", "品名", "插件位置"]], workbook, true).notes.join(""), /第 1 列是公司 ERP 的表頭列，但少了：規格（Spec）、用量（組成用量／Qty）。/);
  const lowSheet = [...Array.from({ length: 31 }, () => [""]), ["項次", "主件料號", "品名", "規格", "組成用量", "插件位置"]];
  assert.match(previewSheetRows(lowSheet, workbook, true).notes.join(""), /第 32 列是公司 ERP 的表頭列，但引擎只在前 30 列找/);

  // The error names a file, not a side.
  const healthy = previewInputFile(utf8(ORCAD), note("x.BOM", 9, "B"), true), broken = previewInputFile(utf16le(ORCAD), note("x.BOM", 9, "A"), true);
  const settled = settlePreviews([broken, healthy]);
  assert.match(settled[0].notes[0], /UTF-16/);
  assert.deepEqual(settled[1].notes, ["這一份的表頭符合引擎的規則；讀不出來的應該是另一份同名的檔案。"]);
  assert.deepEqual(settlePreviews([healthy]), [healthy], "a single file keeps its own finding");
});

test("only files the error names are previewed", () => {
  const files = [{ side: "A", path: "EVT/QA_BOARD_20261019.BOM", size: 1 }, { side: "A", path: "EVT/pstxnet.dat", size: 2 }, { side: "B", path: "DVT/qa_board_20261019.bom", size: 3 }, { side: "B", path: "x/a", size: 4 }];
  assert.deepEqual(filesNamedIn(REASON, files).map(file => file.side), ["A", "B"]);
  assert.deepEqual(filesNamedIn("something else", files), []);
});

test("text for the backend has no control characters and is never cut inside a character", () => {
  assert.equal(cleanLogText(`a${NUL}b\r\nc\td${ESC}e${HALF}f`), `a·b\nc\td·e${REPLACEMENT}f`);
  assert.equal(clipLogText("abcdef", 4), "abc…");
  assert.equal(clipLogText("ab😀cd", 4), "ab…", "half of an emoji is not kept");
  assert.equal(tailLogText("ab😀cd", 4), "…cd");
  assert.equal(tailLogText("abc", 9), "abc");
});

const input = (overrides: Partial<Parameters<typeof buildFailureLog>[0]> = {}) => ({
  job: "比對", message: TRACEBACK, at: new Date("2026-11-19T13:05:09Z"), engine: "這台電腦的瀏覽器", projectName: "QA BOARD", labels: "A=EVT → B=DVT",
  files: [{ side: "A", path: "QA_BOARD_20261019.BOM", size: 34000 }, { side: "A", path: "pstxnet.dat", size: 1200000 }, { side: "B", path: "pstxnet.dat", size: 1300000 }],
  previews: [previewInputFile(utf16le(ORCAD), note("QA_BOARD_20261019.BOM", 34000), true)], ...overrides,
});

test("the record says what, which files and why, inside what the backend accepts", () => {
  const log = buildFailureLog(input());
  assert.equal(log.title, "【失敗紀錄】比對：BOM「QA_BOARD_20261019.BOM」讀不出表頭");
  const lines = log.description.split("\n");
  assert.equal(lines[0], "自動失敗紀錄｜比對｜2026/11/19 21:05:09（台北時間）");
  assert.equal(lines[1], "原因：BOM「QA_BOARD_20261019.BOM」讀不出表頭");
  assert.equal(lines[2], `引擎訊息：${REASON}`);
  assert.equal(lines[3], "處理位置：這台電腦的瀏覽器");
  assert.equal(lines[4], "比對名稱：QA BOARD｜A=EVT → B=DVT");
  assert.match(log.description, /▍A QA_BOARD_20261019\.BOM｜33\.2 KiB｜文字檔（UTF-16，Tab 分隔）\n判斷：這份檔案是 UTF-16 編碼/);
  assert.match(log.description, /檔案開頭（⇥ 代表 Tab）：\n {2}1│Cover Page/);
  assert.match(log.description, /這次用到的檔案（3 份）：\nA {2}QA_BOARD_20261019\.BOM {2}33\.2 KiB\nA {2}pstxnet\.dat {2}1\.1 MiB/);
  assert.match(log.description, /引擎位置：parsers\/bom_erp\.py:172 parse_bom ← parsers\/bom_erp\.py:214 load_bom ← loader\.py:180 build_design ← pipeline\.py:76 run/);
  assert.match(log.description, /原始訊息（結尾）：\n[\s\S]*ValueError: BOM header not recognised/);
  assert.ok(log.copyText.includes(TRACEBACK.trim()), "複製紀錄 carries the whole message");
  assert.equal(log.raw, TRACEBACK.trim());

  // A message that was reworded keeps its own words in the record; one that is its own headline is not repeated.
  const plain = buildFailureLog(input({ message: "執行超過 10 分鐘，已停止；請縮小輸入或重新執行", previews: [], files: [] }));
  assert.equal(plain.title, "【失敗紀錄】比對：比對跑超過 10 分鐘，已經停止");
  assert.equal(plain.description.split("\n")[2], "原始訊息：執行超過 10 分鐘，已停止；請縮小輸入或重新執行");
  assert.doesNotMatch(plain.description, /原始訊息（結尾）|這次用到的檔案/);
  const own = buildFailureLog(input({ job: "匯入備份", message: "備份格式無效", previews: [], files: [{ side: "備份", path: "old.autocheck.zip", size: 2048 }] }));
  assert.equal(own.description.split("\n")[1], "原因：備份格式無效");
  assert.doesNotMatch(own.description, /引擎訊息|原始訊息/);
  assert.match(own.description, /備份 {2}old\.autocheck\.zip {2}2\.0 KiB/);
});

test("a huge or dirty failure still fits: title 120, description 4000, no control characters", () => {
  const frames = Array.from({ length: 400 }, (_, index) => `  File "/engine/autocheck/deep_${index}.py", line ${index}, in f${index}\n    call_${index}("😀".repeat(40))`).join("\n");
  const message = `Traceback (most recent call last):\n${frames}\nValueError: ${"很長的原因😀".repeat(400)}${NUL}${BELL}`;
  const files = Array.from({ length: 900 }, (_, index) => ({ side: index % 2 ? "B" : "A", path: `folder/子資料夾/${"檔".repeat(60)}_${index}.dat`, size: index * 1000 }));
  const body = Array.from({ length: 300 }, (_, index) => `${index}\t${"😀".repeat(120)}`).join("\n");
  const log = buildFailureLog(input({ job: "單板畫圖", message, files, projectName: "名".repeat(300), previews: [previewInputFile(utf8(body), note("big.BOM", body.length), true), previewInputFile(utf8(body), { side: "B", path: "big.BOM", size: 9 }, true)] }));
  assert.ok(log.title.length <= FAILURE_TITLE_LIMIT && log.title.trim().length >= 1);
  assert.ok(log.description.length <= FAILURE_DESCRIPTION_LIMIT, `description is ${log.description.length}`);
  assert.ok(log.description.length > 3000, "the room is used");
  const listed = log.description.split("\n").filter(line => /^[AB] {2}folder\//.test(line)), rest = /…另有 (\d+) 份/.exec(log.description);
  assert.ok(listed.length >= 3 && rest, "some files are listed and the others are counted");
  assert.equal(listed.length + Number(rest![1]), 900);
  assert.ok(listed.every(line => /_\d+\.dat {2}[\d.]+ (B|KiB|MiB)$/.test(line)), "no file line is cut in the middle");
  assert.match(log.description, /比對名稱：名{119}…｜/);
  assert.match(log.description, /原始訊息（結尾）：/);
  assert.ok(log.copyText.length > log.description.length);

  // A NUL inside a cell of the file (past the part that decides text or binary) is quoted in a 判斷: it must not reach the backend.
  const dirty = `${Array.from({ length: 30 }, (_, index) => `filler line number ${index}`).join("\n")}\nRef Des${NUL}\tPart Name\tQty\nC1\tCAP\t1\n`;
  const quoted = previewInputFile(utf8(dirty), note("dirty.BOM", dirty.length), true);
  assert.ok(quoted.notes.join("").includes(NUL), "the finding quotes the cell as it is");
  const stored = buildFailureLog(input({ previews: [quoted], projectName: `QA${NUL}`, labels: `A=E${ESC}VT` }));
  for (const text of [log.title, log.description, log.copyText, stored.title, stored.description, stored.copyText]) {
    assert.doesNotMatch(text, /[^\P{Cc}\n\t]/u, "no control characters");
    assert.doesNotMatch(text, /\p{Cs}/u, "no half surrogate pair");
  }
  assert.match(stored.description, /比對名稱：QA·｜A=E·VT/);
});

/* ---- sending ---- */

const account = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-11-19T13:05:09Z");
function memory() {
  const map = new Map<string, string>();
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
}
let serial = 0;
const record = (overrides: Partial<FailureRecord> = {}): FailureRecord => {
  const log = buildFailureLog(input());
  return { id: `22222222-2222-4222-8222-${String(++serial).padStart(12, "0")}`, reporterId: account, title: log.title, description: log.description, tab: "compare", projectName: "QA BOARD",
    context: { browser: "QA", width: 1900, height: 900, revisionA: "EVT", revisionB: "DVT" }, at: NOW, tries: 0, ...overrides };
};
/** The checks of comparison_feedback_private.create_draft (migration 20261013113330), so a record the page builds is one the backend takes. */
function backend(fail: (draft: FeedbackDraft, call: number) => string | null = () => null) {
  const rows = new Map<string, FeedbackReport>(); const log: string[] = []; let calls = 0;
  const sink: FailureLogSink = {
    async createDraft(draft) {
      const problem = fail(draft, ++calls); if (problem) throw new Error(problem);
      assert.equal(draft.reporterId, account);
      assert.ok(draft.title.trim().length >= 1 && draft.title.trim().length <= 120);
      assert.ok(draft.description.trim().length >= 1 && draft.description.trim().length <= 4000);
      assert.equal(draft.category, "bug");
      assert.ok(["compare", "review", "power", "i2c", "library"].includes(draft.tab));
      assert.ok(draft.projectName.length <= 120);
      assert.deepEqual(Object.keys(draft.context).filter(key => !["browser", "width", "height", "revisionA", "revisionB"].includes(key)), []);
      assert.ok(JSON.stringify(draft.context).length <= 4096);
      assert.deepEqual(draft.screenshots, []);
      assert.ok(!JSON.stringify(draft).includes(`${String.fromCharCode(92)}u0000`), "Postgres refuses NUL");
      log.push(`create ${draft.id}`);
      const existing = rows.get(draft.id);
      if (existing?.isSubmitted) return existing;
      const row = { ...draft, attachmentOwnerId: draft.reporterId, reporterName: "QA", reporterUsername: "qa", status: "new", adminNote: "", isSubmitted: false, createdAt: "2026-11-19T00:00:00Z", submittedAt: null, updatedAt: "2026-11-19T00:00:00Z" } as FeedbackReport;
      rows.set(draft.id, row); return row;
    },
    async submitDraft(id) { log.push(`submit ${id}`); const row = rows.get(id)!; row.isSubmitted = true; row.submittedAt = row.updatedAt; return row; },
  };
  return { sink, rows, log };
}

test("a record goes in as a submitted 功能問題 report, and sending it twice leaves one report", async () => {
  const { sink, rows, log } = backend(); const item = record();
  await sendFailureRecord(sink, item);
  assert.deepEqual(log, [`create ${item.id}`, `submit ${item.id}`]);
  assert.equal(rows.get(item.id)?.isSubmitted, true);
  await sendFailureRecord(sink, item);
  assert.equal(rows.size, 1);
  assert.equal(log.at(-1), `create ${item.id}`, "an already submitted record is not submitted again");
});

test("records wait on this computer until the backend has them", async () => {
  const store = memory(); const first = record(), second = record();
  assert.equal(queueFailureRecord(store, first), true); queueFailureRecord(store, second); queueFailureRecord(store, first);
  assert.deepEqual(readFailureQueue(store, account).map(item => item.id), [second.id, first.id], "queued once");

  // The backend cannot be reached: nothing is lost, nothing is counted against the records, and nothing more is tried.
  const offline = backend(() => "TypeError: Failed to fetch");
  const waiting = await flushFailureQueue(offline.sink, store, account, NOW);
  assert.deepEqual(waiting, { sent: [], waiting: [second.id, first.id], dropped: [], reasons: { [second.id]: "TypeError: Failed to fetch", [first.id]: "TypeError: Failed to fetch" } });
  assert.deepEqual(readFailureQueue(store, account).map(item => item.tries), [0, 0]);

  const online = backend();
  const done = await flushFailureQueue(online.sink, store, account, NOW);
  assert.deepEqual(done.sent, [second.id, first.id]);
  assert.equal(store.map.has(failureQueueKey(account)), false, "nothing is left on this computer");
  assert.equal(online.rows.size, 2);
});

test("only a refusal of the content is given up; anything that can pass is tried again", async () => {
  // Content the backend refuses: the same answer every time, so three refusals end it. It does not block the next record.
  const store = memory(); const bad = record({ title: "x" }), good = record();
  queueFailureRecord(store, bad); queueFailureRecord(store, good);
  const picky = backend(draft => draft.id === bad.id ? "回報內容格式不正確" : null);
  const first = await flushFailureQueue(picky.sink, store, account, NOW);
  assert.deepEqual(first.sent, [good.id]);
  assert.deepEqual(first.waiting, [bad.id]);
  assert.equal(first.reasons[bad.id], "回報內容格式不正確");
  assert.equal(readFailureQueue(store, account)[0].tries, 1);
  await flushFailureQueue(picky.sink, store, account, NOW);
  const last = await flushFailureQueue(picky.sink, store, account, NOW);
  assert.equal(FAILURE_SEND_TRIES, 3);
  assert.deepEqual(last.dropped, [{ id: bad.id, reason: "回報內容格式不正確" }]);
  assert.deepEqual(readFailureQueue(store, account), []);

  // A lapsed sign-in, a server error, a refreshed schema, the same record sent by another tab: none of these is about
  // the record. It is kept without a count, the records behind it still go out, and it is sent when the answer changes.
  for (const answer of ["需要安全登入與比對系統檢視權限", "permission denied for function create_comparison_feedback_draft", "HTTP 500", "Could not find the function workspace.create_comparison_feedback_draft in the schema cache", "duplicate key value violates unique constraint \"comparison_feedback_pkey\""]) {
    const kept = memory(); const stuck = record(), next = record();
    queueFailureRecord(kept, stuck); queueFailureRecord(kept, next);
    let refuse = true;
    const moody = backend(draft => refuse && draft.id === stuck.id ? answer : null);
    for (let round = 0; round < 5; round++) {
      const result = await flushFailureQueue(moody.sink, kept, account, NOW + round);
      assert.deepEqual(result.dropped, [], answer);
      assert.deepEqual(result.waiting, [stuck.id], answer);
    }
    assert.deepEqual(readFailureQueue(kept, account).map(item => [item.id, item.tries]), [[stuck.id, 0]], answer);
    assert.equal(moody.rows.get(next.id)?.isSubmitted, true, "the record behind it went out");
    refuse = false;
    assert.deepEqual((await flushFailureQueue(moody.sink, kept, account, NOW)).sent, [stuck.id], answer);
  }

  // A lapsed sign-in is not a reason to give up an old record: it waits for the next sign-in.
  const lapsed = memory(); const waiting = record({ at: NOW - FAILURE_KEEP_MS - 1 });
  queueFailureRecord(lapsed, waiting);
  const expired = await flushFailureQueue(backend(() => "JWT expired").sink, lapsed, account, NOW);
  assert.deepEqual([expired.dropped, expired.waiting], [[], [waiting.id]]);

  // Nothing waits forever: after two weeks a record that still cannot be sent is given up. One that can is sent.
  const old = memory(); const stale = record({ at: NOW - FAILURE_KEEP_MS - 1 }), sendable = record({ at: NOW - FAILURE_KEEP_MS - 1 });
  queueFailureRecord(old, stale); queueFailureRecord(old, sendable);
  const closed = backend(draft => draft.id === stale.id ? "HTTP 500" : null);
  const ended = await flushFailureQueue(closed.sink, old, account, NOW);
  assert.deepEqual(ended.dropped, [{ id: stale.id, reason: "HTTP 500" }]);
  assert.deepEqual(ended.sent, [sendable.id]);
  assert.deepEqual(readFailureQueue(old, account), []);
});

test("the waiting list is bounded, belongs to one account and survives broken storage", async () => {
  const store = memory();
  for (let index = 0; index < FAILURE_QUEUE_LIMIT + 5; index++) queueFailureRecord(store, record());
  assert.equal(readFailureQueue(store, account).length, FAILURE_QUEUE_LIMIT, "the oldest are dropped");
  store.map.set(failureQueueKey(account), JSON.stringify([{ id: "nope" }, record({ reporterId: "33333333-3333-4333-8333-333333333333" }), record()]));
  assert.equal(readFailureQueue(store, account).length, 1, "records of another account or a broken shape are ignored");
  store.map.set(failureQueueKey(account), "{broken");
  assert.deepEqual(readFailureQueue(store, account), []);
  const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => undefined };
  assert.equal(queueFailureRecord(full, record()), false, "the page then sends it without a retry copy");

  // A record added while a flush is under way is not thrown away by that flush.
  const live = memory(); const early = record(), lateRecord = record(); queueFailureRecord(live, early);
  const slow = backend(); const create = slow.sink.createDraft;
  slow.sink.createDraft = async draft => { queueFailureRecord(live, lateRecord); return create(draft); };
  assert.deepEqual((await flushFailureQueue(slow.sink, live, account, NOW)).sent, [early.id]);
  assert.deepEqual(readFailureQueue(live, account).map(item => item.id), [lateRecord.id]);
});

test("unreachable, refused for its content, or neither", () => {
  for (const message of ["TypeError: Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed", "upstream request timeout", "502 Bad Gateway"]) {
    assert.equal(isConnectionProblem(message), true, message); assert.equal(isContentRefusal(message), false, message);
  }
  for (const message of ["回報內容格式不正確", "頁面資訊格式不正確", "unsupported Unicode escape sequence", "new row violates check constraint"]) {
    assert.equal(isContentRefusal(message), true, message); assert.equal(isConnectionProblem(message), false, message);
  }
  for (const message of ["需要安全登入與比對系統檢視權限", "JWT expired", "permission denied for table comparison_feedback", "HTTP 500"]) {
    assert.equal(isConnectionProblem(message), false, message); assert.equal(isContentRefusal(message), false, message);
  }
});

test("administrators can list only the automatic records, or only what people wrote", () => {
  const report = (title: string) => ({ id: title, reporterId: account, attachmentOwnerId: account, reporterName: "QA", reporterUsername: "qa", title, description: "d", category: "bug", tab: "compare", projectName: "", context: { browser: "", width: 1, height: 1, revisionA: "", revisionB: "" }, screenshots: [], isSubmitted: true, status: "new", adminNote: "", createdAt: "", submittedAt: "", updatedAt: "" }) as FeedbackReport;
  const auto = report("【失敗紀錄】比對：BOM 讀不出表頭"), manual = report("BOM 差異沒有顯示");
  const filters = { query: "", status: "all", owner: "", category: "all" } as const;
  assert.deepEqual(filterFeedbackReports([auto, manual], { ...filters, source: "failure" }), [auto]);
  assert.deepEqual(filterFeedbackReports([auto, manual], { ...filters, source: "manual" }), [manual]);
  assert.deepEqual(filterFeedbackReports([auto, manual], { ...filters, source: "all" }), [auto, manual]);
});
