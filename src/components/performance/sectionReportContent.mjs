const PREFIX = "RD2_SECTION_V1\n";
export const SECTION_REPORT_FIELDS = [
  { key: "achievements", label: "成果重點", placeholder: "本課本期完成哪些成果？請寫出影響與具體結果。" },
  { key: "risks", label: "問題與改善", placeholder: "目前問題、風險、改善行動與預計完成時間。" },
  { key: "support", label: "需要部長協助", placeholder: "需要的資源、跨課協調或決策；沒有需求可填「無」。" },
];
export function readSectionReportContent(raw = "") {
  if (raw.startsWith(PREFIX)) {
    try {
      const data = JSON.parse(raw.slice(PREFIX.length));
      return Object.fromEntries(SECTION_REPORT_FIELDS.map(({ key }) => [key, typeof data?.[key] === "string" ? data[key] : ""]));
    } catch { /* Preserve legacy or malformed text instead of losing it. */ }
  }
  return { achievements: raw, risks: "", support: "" };
}
export function writeSectionReportContent(content) {
  return PREFIX + JSON.stringify(Object.fromEntries(SECTION_REPORT_FIELDS.map(({ key }) => [key, String(content?.[key] ?? "")])));
}
