import type { PcbSaveState } from "../types.ts";
import { isPcbSaveState, refreshBuiltInCatalog } from "./storage.ts";
import type { PcbRemoteLoadResult } from "./remoteSync.ts";

interface LegacyCatalog {
  projects: PcbSaveState["projects"];
  library: PcbSaveState["library"];
  updatedAt: string;
  remoteDeletions: { projects: string[]; library: string[] };
}

export class PcbLegacySnapshotError extends Error {
  readonly reason: "envelope" | "absent-value" | "null" | "malformed";
  constructor(reason: PcbLegacySnapshotError["reason"]) {
    super(`PCB legacy recovery is unavailable: ${reason}`);
    this.name = "PcbLegacySnapshotError";
    this.reason = reason;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function revision(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function validCatalog(value: unknown): value is LegacyCatalog {
  if (!record(value) || !exactKeys(value, ["projects", "library", "updatedAt", "remoteDeletions"])) return false;
  const deletions = value.remoteDeletions;
  if (!record(deletions) || !exactKeys(deletions, ["projects", "library"])) return false;
  // Reuse the full project/library validators, without inventing a private owner snapshot.
  return isPcbSaveState({
    projects: value.projects, library: value.library, updatedAt: value.updatedAt,
    templates: [], activeProjectId: null,
    remoteDeletions: { ...deletions, templates: [] },
  }) && (value.library as PcbSaveState["library"]).every(component => component.source === "custom" || component.source === "bom");
}

/** Only this authenticated, actor-bound envelope can supply legacy recovery data. */
export function parsePcbLegacyWorkspace(value: unknown): Extract<PcbRemoteLoadResult, { source: "legacy" }> {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "ownSnapshotPresent", "ownSnapshot", "sharedCatalog"])
    || value.schemaVersion !== 1 || typeof value.ownSnapshotPresent !== "boolean"
    || !Array.isArray(value.sharedCatalog) || !value.sharedCatalog.every(validCatalog)) {
    throw new PcbLegacySnapshotError("envelope");
  }
  if (!value.ownSnapshotPresent && value.ownSnapshot !== null) throw new PcbLegacySnapshotError("absent-value");
  if (value.ownSnapshotPresent && value.ownSnapshot === null) throw new PcbLegacySnapshotError("null");
  if (value.ownSnapshotPresent && !isPcbSaveState(value.ownSnapshot)) throw new PcbLegacySnapshotError("malformed");
  const own = value.ownSnapshotPresent ? value.ownSnapshot as PcbSaveState : null;
  const catalogs = value.sharedCatalog as LegacyCatalog[];
  const deletedProjects = new Set(catalogs.flatMap(catalog => catalog.remoteDeletions.projects));
  const deletedLibrary = new Set(catalogs.flatMap(catalog => catalog.remoteDeletions.library));
  const projects = new Map<string, PcbSaveState["projects"][number]>();
  const library = new Map<string, { component: PcbSaveState["library"][number]; updatedAt: string }>();
  // The server orders catalogs by owner ID ascending, without disclosing IDs.
  // Equal project revisions keep the first record; equal library revisions keep the last.
  for (const catalog of catalogs) {
    for (const project of catalog.projects) {
      if (deletedProjects.has(project.id)) continue;
      const existing = projects.get(project.id);
      if (!existing || revision(project.updatedAt) > revision(existing.updatedAt)) projects.set(project.id, structuredClone(project));
    }
    for (const component of catalog.library) {
      if (deletedLibrary.has(component.id)) continue;
      const existing = library.get(component.id);
      if (!existing || revision(catalog.updatedAt) >= revision(existing.updatedAt)) {
        library.set(component.id, { component: structuredClone(component), updatedAt: catalog.updatedAt });
      }
    }
  }
  // A partial envelope must not silently drop valid records from the exact own snapshot.
  if (own && (own.projects.some(project => !deletedProjects.has(project.id)
    && (!projects.has(project.id) || revision(projects.get(project.id)!.updatedAt) < revision(project.updatedAt)))
    || own.library.some(component => component.source !== "built-in" && !deletedLibrary.has(component.id)
      && (!library.has(component.id) || revision(library.get(component.id)!.updatedAt) < revision(own.updatedAt))))) {
    throw new PcbLegacySnapshotError("envelope");
  }
  const projectList = [...projects.values()].sort((left, right) => revision(right.updatedAt) - revision(left.updatedAt) || left.id.localeCompare(right.id));
  const base: PcbSaveState = own ? structuredClone(own) : {
    projects: [], templates: [], library: [], activeProjectId: null, modelAssets: {},
    pendingPlacementsByProject: {}, remoteDeletions: { projects: [], templates: [], library: [] },
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
  const updatedAt = catalogs.reduce((latest, catalog) => revision(catalog.updatedAt) > revision(latest) ? catalog.updatedAt : latest, base.updatedAt);
  return {
    source: "legacy",
    ownSnapshotPresent: value.ownSnapshotPresent,
    state: refreshBuiltInCatalog({
      ...base,
      projects: projectList,
      library: [...library.values()].map(entry => entry.component).sort((left, right) => left.name.localeCompare(right.name)),
      // Only the actor's own selection can survive. No other owner's first board is a private default.
      activeProjectId: own?.activeProjectId && projects.has(own.activeProjectId) ? own.activeProjectId : null,
      pendingPlacementsByProject: Object.fromEntries(Object.entries(base.pendingPlacementsByProject ?? {}).filter(([id]) => projects.has(id))),
      remoteDeletions: {
        projects: [...deletedProjects].sort(), templates: [...new Set(base.remoteDeletions?.templates ?? [])], library: [...deletedLibrary].sort(),
      },
      updatedAt,
    }),
  };
}
