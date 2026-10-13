import type { InputFile, InputRole, RevisionInventory } from "./types.ts";

export const INPUT_ROLES: InputRole[] = ["pstxnet", "pstxprt", "pstchip", "bom", "dsn", "pdf"];
const REQUIRED_ROLES: InputRole[] = ["pstxnet", "pstxprt", "pstchip"];
const MiB = 1024 * 1024;
// Validation messages surface next to the run button, so name each role the way
// the input panel labels it (ComparisonInputs). Required netlists keep their
// filename because that is what people search their export folder for.
const ROLE_NAMES: Record<InputRole, string> = {
  pstxnet: "Net 連線（pstxnet.dat）",
  pstxprt: "零件列表（pstxprt.dat）",
  pstchip: "Pin 定義（pstchip.dat）",
  bom: "ERP BOM",
  dsn: "OrCAD DSN",
  pdf: "線路圖 PDF",
};

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
    for (const role of REQUIRED_ROLES) {
      if (name.includes(role) && name.endsWith(".dat")) { roles[role].push(file); recognized = true; }
    }
    if (/\.(xls|xlsx|htm|html|csv)$/.test(name) && !(name.startsWith("i2c_map_declared") && name.endsWith(".csv"))) {
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

export function validateRevision(inventory: RevisionInventory, selected: Partial<Record<InputRole, string>> = {}): string[] {
  const fresh = inspectRevision(inventory.files);
  const errors: string[] = [];
  if (fresh.files.length > 1000) errors.push("每個版本最多選取 1000 個檔案");
  if (!Number.isSafeInteger(fresh.totalBytes) || fresh.totalBytes > 128 * MiB) errors.push("每個版本的輸入檔案總量不可超過 128 MiB");
  const paths = new Set<string>();
  for (const file of fresh.files) {
    const path = filePath(file);
    if (!isSafeRelativePath(path)) errors.push(`不安全的檔案路徑：${path}`);
    if (paths.has(path.toLowerCase())) errors.push(`重複的檔案路徑：${path}`);
    paths.add(path.toLowerCase());
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 64 * MiB) errors.push(`${path}：單一檔案不可超過 64 MiB`);
  }
  const chosen = new Set<string>();
  for (const role of INPUT_ROLES) {
    const candidates = fresh.roles[role];
    const selection = selected[role];
    if (selection !== undefined && typeof selection !== "string") { errors.push(`${ROLE_NAMES[role]}：檔案選擇無效`); continue; }
    if (selection === "" && !REQUIRED_ROLES.includes(role)) continue;
    if (selection && !candidates.some(file => filePath(file) === selection)) errors.push(`${ROLE_NAMES[role]}：選取的檔案不存在`);
    if (!candidates.length && REQUIRED_ROLES.includes(role)) errors.push(`缺少必備 netlist：${ROLE_NAMES[role]}`);
    if (candidates.length > 1 && !selection) errors.push(`${ROLE_NAMES[role]} 有多個檔案，請在下拉選單選定一份`);
    if (selection === "" && REQUIRED_ROLES.includes(role)) errors.push(`請選取必備 netlist：${ROLE_NAMES[role]}`);
    const file = chosenFile(fresh, role, selected);
    if (file && chosen.has(filePath(file))) errors.push(`不同輸入角色使用重複的檔案路徑：${filePath(file)}`);
    if (file) chosen.add(filePath(file));
  }
  return errors;
}

export async function readRevision(inventory: RevisionInventory, selected: Partial<Record<InputRole, string>> = {}): Promise<InputFile[]> {
  const fresh = inspectRevision(inventory.files);
  const errors = validateRevision(fresh, selected);
  if (errors.length) throw new Error(errors.join("\n"));
  const result: InputFile[] = [];
  for (const role of INPUT_ROLES) {
    const file = chosenFile(fresh, role, selected);
    if (!file) continue;
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
