import type { InputFile, InputRole, RevisionInventory } from "./types.ts";

export const NETLIST_ROLES: InputRole[] = ["pstxnet", "pstxprt", "pstchip"];
export const INPUT_ROLES: InputRole[] = [...NETLIST_ROLES, "bom", "pdf", "dsn"];
export const REQUIRED_ROLES: InputRole[] = [...NETLIST_ROLES, "bom", "pdf"];
export const INPUT_ROLE_DETAILS: Record<InputRole, { label: string; hint: string }> = {
  pstxnet: { label: "Netlist 連線資料", hint: "pstxnet.dat" },
  pstxprt: { label: "Netlist 零件資料", hint: "pstxprt.dat" },
  pstchip: { label: "Netlist 接腳資料", hint: "pstchip.dat" },
  bom: { label: "零件用料表 BOM", hint: "Excel／CSV／HTML" },
  pdf: { label: "電路圖 PDF", hint: "電路圖 .pdf" },
  dsn: { label: "電路設計原檔 DSN", hint: "OrCAD .dsn（選用）" },
};
/** What the row picker of each slot offers in the file dialog. */
export const INPUT_ROLE_ACCEPT: Record<InputRole, string> = { pstxnet: ".dat", pstxprt: ".dat", pstchip: ".dat", bom: ".xls,.xlsx,.csv,.htm,.html,.bom,.txt", pdf: ".pdf", dsn: ".dsn" };
const ROLE_NEEDS: Record<InputRole, string> = {
  pstxnet: "檔名含 pstxnet 的 .dat 檔", pstxprt: "檔名含 pstxprt 的 .dat 檔", pstchip: "檔名含 pstchip 的 .dat 檔",
  bom: "BOM 用料表（.xlsx、.xls、.csv、.htm、.html、.bom、.txt）", pdf: "原始電路圖 PDF（檔名不以 AutoCheck 開頭）", dsn: "OrCAD .dsn 檔",
};
/** One version's picked files plus the file chosen for each slot. */
export interface RevisionSelection { files: File[]; selected: Partial<Record<InputRole, string>>; }
const MiB = 1024 * 1024;
// Validation messages surface next to the run button, so name each role the way
// the input panel labels it (ComparisonInputs). Required netlists keep their
// filename because that is what people search their export folder for.
const roleName = (role: InputRole) => `${INPUT_ROLE_DETAILS[role].label}（${INPUT_ROLE_DETAILS[role].hint}）`;

export function filePath(file: File): string { return file.webkitRelativePath || file.name; }

export function isSafeRelativePath(path: unknown): path is string {
  return typeof path === "string" && path.length > 0 && path.length <= 1024
    && !/[\\:]/.test(path) && !Array.from(path).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    && path.split("/").every(part => part !== "" && part !== "." && part !== ".." && part.trim() === part);
}

export function inspectRevision(files: File[]): RevisionInventory {
  const roles: Record<InputRole, File[]> = { pstxnet: [], pstxprt: [], pstchip: [], bom: [], dsn: [], pdf: [] };
  let ignored = 0;
  for (const file of files) {
    const name = file.name.toLowerCase();
    let recognized = false;
    for (const role of NETLIST_ROLES) {
      if (name.includes(role) && name.endsWith(".dat")) { roles[role].push(file); recognized = true; }
    }
    if (/\.(xls|xlsx|htm|html|csv|bom|txt)$/.test(name) && !(name.startsWith("i2c_map_declared") && name.endsWith(".csv"))) {
      roles.bom.push(file); recognized = true;
    }
    if (name.endsWith(".dsn")) { roles.dsn.push(file); recognized = true; }
    if (name.endsWith(".pdf") && !name.startsWith("autocheck")) { roles.pdf.push(file); recognized = true; }
    if (!recognized) ignored++;
  }
  return { files: [...files], roles, ignored, totalBytes: files.reduce((total, file) => total + file.size, 0) };
}

function chosenFile(inventory: RevisionInventory, role: InputRole, selected: Partial<Record<InputRole, string>>): File | undefined {
  return selected[role] === undefined
    ? inventory.roles[role].length === 1 ? inventory.roles[role][0] : undefined
    : inventory.roles[role].find(file => filePath(file) === selected[role]);
}

