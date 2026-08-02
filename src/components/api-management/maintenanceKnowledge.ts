export type MaintenanceSourceType =
  | "project"
  | "machine"
  | "station"
  | "progress"
  | "issue"
  | "asset";

export interface MaintenanceProjectOption {
  id: string;
  name: string;
  status?: string | null;
}

export interface MaintenanceCitation {
  chunkId: string;
  sourceType: MaintenanceSourceType;
  sourceId: string;
  projectId: string;
  projectName: string;
  title: string;
  content: string;
  sourceLabel: string;
  module: string;
  routeParams: Record<string, string>;
  updatedAt: string | null;
  rank: number;
}

export interface MaintenanceScopeState {
  selectedProjectIds: string[];
  selectionMode: "default" | "custom";
}

interface MaintenanceKnowledgeRow {
  chunk_id: string;
  source_type: string;
  source_id: string;
  project_id: string;
  project_name: string;
  title: string;
  content: string;
  source_label: string;
  module: string;
  route_params: unknown;
  updated_at: string | null;
  rank: number;
}

export interface MaintenanceRpcClient {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

const SOURCE_TYPES = new Set<MaintenanceSourceType>([
  "project",
  "machine",
  "station",
  "progress",
  "issue",
  "asset",
]);

function activeProjectIds(projects: MaintenanceProjectOption[]) {
  return projects
    .filter((project) => project.status !== "archived")
    .map((project) => project.id);
}

function uniqueAvailableIds(ids: string[], projects: MaintenanceProjectOption[]) {
  const available = new Set(activeProjectIds(projects));
  return Array.from(new Set(ids.filter((id) => available.has(id))));
}

export function createMaintenanceScope(
  currentProjectId: string | null | undefined,
  projects: MaintenanceProjectOption[],
): MaintenanceScopeState {
  const available = new Set(activeProjectIds(projects));
  return {
    selectedProjectIds: currentProjectId && available.has(currentProjectId)
      ? [currentProjectId]
      : [],
    selectionMode: "default",
  };
}

export function syncMaintenanceScope(
  state: MaintenanceScopeState,
  currentProjectId: string | null | undefined,
  projects: MaintenanceProjectOption[],
): MaintenanceScopeState {
  const selectedProjectIds = uniqueAvailableIds(state.selectedProjectIds, projects);
  if (state.selectionMode === "custom") {
    return selectedProjectIds.length === state.selectedProjectIds.length
      ? state
      : { ...state, selectedProjectIds };
  }

  const available = new Set(activeProjectIds(projects));
  return {
    selectedProjectIds: currentProjectId && available.has(currentProjectId)
      ? [currentProjectId]
      : [],
    selectionMode: "default",
  };
}

export function toggleMaintenanceProject(
  state: MaintenanceScopeState,
  projectId: string,
  selected: boolean,
  projects: MaintenanceProjectOption[],
): MaintenanceScopeState {
  const next = new Set(uniqueAvailableIds(state.selectedProjectIds, projects));
  if (selected && activeProjectIds(projects).includes(projectId)) next.add(projectId);
  else next.delete(projectId);
  return { selectedProjectIds: Array.from(next), selectionMode: "custom" };
}

export function selectAllMaintenanceProjects(
  _state: MaintenanceScopeState,
  projects: MaintenanceProjectOption[],
): MaintenanceScopeState {
  return { selectedProjectIds: activeProjectIds(projects), selectionMode: "custom" };
}

export function selectCurrentMaintenanceProject(
  _state: MaintenanceScopeState,
  currentProjectId: string | null | undefined,
  projects: MaintenanceProjectOption[],
): MaintenanceScopeState {
  const available = new Set(activeProjectIds(projects));
  return {
    selectedProjectIds: currentProjectId && available.has(currentProjectId)
      ? [currentProjectId]
      : [],
    selectionMode: "custom",
  };
}

export function clearMaintenanceProjects(
  _state: MaintenanceScopeState,
): MaintenanceScopeState {
  return { selectedProjectIds: [], selectionMode: "custom" };
}

function plainContextText(value: string, maxLength: number) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function buildMaintenanceContext(citations: MaintenanceCitation[]) {
  const sources = citations.slice(0, 20).map((citation, index) => {
    const heading = `[M${index + 1}] ${plainContextText(citation.sourceLabel, 80)} · ${plainContextText(citation.title, 180)}`;
    const metadata = `專案：${plainContextText(citation.projectName, 180)}｜來源類型：${citation.sourceType}`;
    return `${heading}\n${metadata}\n${plainContextText(citation.content, 950)}`;
  });

  return [
    "以下是系統即時檢索出的機台維修正式資料。維修事實只能依據這些來源回答，不得自行補造。",
    "回答時在相關敘述後標示 [M1]、[M2]；若來源不足，請清楚說明查無足夠證據。",
    ...sources,
  ].join("\n\n");
}

export function buildMaintenanceSourceHref(citation: MaintenanceCitation) {
  const params = new URLSearchParams({
    workspace: "station-status",
    project: citation.projectId,
    module: citation.module,
  });
  for (const [key, value] of Object.entries(citation.routeParams)) {
    if (value) params.set(key, value);
  }
  return `/?${params.toString()}`;
}

function parseRouteParams(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .slice(0, 12),
  );
}

export function parseMaintenanceCitation(value: unknown): MaintenanceCitation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const requiredStrings = [
    "chunkId",
    "sourceType",
    "sourceId",
    "projectId",
    "projectName",
    "title",
    "content",
    "sourceLabel",
    "module",
  ];
  if (requiredStrings.some((key) => typeof row[key] !== "string" || !row[key])) return null;
  if (!SOURCE_TYPES.has(row.sourceType as MaintenanceSourceType)) return null;

  return {
    chunkId: row.chunkId as string,
    sourceType: row.sourceType as MaintenanceSourceType,
    sourceId: row.sourceId as string,
    projectId: row.projectId as string,
    projectName: row.projectName as string,
    title: row.title as string,
    content: row.content as string,
    sourceLabel: row.sourceLabel as string,
    module: row.module as string,
    routeParams: parseRouteParams(row.routeParams),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
    rank: typeof row.rank === "number" && Number.isFinite(row.rank) ? row.rank : 0,
  };
}

function mapKnowledgeRow(value: unknown): MaintenanceCitation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<MaintenanceKnowledgeRow>;
  return parseMaintenanceCitation({
    chunkId: row.chunk_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    projectId: row.project_id,
    projectName: row.project_name,
    title: row.title,
    content: row.content,
    sourceLabel: row.source_label,
    module: row.module,
    routeParams: row.route_params,
    updatedAt: row.updated_at,
    rank: row.rank,
  });
}

export async function searchMaintenanceKnowledge(
  client: MaintenanceRpcClient,
  {
    query,
    projectIds,
    limit = 16,
  }: { query: string; projectIds: string[]; limit?: number },
) {
  const { data, error } = await client.rpc("search_maintenance_knowledge", {
    p_limit: Math.max(1, Math.min(limit, 20)),
    p_project_ids: projectIds,
    p_query: query.trim(),
  });
  if (error) throw new Error(error.message || "無法檢索機台維修資料");
  if (!Array.isArray(data)) return [];
  return data.map(mapKnowledgeRow).filter((row): row is MaintenanceCitation => Boolean(row));
}
