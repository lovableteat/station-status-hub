/**
 * 失敗紀錄 of the comparison page: what the page shows and what goes to the backend when a job fails.
 * Pure: no React, no Supabase, no DOM.
 *
 * The record is stored through the 意見收集 store (workspace.comparison_feedback), which administrators already read;
 * an automatic record is told apart by FAILURE_LOG_PREFIX at the start of its title. That store limits a title to 120
 * and a description to 4000 characters and refuses control characters, so everything here is cleaned and clipped.
 *
 * The 判斷 sentences describe what the engine does with a file. They follow the engine's own rules (which reader it
 * picks by file extension, how it splits a line, which column names it knows) and say only what those rules settle;
 * where the page cannot know, the sentence says so instead of promising that a change will make the file readable.
 */

export const FAILURE_LOG_PREFIX = "【失敗紀錄】";
export const FAILURE_TITLE_LIMIT = 120;
export const FAILURE_DESCRIPTION_LIMIT = 4000;
const PREVIEW_BYTES = 64 * 1024, PREVIEW_LINES = 12, LINE_WIDTH = 150, HEADER_SCAN = 60, ERP_HEADER_SCAN = 30;
/** U+FEFF, the mark at the start of a "UTF-8 with BOM" file, and U+FFFD; written by number so no invisible character sits in this file. */
const MARK = String.fromCharCode(0xFEFF), LEADING_MARK = new RegExp(`^${MARK}`), REPLACEMENT = String.fromCharCode(0xFFFD);

/** Text the backend accepts: no control characters (Postgres refuses NUL) and no half of a surrogate pair. */
export function cleanLogText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\p{Cs}/gu, REPLACEMENT).replace(/[^\P{Cc}\n\t]/gu, "·");
}

/** The first `limit` UTF-16 units, never cutting a surrogate pair in half. */
export function clipLogText(text: string, limit: number, mark = "…"): string {
  if (text.length <= limit) return text;
  let end = Math.max(0, limit - mark.length);
  const last = text.charCodeAt(end - 1);
  if (last >= 0xD800 && last <= 0xDBFF) end--;
  return text.slice(0, end) + mark;
}

/** The last `limit` UTF-16 units: the end of a traceback says what went wrong. */
export function tailLogText(text: string, limit: number, mark = "…"): string {
  if (text.length <= limit) return text;
  let start = text.length - Math.max(0, limit - mark.length);
  const first = text.charCodeAt(start);
  if (first >= 0xDC00 && first <= 0xDFFF) start++;
  return mark + text.slice(start);
}