export function validateRevision(inventory: RevisionInventory, selected: Partial<Record<InputRole, string>> = {}, required: InputRole[] = REQUIRED_ROLES): string[] {
  const fresh = inspectRevision(inventory.files);
  const errors: string[] = [];
  // Only files that can fill a slot are checked. Everything else in a picked folder
  // (board files, datasheets, archives) is never read or sent, so it must not block the run.
  const paths = new Set<string>();
  for (const file of new Set(INPUT_ROLES.flatMap(role => fresh.roles[role]))) {
    const path = filePath(file);
    if (!isSafeRelativePath(path)) errors.push(`不安全的檔案路徑：${path}`);
    if (paths.has(path.toLowerCase())) errors.push(`重複的檔案路徑：${path}`);
    paths.add(path.toLowerCase());
  }
  const chosen = new Set<string>();
  let chosenBytes = 0;
  for (const role of INPUT_ROLES) {
    const candidates = fresh.roles[role];
    const selection = selected[role];
    if (selection !== undefined && typeof selection !== "string") { errors.push(`${roleName(role)}：檔案選擇無效`); continue; }
    if (selection === "" && !required.includes(role)) continue;
    if (selection && !candidates.some(file => filePath(file) === selection)) errors.push(`${roleName(role)}：選的檔案不存在`);
    if (!candidates.length && required.includes(role)) errors.push(`缺少 ${roleName(role)}`);
    if (candidates.length > 1 && !selection) errors.push(`${roleName(role)} 有好幾份，從下拉選單挑一份`);
    if (selection === "" && required.includes(role)) errors.push(`${roleName(role)} 一定要選一份`);
    const file = chosenFile(fresh, role, selected);
    if (file && chosen.has(filePath(file))) errors.push(`不同輸入角色使用重複的檔案路徑：${filePath(file)}`);
    if (!file) continue;
    chosen.add(filePath(file));
    // The size limits bound what is actually read into the engine.
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 64 * MiB) errors.push(`${filePath(file)}：單一檔案不可超過 64 MiB`);
    else chosenBytes += file.size;
  }
  if (chosenBytes > 128 * MiB) errors.push("每個版本實際使用的檔案合計不可超過 128 MiB");
  return errors;
}

/** How many of the required slots already have a file. */
export function revisionProgress(value: RevisionSelection, required: InputRole[] = REQUIRED_ROLES): { ready: number; total: number } {
  const inventory = inspectRevision(value.files);
  return { ready: required.filter(role => chosenFile(inventory, role, value.selected)).length, total: required.length };
}

/** Why a file cannot go into a slot, or "" when it fits. */
export function roleMismatch(role: InputRole, file: File): string {
  return inspectRevision([file]).roles[role].length ? "" : `「${file.name}」不能放在${INPUT_ROLE_DETAILS[role].label}，這一格要放${ROLE_NEEDS[role]}`;
}

/**
 * Adds loose files to a version without dropping what is already there, so
 * netlists, BOM and schematic kept in different folders can be picked one by one.
 * A slot that receives exactly one new file switches to it and lets go of the
 * file it used before; several new files for one slot are kept for the user to choose.
 */
export function addRevisionFiles(current: RevisionSelection, added: File[]): RevisionSelection {
  const key = (file: File) => filePath(file).toLowerCase();
  const incoming = [...new Map(added.map(file => [key(file), file])).values()];
  const incomingRoles = inspectRevision(incoming).roles;
  const before = inspectRevision(current.files);
  const replaced = new Set(incoming.map(key));
  const selected = { ...current.selected };
  for (const role of INPUT_ROLES) {
    if (incomingRoles[role].length > 1) delete selected[role];
    if (incomingRoles[role].length !== 1) continue;
    const previous = chosenFile(before, role, current.selected);
    if (previous) replaced.add(key(previous));
    selected[role] = filePath(incomingRoles[role][0]);
  }
  return { files: [...current.files.filter(file => !replaced.has(key(file))), ...incoming], selected };
}

/** Takes one file out of a version and forgets any slot that pointed at it. */
export function removeRevisionFile(current: RevisionSelection, path: string): RevisionSelection {
  const selected = { ...current.selected };
  for (const role of INPUT_ROLES) if (selected[role] === path) delete selected[role];
  return { files: current.files.filter(file => filePath(file) !== path), selected };
}

/** True when both sides use netlists with the same name, size and modified time: usually one folder picked twice. */
export function sameRevisionSources(a: RevisionSelection, b: RevisionSelection): boolean {
  const [left, right] = [a, b].map(value => { const inventory = inspectRevision(value.files); return NETLIST_ROLES.map(role => chosenFile(inventory, role, value.selected)); });
  return left.every((file, index) => { const other = right[index]; return Boolean(file && other && file.name === other.name && file.size === other.size && file.lastModified === other.lastModified); });
}

export function selectedRevisionFiles(inventory: RevisionInventory, selected: Partial<Record<InputRole, string>> = {}, required: InputRole[] = REQUIRED_ROLES): File[] {
  const fresh = inspectRevision(inventory.files);
  const errors = validateRevision(fresh, selected, required);
  if (errors.length) throw new Error(errors.join("\n"));
  return INPUT_ROLES.map(role => chosenFile(fresh, role, selected)).filter((file): file is File => Boolean(file));
}

export async function readRevision(inventory: RevisionInventory, selected: Partial<Record<InputRole, string>> = {}, required: InputRole[] = REQUIRED_ROLES): Promise<InputFile[]> {
  const result: InputFile[] = [];
  for (const file of selectedRevisionFiles(inventory, selected, required)) {
    const bytes = await file.arrayBuffer();
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== file.size) throw new Error(`檔案讀取大小不符：${filePath(file)}`);
    result.push({ path: filePath(file), bytes });
  }
  return result;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < MiB ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / MiB).toFixed(1)} MiB`;
}
