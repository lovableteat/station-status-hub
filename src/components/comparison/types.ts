export type InputRole = "pstxnet" | "pstxprt" | "pstchip" | "bom" | "dsn" | "pdf";

export interface InputFile { path: string; bytes: ArrayBuffer }

export interface RevisionInventory {
  files: File[];
  roles: Record<InputRole, File[]>;
  ignored: number;
  totalBytes: number;
}

export interface TrackRow {
  key: string;
  gid: string;
  category: string;
  rule: string;
  severity: string;
  status: string;
  page: number | null;
  page_title: string;
  refdes: string[];
  pins: string[];
  nets: string[];
  title: string;
  detail: string;
  related: string[];
  dest: string;
}

export interface ReviewReply { disp: string; owner: string; target_rev: string; note: string; filled: string }
export interface ReviewChange { key: string; field: keyof ReviewReply; old: string; value: string; at: string }
export interface Artifact { key: string; name: string; mime: string; bytes: ArrayBuffer }

export interface ComparisonResult {
  meta: {
    tool_version: string;
    rules_version?: string;
    config_hash?: string;
    generated: string;
    a: { label: string; sources: Record<string, unknown>[] };
    b: { label: string; sources: Record<string, unknown>[] };
    warnings?: string[];
  };
  findings: Record<string, unknown>[];
  rows: TrackRow[];
  overview: Record<string, unknown>[];
  capRows: Record<string, unknown>[];
  railTodo: Record<string, unknown>[];
  railDomain: Record<string, unknown>[];
  powerTree: Record<string, unknown>;
  powerTreeA: Record<string, unknown>;
  i2cMap: Record<string, unknown>;
  i2cMapA: Record<string, unknown>;
  inputIssues: [string, string][];
  warnings: string[];
  library: Record<string, unknown>[];
  artifacts: Artifact[];
}

export interface ComparisonSession {
  version: 1;
  projectName: string;
  id: string;
  result: ComparisonResult;
  replies: Record<string, ReviewReply>;
  history: ReviewChange[];
  savedAt: string;
  libraryYaml?: string;
}
