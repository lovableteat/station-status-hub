export type TestPlanFileCategory =
  | "presentation"
  | "spreadsheet"
  | "document"
  | "image"
  | "3d"
  | "pcb"
  | "archive"
  | "other";

export type TestPlanSort = "name" | "newest" | "oldest" | "largest" | "type";

export interface TestPlanSpace {
  id: string;
  ownerId: string;
  projectId: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestPlanFolder {
  id: string;
  spaceId: string;
  parentId: string | null;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestPlanFileRecord {
  id: string;
  spaceId: string;
  folderId: string | null;
  originalName: string;
  storagePath: string;
  mimeType: string | null;
  extension: string;
  category: TestPlanFileCategory;
  fileSize: number;
  description: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type TestPlanEntry =
  | ({ kind: "folder" } & TestPlanFolder)
  | ({ kind: "file" } & TestPlanFileRecord);

export interface TestPlanUploadCandidate {
  name: string;
  size: number;
  type?: string;
}
