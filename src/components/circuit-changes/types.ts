export type CircuitChangeStatus = "draft" | "in_review" | "needs_changes" | "approved";
export const CIRCUIT_CHANGE_STATUS_LABELS: Record<CircuitChangeStatus, string> = {
  draft: "編輯中", in_review: "待 Review", needs_changes: "退回補充", approved: "已確認",
};
export type CircuitImageSide = "before" | "after" | "reference";
export const CIRCUIT_IMAGE_SIDE_LABELS: Record<CircuitImageSide, string> = { before: "修改前", after: "修改後", reference: "補充圖" };
export interface CircuitImageMark {
  id: string; kind: "pin" | "box"; x: number; y: number; width?: number; height?: number; text: string;
}
export interface CircuitImage {
  id: string; name: string; path: string; thumbnailPath?: string; mime: string; size: number;
  width: number; height: number; side: CircuitImageSide; caption: string; marks: CircuitImageMark[];
  uploadedAt: string; uploadedBy: string;
}
export interface CircuitChangeContent {
  title: string; reason: string; description: string; refs: string; net: string; page: string;
  owner: string; images: CircuitImage[];
}
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
}
export type CircuitChangeAction = "submit" | "approve" | "request_changes" | "comment";
export interface CircuitChangeEvent {
  id: string; itemId: string; setId: string; type: string; actorId: string; actorName: string;
  revision: number; note: string; snapshot?: CircuitChangeItem; createdAt: string;
}
export const emptyCircuitChangeContent = (owner = ""): CircuitChangeContent => ({
  title: "", reason: "", description: "", refs: "", net: "", page: "", owner, images: [],
});
export interface CircuitUploadFailure { file: File; error: string; side?: CircuitImageSide }
export interface CircuitChangesModel {
  sets: CircuitChangeSet[]; selectedSetId: string; items: CircuitChangeItem[]; selectedItemId: string;
  selectedItem: CircuitChangeItem | null; draft: CircuitChangeContent | null; events: CircuitChangeEvent[];
  loading: boolean; saving: boolean; uploading: boolean; dirty: boolean; conflict: boolean;
  error: string; saveError: string; uploadProgress: { completed: number; total: number };
  uploadFailures: CircuitUploadFailure[]; uploadWarnings: string[];
  selectSet: (id: string) => Promise<void>; selectItem: (id: string) => Promise<void>;
  createSet: (title: string, fromLabel: string, toLabel: string) => Promise<void>;
  createItem: () => Promise<void>; updateDraft: (patch: Partial<CircuitChangeContent>) => void;
  saveDraft: () => Promise<void>; review: (action: CircuitChangeAction, note?: string) => Promise<void>;
  addImages: (files: File[], side: CircuitImageSide) => Promise<void>; retryUploads: () => Promise<void>;
  reload: () => Promise<void>; adoptRemote: () => void; saveMyRevision: () => Promise<void>;
  loadEvent: (id: string) => Promise<CircuitChangeEvent>;
}
