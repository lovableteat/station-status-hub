export type CircuitChangeStatus = "draft" | "in_review" | "needs_changes" | "approved";
/**
 * One item is one problem found in the schematic and how it was fixed: the reviewer marks it (待改善), the person who draws
 * the schematic reports the fix (待確認), and the reviewer closes it (已結案) or sends it back (退回重改).
 */
export const CIRCUIT_CHANGE_STATUS_LABELS: Record<CircuitChangeStatus, string> = {
  draft: "待改善", in_review: "待確認", needs_changes: "退回重改", approved: "已結案",
};
/** The four jobs of the 線路修改 window, in the order people do them. */
export type CircuitTask = "review" | "ai" | "track" | "official";
export const CIRCUIT_TASKS: Array<{ key: CircuitTask; label: string; short: string; hint: string }> = [
  { key: "review", label: "線路 Review", short: "看圖、標記問題", hint: "看線路圖、截圖並標記問題" },
  { key: "ai", label: "AI 比對", short: "新舊版差在哪", hint: "官方版本與新版並排，AI 找出新舊差異，逐項確認並保存" },
  { key: "track", label: "改善追蹤", short: "回報改善、確認結案", hint: "畫線路的人回報改善，主管確認結案；每一步都有紀錄" },
  { key: "official", label: "官方版本", short: "換了就記錄", hint: "記錄目前的官方版本與每次更換" },
];
const TASK_KEY = "circuit-changes-task:v1";
export function readCircuitTask(): CircuitTask {
  try { const value = window.localStorage.getItem(TASK_KEY); return CIRCUIT_TASKS.some(task => task.key === value) ? value as CircuitTask : "review"; }
  catch { return "review"; }
}
export function writeCircuitTask(task: CircuitTask) { try { window.localStorage.setItem(TASK_KEY, task); } catch { /* the choice is a convenience */ } }
export type CircuitImageSide = "before" | "after" | "reference";
export const CIRCUIT_IMAGE_SIDE_LABELS: Record<CircuitImageSide, string> = { before: "問題截圖", after: "改好後截圖", reference: "補充圖" };
export interface CircuitImageMark {
  id: string; kind: "pin" | "box"; x: number; y: number; width?: number; height?: number; text: string;
}
/** Where a picture framed on a schematic PDF came from: which dated version, page and area (fractions of the page). */
export interface CircuitImageSource {
  kind: "pdf"; documentId: string; name: string; date: string; label: string; page: number;
  rect: { x: number; y: number; width: number; height: number };
}
export interface CircuitImage {
  id: string; name: string; path: string; thumbnailPath?: string; mime: string; size: number;
  width: number; height: number; side: CircuitImageSide; caption: string; marks: CircuitImageMark[];
  uploadedAt: string; uploadedBy: string;
  /** Set for pictures framed on a PDF here; the server stores it with the picture unchanged. */
  source?: CircuitImageSource;
}
export interface CircuitChangeContent {
  title: string; reason: string; description: string; refs: string; net: string; page: string;
  owner: string; images: CircuitImage[];
}
export type CircuitChangeTextField = Exclude<keyof CircuitChangeContent, "images">;
/** Same limits as circuit_change_private.validate_content, so a field can never hold text the server will refuse. */
export const CIRCUIT_CHANGE_FIELD_LIMITS: Record<CircuitChangeTextField, number> = {
  title: 500, reason: 10000, description: 40000, refs: 4000, net: 2000, page: 500, owner: 200,
};
export interface CircuitChangeContext {
  seriesId: string; workspaceId: string; workspaceName: string; projectId?: string; projectName?: string; versionLabel: string;
}
export interface CircuitChangeSet {
  id: string; seriesId: string; workspaceId: string; projectId: string | null; title: string;
  fromLabel: string; toLabel: string; createdAt: string; updatedAt: string; createdBy: string;
}
export interface CircuitChangeItem {
  id: string; setId: string; number: number; content: CircuitChangeContent; status: CircuitChangeStatus;
  revision: number; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; imageCount?: number;
  removedAt?: string; removedBy?: string;
}
export type CircuitChangeAction = "submit" | "approve" | "request_changes" | "comment";
export interface CircuitChangeEvent {
  id: string; itemId: string; setId: string; type: string; actorId: string; actorName: string;
  revision: number; note: string; snapshot?: CircuitChangeItem; createdAt: string;
}
export const emptyCircuitChangeContent = (owner = ""): CircuitChangeContent => ({
  title: "", reason: "", description: "", refs: "", net: "", page: "", owner, images: [],
});
/** A change that is open on screen but has not been written yet: the first save creates it and gives it its number. */
export const isUnsavedCircuitChange = (item: Pick<CircuitChangeItem, "revision"> | null | undefined) => Boolean(item && item.revision === 0);
/** The batch created together with the first recorded change of a board that has none, e.g. "V1 → V2 線路修改". */
export function defaultCircuitChangeSet(versionLabel: string) {
  const fromLabel = versionLabel.trim().slice(0, 80);
  const number = /^V(\d+)/i.exec(fromLabel);
  const toLabel = number ? `V${Number(number[1]) + 1}` : "";
  return { title: `${[fromLabel, toLabel].filter(Boolean).join(" → ")} 線路修改`.trim(), fromLabel, toLabel };
}
/** What the server still requires before a change can be sent for review; empty when it is ready. */
export function circuitChangeMissingForReview(content: CircuitChangeContent | null | undefined) {
  if (!content) return ["修改內容"];
  const missing: string[] = [];
  if (!content.title.trim()) missing.push("標題");
  if (!content.description.trim() && !content.images.some(image => image.side === "after")) missing.push("改善說明或改好後截圖");
  return missing;
}
/** `permanent` marks a file that can never be accepted (wrong type, empty, too large), so retrying it is pointless. */
export interface CircuitUploadFailure { file: File; error: string; side?: CircuitImageSide; permanent?: boolean }
export interface CircuitChangesModel {
  sets: CircuitChangeSet[]; selectedSetId: string; items: CircuitChangeItem[]; selectedItemId: string;
  removedItems: CircuitChangeItem[];
  selectedItem: CircuitChangeItem | null; draft: CircuitChangeContent | null; events: CircuitChangeEvent[];
  loading: boolean; saving: boolean; uploading: boolean; dirty: boolean; conflict: boolean;
  /** True while another change is being loaded; edits are ignored until it is on screen. */
  switching: boolean;
  error: string; saveError: string; uploadProgress: { completed: number; total: number };
  uploadFailures: CircuitUploadFailure[]; uploadWarnings: string[];
  selectSet: (id: string) => Promise<void>; selectItem: (id: string) => Promise<void>;
  createSet: (title: string, fromLabel: string, toLabel: string) => Promise<void>;
  /** Opens a blank change. Nothing is written until the user types or adds an image. */
  createItem: () => Promise<void>; updateDraft: (patch: Partial<CircuitChangeContent>) => void;
  deleteItem: (id: string) => Promise<void>; restoreItem: (id: string) => Promise<void>;
  saveDraft: () => Promise<void>; review: (action: CircuitChangeAction, note?: string) => Promise<void>;
  addImages: (files: File[], side: CircuitImageSide) => Promise<void>; retryUploads: () => Promise<void>;
  dismissUploadFailures: () => void;
  reload: () => Promise<void>; adoptRemote: () => void; saveMyRevision: () => Promise<void>;
  loadEvent: (id: string) => Promise<CircuitChangeEvent>;
}
