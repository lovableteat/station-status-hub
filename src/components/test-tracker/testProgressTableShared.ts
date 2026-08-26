import type { TrackerSystem } from "./TestProgressTable";

export function normalizeTrackerTableStatus(system: TrackerSystem) {
  if (
    system.status === "Done" ||
    system.status === "已完成" ||
    system.current_station === "已完成" ||
    system.overall_progress === 100
  ) {
    return "已完成";
  }
  if (
    system.status === "On-going" ||
    system.status === "進行中" ||
    (system.overall_progress ?? 0) > 0
  ) {
    return "進行中";
  }
  return "未開始";
}

export function getTrackerTableStatusClass(status: string) {
  if (status === "已完成") return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
  if (status === "進行中") return "border-blue-300/35 bg-blue-300/10 text-blue-100";
  return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
}
