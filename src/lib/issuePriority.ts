// 問題優先級自動推算工具
// 規則：依建立時間距今天數
//   <1 天 -> low
//   1-3 天 -> medium
//   3-7 天 -> high
//   >7 天 -> critical
// 若 priority_manual 為 true，使用既有資料庫值

export type IssuePriority = "low" | "medium" | "high" | "critical";

export function computeAutoPriority(createdAt: string | Date | undefined | null): IssuePriority {
  if (!createdAt) return "low";
  const created = new Date(createdAt).getTime();
  if (isNaN(created)) return "low";
  const days = (Date.now() - created) / (1000 * 60 * 60 * 24);
  if (days > 7) return "critical";
  if (days > 3) return "high";
  if (days > 1) return "medium";
  return "low";
}

export function getEffectivePriority(
  storedPriority: string | undefined,
  priorityManual: boolean | undefined,
  createdAt: string | Date | undefined | null
): IssuePriority {
  if (priorityManual && storedPriority) {
    return storedPriority as IssuePriority;
  }
  return computeAutoPriority(createdAt);
}
