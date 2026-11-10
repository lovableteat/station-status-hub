import type { CircuitChangeEvent, CircuitChangeSet } from "./types";

export const CIRCUIT_EVENT_LABELS: Record<string, string> = {
  created: "建立項目", edited: "更新內容", submit: "回報改善", submitted: "回報改善", approve: "確認結案", approved: "確認結案",
  request_changes: "退回重改", changes_requested: "退回重改", comment: "留言", removed: "移除項目", restored: "還原項目",
};
const RETURN_EVENTS = new Set(["request_changes", "changes_requested"]);

export interface CircuitEventGroup { latest: CircuitChangeEvent; events: CircuitChangeEvent[] }
/**
 * Auto-save writes a revision at every pause in typing. Consecutive content edits by one person are one entry in the
 * history (newest first); every revision in it stays reachable.
 */
export function groupCircuitChangeEvents(events: readonly CircuitChangeEvent[]): CircuitEventGroup[] {
  const groups: CircuitEventGroup[] = [];
  for (const event of [...events].sort((left, right) => right.revision - left.revision)) {
    const open = groups.at(-1);
    if (open && event.type === "edited" && !event.note && open.latest.type === "edited" && !open.latest.note && open.latest.actorId === event.actorId) open.events.push(event);
    else groups.push({ latest: event, events: [event] });
  }
  return groups;
}

/** The reason a change was last sent back, as long as that return is still what the engineer has to answer. */
export function latestCircuitReturn(events: readonly CircuitChangeEvent[], revision: number) {
  return [...events].filter(event => RETURN_EVENTS.has(event.type) && event.revision <= revision).sort((left, right) => right.revision - left.revision)[0] ?? null;
}

/** "V1 → V2 線路修改" already names its versions; other batches get them appended. */
export function circuitSetLabel(set: Pick<CircuitChangeSet, "title" | "fromLabel" | "toLabel">) {
  const versions = [set.fromLabel, set.toLabel || "待指定"].filter(Boolean).join(" → ");
  if (!set.fromLabel && !set.toLabel) return set.title;
  return set.title.includes(`${set.fromLabel} → ${set.toLabel}`) && set.toLabel ? set.title : `${set.title} · ${versions}`;
}
