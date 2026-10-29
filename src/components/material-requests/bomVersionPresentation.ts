/** Shared chip styles and formatters for the BOM version center, upload confirmation and diff view. */
export const CHIP = "inline-flex min-w-0 max-w-full items-center truncate rounded-md border px-1.5 text-[11px] font-semibold leading-5";
export const CHIP_TONE = {
  neutral: "border-border bg-secondary text-secondary-foreground",
  primary: "border-primary/35 bg-primary/15 text-primary",
  success: "border-success/35 bg-success/15 text-success",
  warning: "border-warning/35 bg-warning/15 text-warning",
  danger: "border-destructive/35 bg-destructive/15 text-destructive",
} as const;

export function formatBomTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "—";
  return parsed.toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatBomRelativeTime(value: string, now = Date.now()) {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return value || "—";
  const minutes = Math.max(0, Math.floor((now - parsed) / 60000));
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatBomTimestamp(value);
}
