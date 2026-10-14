import type { InputFile, InputRole, RevisionInventory } from "./types.ts";

const NETLIST_ROLES: InputRole[] = ["pstxnet", "pstxprt", "pstchip"];
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
    if (selection !== undefined && typeof selection !== "string") { errors.push(`${roleName(role)}：檔案選擇無效`); continue; }
    if (selection === "" && !REQUIRED_ROLES.includes(role)) continue;
    if (selection && !candidates.some(file => filePath(file) === selection)) errors.push(`${roleName(role)}：選的檔案不存在`);
    if (!candidates.length && REQUIRED_ROLES.includes(role)) errors.push(`缺少 ${roleName(role)}`);
    if (candidates.length > 1 && !selection) errors.push(`${roleName(role)} 有好幾份，從下拉選單挑一份`);
    if (selection === "" && REQUIRED_ROLES.includes(role)) errors.push(`${roleName(role)} 一定要選一份`);
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
