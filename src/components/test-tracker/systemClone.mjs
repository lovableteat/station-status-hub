const DEFAULT_CLONE_COUNT = 5;
const MAX_CLONE_COUNT = 100;

export function parseSystemSequence(sourceName) {
  const normalizedName = String(sourceName || "").trim();
  const match = normalizedName.match(/^(.*?)(\d+)$/);

  if (!match) {
    return {
      count: DEFAULT_CLONE_COUNT,
      padding: 0,
      prefix: `${normalizedName || "Machine"}-`,
      startNumber: 1,
    };
  }

  const numericSuffix = match[2];
  return {
    count: DEFAULT_CLONE_COUNT,
    padding: numericSuffix.startsWith("0") ? numericSuffix.length : 0,
    prefix: match[1],
    startNumber: Number(numericSuffix) + 1,
  };
}

export function buildSystemSeriesNames({
  count,
  padding = 0,
  prefix,
  startNumber,
}) {
  const normalizedCount = Number(count);
  const normalizedStart = Number(startNumber);
  const normalizedPadding = Math.max(0, Number(padding) || 0);
  const normalizedPrefix = String(prefix ?? "").trimStart();

  if (!Number.isInteger(normalizedCount) || normalizedCount < 1 || normalizedCount > MAX_CLONE_COUNT) {
    throw new Error("建立數量必須介於 1 到 100 台");
  }
  if (!Number.isInteger(normalizedStart) || normalizedStart < 0) {
    throw new Error("起始號碼必須是大於或等於 0 的整數");
  }
  if (!normalizedPrefix.trim()) {
    throw new Error("機台名稱前綴不可空白");
  }

  const names = Array.from({ length: normalizedCount }, (_, index) => {
    const suffix = String(normalizedStart + index).padStart(normalizedPadding, "0");
    return `${normalizedPrefix}${suffix}`.trim();
  });

  if (new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length) {
    throw new Error("產生的機台名稱不可重複");
  }

  return names;
}

export const SYSTEM_CLONE_LIMIT = MAX_CLONE_COUNT;
