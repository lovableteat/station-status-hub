import type { PcbProject } from "../types.ts";

const revisions = new WeakMap<object, string>();
const projectRevisions = new WeakMap<PcbProject, string>();
const projectContentRevisions = new WeakMap<PcbProject, string>();

// Reducer snapshots are immutable; cache only by the snapshot object, never by ID or timestamp.
export function objectRevision(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  let revision = revisions.get(value);
  if (revision === undefined) {
    revision = JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
    revisions.set(value, revision);
  }
  return revision;
}

export function projectRevision(project: PcbProject, contentOnly = false): string {
  const cache = contentOnly ? projectContentRevisions : projectRevisions;
  let revision = cache.get(project);
  if (revision === undefined) {
    const { lastEditedBy, lastEditedById, ...content } = project;
    if (contentOnly) content.updatedAt = "";
    revision = objectRevision(content);
    cache.set(project, revision);
  }
  return revision;
}

export function sameProjectScope(project: PcbProject | undefined, baseline: PcbProject | undefined,
  pending: unknown = [], savedPending: unknown = []): boolean {
  return (project === baseline || Boolean(project && baseline && projectRevision(project) === projectRevision(baseline)))
    && (pending === savedPending || objectRevision(pending) === objectRevision(savedPending));
}