const bytesText = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1048576).toFixed(1)} MiB`;

/** A job the user stopped is not a failure. */
export function shouldRecordFailure(message: string): boolean {
  return message.trim() !== "已取消執行" && Boolean(message.trim());
}

export function isFailureLogTitle(title: string): boolean { return title.startsWith(FAILURE_LOG_PREFIX); }

export interface EngineErrorSummary {
  /** The exception line of a Python traceback, or the whole message when it is not one. */
  reason: string;
  /** Exception class, "" when the message is not a traceback. */
  kind: string;
  /** Engine source positions, innermost first. */
  frames: string[];
  traceback: boolean;
}

export function summarizeEngineError(message: string): EngineErrorSummary {
  const lines = cleanLogText(message).split("\n").map(line => line.trimEnd());
  const traceback = lines.some(line => line.includes("Traceback (most recent call last)"));
  if (!traceback) return { reason: lines.join("\n").trim() || "沒有錯誤訊息", kind: "", frames: [], traceback };
  let lastFrame = -1;
  const frames: string[] = [];
  lines.forEach((line, index) => {
    const frame = /^\s+File "([^"]+)", line (\d+), in (.+)$/.exec(line);
    if (!frame) return;
    lastFrame = index;
    const path = frame[1].replace(/^.*\/engine\/autocheck\//, "");
    if (path !== frame[1]) frames.unshift(`${path}:${frame[2]} ${frame[3]}`);
  });
  // The exception starts at the first line after the last frame that is not indented.
  const start = lines.findIndex((line, index) => index > lastFrame && /^[A-Za-z_][\w.]*(:|$)/.test(line));
  const reason = (start < 0 ? lines.filter(Boolean).at(-1) ?? "" : lines.slice(start).join("\n")).trim();
  return { reason: reason || "沒有錯誤訊息", kind: /^([A-Za-z_][\w.]*)(:|$)/.exec(reason)?.[1] ?? "", frames: frames.slice(0, 5), traceback };
}

export interface FailureExplanation {
  /** One line a user understands. */
  headline: string;
  detail: string;
  steps: string[];
}

const firstLine = (text: string) => text.split("\n").find(line => line.trim())?.trim() ?? "";
/** A message in the user's language, as a headline; the whole message becomes the detail when it does not fit. */
function ownWords(message: string): FailureExplanation {
  const first = firstLine(message), headline = clipLogText(first, 100);
  return { headline, detail: message === first && headline === first ? "" : message, steps: [] };
}

export function explainFailure(summary: EngineErrorSummary): FailureExplanation {
  const { reason } = summary;
  const bomHeader = /BOM header not recognised in (.+?) \(ERP \/ Agile \/ NVIDIA \/ OrCAD\)/.exec(reason) ?? /BOM header row not found in (.+)$/m.exec(reason);
  if (bomHeader) return {
    headline: `BOM「${bomHeader[1].trim()}」讀不出表頭`,
    detail: "比對引擎在這份檔案裡找不到 BOM 的表頭列，所以還沒開始比對就停了。它認得四種 BOM：公司 ERP 匯出（主件料號、品名、規格、組成用量、插件位置）、Agile（Level／Item Number／Ref Des）、NVIDIA，以及 OrCAD 的 Bill of Materials（Reference＋Part／Value／料號）。",
    steps: [
      "先看下面「這份檔案的開頭」和「判斷」：表頭列在不在、欄位怎麼分隔、編碼是什麼。",
      "確認放進 BOM 這一格的是 BOM，不是別的報表。",
      "OrCAD 的 .BOM／.txt：表頭要有 Reference 和 Part（或 Value／Part Number），連同 Item、Quantity 這類欄位至少三個引擎認得的欄名，用 Tab 分隔，存成 ANSI 或 UTF-8。",
    ],
  };
  const bomColumn = /BOM column for '(\w+)' not found; have (.+)$/m.exec(reason);
  if (bomColumn) return {
    headline: `BOM 少了「${ERP_LABEL[bomColumn[1]] ?? bomColumn[1]}」這一欄`,
    detail: `表頭列找到了，但缺一個必要欄位。這份 BOM 的欄位是：${clipLogText(bomColumn[2], 300)}`,
    steps: ["補上這一欄，或改用完整的 ERP／Agile／OrCAD 匯出檔再比對。"],
  };
  // The comparison runs on a server and that server did not answer: not the same as the browser engine failing to load.
  if (/無法連線到比對伺服器/.test(reason)) return {
    headline: "連不到比對伺服器",
    detail: reason,
    steps: ["確認伺服器已啟動、位址正確，而且允許這個網站存取。", "或把處理位置改回「這台電腦的瀏覽器」再比對一次。"],
  };
  if (/無法載入比對引擎|Failed to fetch|NetworkError|Load failed|importScripts|cdn\.jsdelivr|pypi\.org|files\.pythonhosted/i.test(reason)) return {
    headline: "比對引擎沒有載入成功",
    detail: "多半是這台電腦連不到 cdn.jsdelivr.net 或 PyPI（公司網路擋住，或剛好斷線），引擎的程式下載不下來。",
    steps: ["確認網路後重新整理這一頁再試一次。", "在公司一直不行，請管理員確認這兩個網址有沒有被擋，或改用伺服器處理。"],
  };
  if (/執行超過 10 分鐘/.test(reason)) return { headline: "比對跑超過 10 分鐘，已經停止", detail: reason, steps: ["先不放 Datasheet 和選用資料再試一次；還是超過，請管理員看這筆紀錄。"] };
  if (/MemoryError|out of memory|Cannot enlarge memory|allocation failed/i.test(reason)) return {
    headline: "這台電腦的瀏覽器記憶體不夠",
    detail: "檔案太大，瀏覽器裡的比對引擎放不下。",
    steps: ["關掉其他分頁後再試。", "還是不行，請改用伺服器處理，或減少 Datasheet 的數量。"],
  };
  if (!summary.traceback) return ownWords(reason);
  // The page's own engine bridge raises its messages for the user in Chinese (缺少必要 netlist, 設定必須是…): those
  // are something the user can fix, and they say so themselves.
  const message = reason.replace(/^[A-Za-z_][\w.]*:\s*/, "");
  if (/[㐀-鿿]/.test(message)) return ownWords(message);
  return {
    headline: "比對引擎執行時出錯",
    detail: `引擎回報：${clipLogText(firstLine(reason), 300)}`,
    steps: ["引擎遇到它沒有處理到的情況；同樣的檔案再試一次，結果會一樣。", "管理員會從這筆紀錄看到完整的引擎訊息。"],
  };
}

/* ---- What the failed file looks like ---- */

/** Column names of bom_orcad.HEAD, copied for the diagnosis only; a test compares this with the engine file. */
export const ORCAD_HEAD: Record<string, readonly string[]> = {
  item: ["item", "item no", "item #", "#", "no"],
  qty: ["quantity", "qty", "count"],
  ref: ["reference", "references", "ref des", "refdes", "ref designator", "reference designator", "reference designators", "designator", "designators", "part reference", "location"],
  value: ["part", "value", "part value", "comment", "val"],
  pn: ["part number", "partnumber", "pn", "p/n", "part no", "internal pn", "company pn", "pegatron pn", "pegatron part number", "料號", "公司料號", "stock code"],
  mpn: ["manufacturer part number", "manufacturer pn", "mfr part number", "mfr pn", "mfr p/n", "mpn", "vendor part number", "vendor pn"],
  mfr: ["manufacturer", "mfr", "mfr name", "manufacturer name", "vendor"],
  desc: ["description", "desc"],
  fp: ["pcb footprint", "footprint", "package"],
};
/** bom_erp.COLS: a row with a 料號 name and a 位號 name is the header, and then all five columns must be there. */
export const ERP_HEAD: Record<string, readonly string[]> = {
  pn: ["主件料號", "料號", "Part Number", "PN"],
  desc: ["品名", "Description"],
  spec: ["規格", "Spec", "Manufacturer PN"],
  qty: ["組成用量", "Qty", "Quantity"],
  ref: ["插件位置", "Reference", "RefDes", "Designator"],
};
const ERP_LABEL: Record<string, string> = { pn: "料號（主件料號／Part Number）", desc: "品名（Description）", spec: "規格（Spec）", qty: "用量（組成用量／Qty）", ref: "位號（插件位置／Reference）" };
const COLUMN_LABEL: Record<string, string> = { item: "項次", qty: "數量", ref: "位號", value: "零件值", pn: "料號", mpn: "廠商料號", mfr: "廠商", desc: "說明", fp: "Footprint" };
const REF_WORDS = ["reference", "ref des", "refdes", "ref_des", "designator", "插件位置"];
const PART_WORDS = ["part", "value", "comment", "料號", "p/n", "mpn"];

// Python's str.strip() and the regular expression class \s, which differ from JavaScript's: Python keeps U+FEFF
// (the mark at the start of a "UTF-8 with BOM" file), so a column name behind that mark does not match.
const PY_SPACE = "\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_EDGES = new RegExp(`^[${PY_SPACE}]+|[${PY_SPACE}]+$`, "g"), PY_BLANKS = new RegExp(`[${PY_SPACE}_.]+`, "g"), PY_GAP = new RegExp(`[${PY_SPACE}]{2,}`);
const strip = (text: string) => text.replace(PY_EDGES, "");
const cellText = (cell: unknown) => { const text = cell == null ? "" : strip(String(cell)); return text.toLowerCase() === "nan" ? "" : text; };
const normalized = (cell: unknown) => strip(cellText(cell).toLowerCase().replace(PY_BLANKS, " "));

function matchOrcadColumns(cells: readonly unknown[]): Record<string, number> {
  const columns: Record<string, number> = {};
  cells.forEach((cell, index) => {
    const name = normalized(cell);
    for (const [key, names] of Object.entries(ORCAD_HEAD)) if (!(key in columns) && names.includes(name)) { columns[key] = index; break; }
  });
  return columns;
}

/** bom_orcad.find_header: a RefDes column, something that names the part, and at least three known columns. */
export function findOrcadHeader(rows: readonly (readonly unknown[])[], scan = HEADER_SCAN): { index: number; columns: Record<string, number> } | null {
  for (let index = 0; index < Math.min(scan, rows.length); index++) {
    const columns = matchOrcadColumns(rows[index]);
    if ("ref" in columns && ("value" in columns || "pn" in columns || "mpn" in columns) && Object.keys(columns).length >= 3) return { index, columns };
  }
  return null;
}

/** bom_erp._read_table and _erp_cols: the header row (names exactly as written), and which of the five columns it lacks. */
export function findErpHeader(rows: readonly (readonly unknown[])[], scan = ERP_HEADER_SCAN): { index: number; missing: string[] } | null {
  for (let index = 0; index < Math.min(scan, rows.length); index++) {
    const cells = rows[index].map(cell => cell == null ? "" : strip(String(cell)));
    const has = (key: string) => ERP_HEAD[key].some(name => cells.includes(name));
    if (has("pn") && has("ref")) return { index, missing: Object.keys(ERP_HEAD).filter(key => !has(key)) };
  }
  return null;
}

/** bom_orcad.text_rows: split on tabs; a report without any tab is split on runs of two or more spaces. */
export function engineTextRows(lines: readonly string[]): string[][] {
  return lines.some(line => line.includes("\t")) ? lines.map(line => line.split("\t")) : lines.map(line => strip(line).split(PY_GAP));
}

/** Rows the way Python's csv.reader splits them: commas, double quotes, a doubled quote inside quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[index + 1] === '"') { cell += '"'; index++; }
      else quoted = false;
    } else if (char === '"' && !cell) quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export interface InputFileNote { side: string; path: string; size: number }
export interface InputFilePreview extends InputFileNote {
  format: string;
  /** The first lines, numbered, tabs made visible. */
  lines: string[];
  /** What the comparison engine makes of it, in plain words. */
  notes: string[];
  /** A workbook the engine opens as one: the page reads its first rows with a spreadsheet reader and calls previewSheetRows. */
  spreadsheet: boolean;
  /** The page's check found a header the engine's rules accept, so this file is probably not the one that failed. */
  headerFound: boolean;
}

function decodeHead(head: Uint8Array): { text: string | null; encoding: string; utf16: boolean } {
  const wide = (label: string, skip: number, encoding: string) => ({ text: new TextDecoder(label).decode(head.subarray(skip)), encoding, utf16: true });
  if (head[0] === 0xFF && head[1] === 0xFE) return wide("utf-16le", 2, "UTF-16");
  if (head[0] === 0xFE && head[1] === 0xFF) return wide("utf-16be", 2, "UTF-16");
  const sample = head.subarray(0, 512);
  let even = 0, odd = 0;
  sample.forEach((byte, index) => { if (!byte) { if (index % 2) odd++; else even++; } });
  if (odd > sample.length / 4 && even < sample.length / 32) return wide("utf-16le", 0, "UTF-16（沒有檔頭記號）");
  if (even > sample.length / 4 && odd < sample.length / 32) return wide("utf-16be", 0, "UTF-16（沒有檔頭記號）");
  if (even + odd) return { text: null, encoding: "", utf16: false };
  // ignoreBOM keeps U+FEFF in the text, as the engine's read_text does (it decodes with "utf-8", not "utf-8-sig").
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(head, { stream: true });
    return { text, encoding: text.startsWith(MARK) ? "UTF-8（有檔頭記號 BOM）" : "UTF-8", utf16: false };
  } catch { /* Not UTF-8: the engine tries Big5 (cp950) next. */ }
  try { return { text: new TextDecoder("big5", { fatal: true }).decode(head, { stream: true }), encoding: "Big5／ANSI", utf16: false }; }
  catch { return { text: Array.from(head, byte => String.fromCharCode(byte)).join(""), encoding: "Latin-1（不是 UTF-8 也不是 Big5）", utf16: false }; }
}

function numberedLines(lines: readonly string[], focus: number | null): string[] {
  const shown = (index: number) => `${String(index + 1).padStart(3)}│${clipLogText(cleanLogText(lines[index].replace(LEADING_MARK, "")).replace(/\t/g, " ⇥ "), LINE_WIDTH)}`;
  const picked: number[] = [];
  for (let index = 0; index < lines.length && picked.length < PREVIEW_LINES; index++) if (lines[index].trim()) picked.push(index);
  let jump = -1;
  if (focus !== null && focus < lines.length && !picked.includes(focus)) {
    // The line the diagnosis talks about is always shown, with the two after it.
    picked.splice(Math.max(0, PREVIEW_LINES - 3));
    jump = picked.length;
    for (let index = focus; index < Math.min(lines.length, focus + 3); index++) picked.push(index);
  }
  const out: string[] = [];
  picked.forEach((index, position) => { if (position === jump) out.push("   …"); out.push(shown(index)); });
  return out;
}

interface Diagnosis { notes: string[]; focus: number | null; headerFound: boolean }
const recognized = (columns: Record<string, number>) => Object.keys(columns).map(key => COLUMN_LABEL[key] ?? key).join("、");
const NEEDED = "引擎需要一欄位號（Reference、RefDes、Designator、Location…）加一欄零件（Part、Value、Part Number、料號、MPN…），而且認得的欄名至少三個";
const STILL_FAILED = "這次仍然失敗，原因不在表頭的寫法，要請管理員對照引擎訊息再查。";

/**
 * Why the engine finds no header in these rows. `erpRows`: the rows as the engine's table reader gives them when it
 * also tries the company ERP header on this kind of file, else null. `cut`: how the engine splits a line of this
 * file into cells, null when the cells come from a table reader.
 */
function diagnoseRows(rows: readonly (readonly unknown[])[], lineText: (index: number) => string, unit: "行" | "列", erpRows: readonly (readonly unknown[])[] | null, cut: string | null): Diagnosis {
  const notes: string[] = [];
  const company = erpRows ? findErpHeader(erpRows) : null;
  if (company && !company.missing.length) return { notes: [`照這一頁對引擎規則的比對，第 ${company.index + 1} ${unit}符合公司 ERP 的表頭（五個欄位都有）。${STILL_FAILED}`], focus: company.index, headerFound: true };
  if (company) notes.push(`第 ${company.index + 1} ${unit}是公司 ERP 的表頭${unit}，但少了：${company.missing.map(key => ERP_LABEL[key]).join("、")}。引擎要料號、品名、規格、用量、位號五欄都在才當成 ERP 的 BOM。`);
  const orcad = findOrcadHeader(rows);
  if (orcad) return { notes: [`照這一頁對引擎規則的比對，第 ${orcad.index + 1} ${unit}符合 OrCAD 的表頭（認得：${recognized(orcad.columns)}）。${STILL_FAILED}`], focus: orcad.index, headerFound: true };
  // The first line begins with the "UTF-8 with BOM" mark: the engine keeps the mark on the first column name.
  if (rows.length && String(rows[0][0] ?? "").startsWith(MARK)) {
    const bare = findOrcadHeader([[String(rows[0][0]).slice(1), ...rows[0].slice(1)]], 1);
    if (bare) return { notes: [...notes, `這份檔案開頭有 UTF-8 的檔頭記號（BOM；Excel 的「CSV UTF-8」和記事本的「具有 BOM 的 UTF-8」會加）。引擎讀 OrCAD 格式時沒有把它去掉，所以第 1 ${unit}第一欄的欄名對不上；去掉之後第 1 ${unit}就符合 OrCAD 的表頭（認得：${recognized(bare.columns)}）。請另存成不帶 BOM 的 UTF-8 或 ANSI 再試。`], focus: 0, headerFound: false };
  }
  if (company) return { notes, focus: company.index, headerFound: false };
  // A real header that sits too far down: exact, by the engine's own column rule.
  const late = findOrcadHeader(rows, Math.min(rows.length, 400));
  if (late) return { notes: [`第 ${late.index + 1} ${unit}符合 OrCAD 的表頭（認得：${recognized(late.columns)}），但引擎只找前 ${HEADER_SCAN} ${unit}。請把表頭移到前 ${HEADER_SCAN} ${unit}內再試。`], focus: late.index, headerFound: false };
  // Otherwise the first line that reads like a header to a person; what is said about it is what the engine does with it.
  let candidate = -1;
  for (let index = 0; index < Math.min(rows.length, HEADER_SCAN) && candidate < 0; index++) {
    const text = lineText(index).toLowerCase();
    if (text.length <= 400 && REF_WORDS.some(word => text.includes(word)) && PART_WORDS.some(word => text.includes(word))) candidate = index;
  }
  if (candidate < 0) return { notes: [`前 ${HEADER_SCAN} ${unit}找不到表頭${unit}。${NEEDED}。`], focus: null, headerFound: false };
  const place = `第 ${candidate + 1} ${unit}`, cells = rows[candidate].map(cellText).filter(Boolean), columns = matchOrcadColumns(rows[candidate]);
  if (cut && cells.length < 3) {
    const line = lineText(candidate);
    const separator = line.includes(",") ? "逗號" : line.includes(";") ? "分號" : line.includes("|") ? "直線「|」" : "單一空白";
    return { notes: [`${place}看起來是表頭，欄位之間看起來是${separator}。${cut}，所以這一${unit}被當成 ${cells.length} 格，對不上表頭。請改成用 Tab 分隔再試。`], focus: candidate, headerFound: false };
  }
  return { notes: [`${place}看起來是表頭（${clipLogText(cells.join("｜"), 200)}），其中引擎認得的欄名只有：${recognized(columns) || "沒有"}。${NEEDED}。`], focus: candidate, headerFound: false };
}

const extension = (path: string) => /\.[^./\\]+$/.exec(path.split("/").pop() ?? "")?.[0].toLowerCase() ?? "";
const UTF16_NOTE = "這份檔案是 UTF-16 編碼。引擎讀文字檔只試 UTF-8、Big5、Latin-1；UTF-16 讀進去每個字中間都夾著空字元，欄名一定對不上。請另存成 UTF-8 或 ANSI 再試。";

/**
 * What a failed input file is and how it starts. `bom`: the engine tried to read it as a BOM, and the notes say what
 * it does with it. The engine picks its reader by the file extension (bom_erp.parse_bom), so the notes do too:
 * .bom/.txt as a text report, .csv as comma separated, .xls/.xlsx as a workbook (or an HTML table saved as .xls).
 */
export function previewInputFile(bytes: ArrayBuffer | Uint8Array, file: InputFileNote, bom: boolean): InputFilePreview {
  const all = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), head = all.subarray(0, PREVIEW_BYTES);
  const kind = extension(file.path), textReport = kind === ".bom" || kind === ".txt", workbook = kind === ".xls" || kind === ".xlsx";
  const base = { side: file.side, path: file.path, size: file.size, lines: [] as string[], notes: [] as string[], spreadsheet: false, headerFound: false };
  const starts = (...magic: number[]) => magic.every((byte, index) => head[index] === byte);
  if (!all.length) return { ...base, format: "空檔案", notes: ["這份檔案是空的（0 位元組）。"] };
  if (starts(0x25, 0x50, 0x44, 0x46)) return { ...base, format: "PDF", notes: bom ? ["這是 PDF，不是 BOM。"] : [] };
  const zip = starts(0x50, 0x4B, 0x03, 0x04), compound = starts(0xD0, 0xCF, 0x11, 0xE0);
  if (zip || compound) {
    if (workbook) return { ...base, format: zip ? "Excel 活頁簿（.xlsx）" : "舊版 Excel 活頁簿（.xls）", spreadsheet: true };
    // The same container holds an old Excel workbook, an OrCAD design, a Word file…: only the extension says which.
    const format = zip ? "ZIP 容器（.xlsx 也是這種）" : "OLE 複合檔（舊版 Excel、OrCAD .dsn 都是這種）";
    return { ...base, format, notes: bom && (textReport || kind === ".csv") ? [`副檔名是 ${kind}，內容卻不是文字。引擎依副檔名把它當${kind === ".csv" ? "逗號分隔的文字" : "文字報表"}讀，所以讀不出表格。如果它其實是 Excel 活頁簿，請把副檔名改成 .xlsx 或 .xls 再試。`] : [] };
  }
  const { text, encoding, utf16 } = decodeHead(head);
  if (text === null) return { ...base, format: "二進位檔", notes: bom ? ["這份檔案不是文字檔也不是 Excel，引擎讀不出表格。"] : [] };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (all.length > head.length) lines.pop();      // the last line of the sample is cut off
  const html = /^\s*(<!doctype html|<html)/i.test(text) || /<table/i.test(text.slice(0, 4000));
  if (html && !textReport) return { ...base, format: `HTML 表格（${encoding}）`, lines: numberedLines(lines, null), notes: bom ? ["這是存成 HTML 的表格（公司 ERP 匯出的 .xls 是這種）。引擎會讀其中最大的表格，在前 30 列找公司 ERP 的表頭（主件料號、品名、規格、組成用量、插件位置）。這一頁沒有解開表格，所以不能說是哪一欄對不上。"] : [] };
  const tabbed = lines.some(line => line.includes("\t"));
  const format = `文字檔（${encoding}，${tabbed ? "Tab 分隔" : "沒有 Tab"}）`;
  if (!bom) return { ...base, format, lines: numberedLines(lines, null) };

  if (workbook) return { ...base, format, lines: numberedLines(lines, null), notes: [`副檔名是 ${kind}，內容卻是純文字，不是 Excel 活頁簿。引擎依副檔名把它當活頁簿開，所以讀不出來。Tab 分隔的報表請把副檔名改成 .BOM 或 .txt，逗號分隔的請改成 .csv，或用 Excel 另存成真正的 .xlsx 再試。`] };
  if (!textReport && kind !== ".csv") return { ...base, format, lines: numberedLines(lines, null), notes: [`副檔名是 ${kind || "（沒有）"}：引擎把它當 Excel 活頁簿開，內容卻是純文字，所以讀不出來。`] };
  const rows = textReport ? engineTextRows(lines) : csvRows(lines.join("\n"));
  const diagnosis = textReport
    ? diagnoseRows(rows, index => lines[index] ?? "", "行", null, tabbed ? "引擎用 Tab 切欄位" : "整份檔案沒有 Tab，引擎改用兩個以上的空白切欄位")
    // .csv: pandas first (it drops the BOM mark) for the ERP header, then csv.reader over the text as read_text gives
    // it (the mark stays) for the OrCAD header.
    : diagnoseRows(rows, index => lines[index] ?? "", "列", rows.map((row, index) => index ? row : [String(row[0] ?? "").replace(LEADING_MARK, ""), ...row.slice(1)]), null);
  if (!utf16) return { ...base, format, notes: diagnosis.notes, lines: numberedLines(lines, diagnosis.focus), headerFound: diagnosis.headerFound };
  // Read as UTF-16 the content may be fine, but the engine does not read it that way: the encoding is the finding.
  const inside = diagnosis.headerFound ? [`內容本身的表頭在第 ${(diagnosis.focus ?? 0) + 1} ${textReport ? "行" : "列"}，寫法符合引擎的規則。`] : diagnosis.notes.map(note => `換掉編碼之後還要注意：${note}`);
  return { ...base, format, notes: [UTF16_NOTE, ...inside], lines: numberedLines(lines, diagnosis.focus) };
}

/** The first rows of a workbook's first sheet, read by the page; the engine tries Agile, NVIDIA, the ERP header, then OrCAD. */
export function previewSheetRows(rows: readonly (readonly unknown[])[], preview: InputFilePreview, bom: boolean): InputFilePreview {
  const lines = rows.map(row => row.map(cell => cell == null ? "" : String(cell)).join("\t").replace(/\t+$/, ""));
  if (!bom) return { ...preview, lines: numberedLines(lines, null) };
  const diagnosis = diagnoseRows(rows, index => lines[index] ?? "", "列", rows, null);
  const scope = diagnosis.headerFound ? [] : ["引擎只讀第一個工作表。這裡對照的是公司 ERP 與 OrCAD 兩種表頭；Agile 與 NVIDIA 的表頭引擎也試過，同樣沒找到。"];
  return { ...preview, lines: numberedLines(lines, diagnosis.focus), notes: [...scope, ...diagnosis.notes], headerFound: diagnosis.headerFound };
}

/**
 * The error names a file, not a side: when the old and the new version hold a file of that name and only one of them
 * has a header the engine accepts, that one is not the problem.
 */
export function settlePreviews(previews: readonly InputFilePreview[]): InputFilePreview[] {
  const mixed = previews.some(preview => preview.headerFound) && previews.some(preview => !preview.headerFound);
  return previews.map(preview => mixed && preview.headerFound ? { ...preview, notes: ["這一份的表頭符合引擎的規則；讀不出來的應該是另一份同名的檔案。"] } : preview);
}

/** Input files whose name appears in the error, at most two. */
export function filesNamedIn<T extends InputFileNote>(reason: string, files: readonly T[]): T[] {
  const text = reason.toLowerCase();
  return files.filter(file => { const name = file.path.split("/").pop()?.toLowerCase() ?? ""; return name.length > 2 && text.includes(name); }).slice(0, 2);
}

/* ---- The record ---- */

export interface FailureLogInput {
  /** 「比對」「單板畫圖」「下載 Excel 追蹤表」… */
  job: string;
  message: string;
  at: Date;
  /** Where the engine ran, in words. */
  engine: string;
  projectName: string;
  /** 「A=EVT → B=DVT」 */
  labels: string;
  files: readonly InputFileNote[];
  previews: readonly InputFilePreview[];
}
export interface FailureLog {
  job: string;
  title: string;
  /** What is stored in the backend, at most FAILURE_DESCRIPTION_LIMIT. */
  description: string;
  /** The whole record without the limit, for 複製紀錄. */
  copyText: string;
  explanation: FailureExplanation;
  summary: EngineErrorSummary;
  previews: readonly InputFilePreview[];
  /** The message as it arrived, cleaned. */
  raw: string;
}

/** 2026/11/19 21:05:09 in Taipei; put together from the parts, because the separators of a formatted date differ between browsers. */
function taipeiTime(at: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at).map(part => [part.type, part.value]));
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function buildFailureLog(input: FailureLogInput): FailureLog {
  const raw = cleanLogText(input.message).trim(), summary = summarizeEngineError(input.message), explanation = explainFailure(summary);
  const sameAsHeadline = !summary.traceback && summary.reason === explanation.headline;
  const head = (reasonLimit: number) => [
    `自動失敗紀錄｜${input.job}｜${taipeiTime(input.at)}（台北時間）`,
    `原因：${explanation.headline}`,
    ...(sameAsHeadline ? [] : [`${summary.traceback ? "引擎訊息" : "原始訊息"}：${clipLogText(summary.reason, reasonLimit)}`]),
    `處理位置：${input.engine}`,
    `比對名稱：${clipLogText(input.projectName.trim(), 120) || "（未填）"}｜${clipLogText(input.labels, 200)}`,
  ].join("\n");
  const previewText = input.previews.map(preview => [
    `▍${preview.side} ${preview.path}｜${bytesText(preview.size)}｜${preview.format}`,
    ...preview.notes.map(note => `判斷：${note}`),
    ...(preview.lines.length ? ["檔案開頭（⇥ 代表 Tab）：", ...preview.lines] : []),
  ].join("\n")).join("\n\n");
  const fileLines = input.files.map(file => `${file.side}  ${file.path}  ${bytesText(file.size)}`);
  // As many file lines as fit; the rest are counted, so the list never ends in the middle of a name.
  const fileText = (room: number) => {
    if (!fileLines.length) return "";
    const kept: string[] = [], heading = `這次交給引擎的檔案（${fileLines.length} 份）：`, rest = (count: number) => `…另有 ${count} 份`;
    let used = heading.length;
    for (const line of fileLines) {
      const next = Number.isFinite(room) ? clipLogText(line, 160) : line;
      if (used + next.length + 1 + rest(fileLines.length).length + 1 > room) break;
      kept.push(next); used += next.length + 1;
    }
    return [heading, ...kept, ...(kept.length < fileLines.length ? [rest(fileLines.length - kept.length)] : [])].join("\n");
  };
  const where = summary.frames.length ? `引擎位置：${summary.frames.join(" ← ")}` : "";

  // Names, labels and the cells quoted in a 判斷 come from files and from what the user typed: cleaned once, at the end.
  const copyText = cleanLogText([head(Number.MAX_SAFE_INTEGER), previewText, fileText(Infinity), where, summary.traceback ? `原始訊息：\n${raw}` : ""].filter(Boolean).join("\n\n"));
  let description = cleanLogText([head(500), clipLogText(previewText, 1800), fileText(700), where].filter(Boolean).join("\n\n"));
  if (summary.traceback) {
    const label = "\n\n原始訊息（結尾）：\n", room = FAILURE_DESCRIPTION_LIMIT - description.length - label.length;
    if (room > 80) description += label + tailLogText(raw, room);
  }
  return {
    job: input.job,
    title: clipLogText(cleanLogText(`${FAILURE_LOG_PREFIX}${input.job}：${explanation.headline}`).replace(/\s+/g, " "), FAILURE_TITLE_LIMIT),
    description: clipLogText(description, FAILURE_DESCRIPTION_LIMIT),
    copyText, explanation, summary, previews: input.previews, raw,
  };
}
