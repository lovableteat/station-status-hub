import type {
  TestPlanFileCategory,
  TestPlanFileRecord,
} from "../types";

export interface TestPlanOverviewCategory {
  category: TestPlanFileCategory;
  count: number;
  percentage: number;
}

const OVERVIEW_CATEGORIES: readonly TestPlanFileCategory[] = [
  "3d",
  "pcb",
  "spreadsheet",
  "document",
  "presentation",
  "image",
  "archive",
  "other",
];

export function getTestPlanCategorySummary(
  files: readonly TestPlanFileRecord[],
): TestPlanOverviewCategory[] {
  const counts = new Map<TestPlanFileCategory, number>(
    OVERVIEW_CATEGORIES.map((category) => [category, 0]),
  );

  for (const file of files) {
    counts.set(file.category, (counts.get(file.category) ?? 0) + 1);
  }

  const total = files.length;
  const summary = OVERVIEW_CATEGORIES.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
    percentage:
      total === 0
        ? 0
        : Math.round(((counts.get(category) ?? 0) / total) * 1000) / 10,
  }));

  if (total === 0) return summary;

  let lastNonZeroIndex = -1;
  for (let index = 0; index < summary.length; index += 1) {
    if (summary[index].count > 0) lastNonZeroIndex = index;
  }

  if (lastNonZeroIndex >= 0) {
    const roundedTotal = summary.reduce(
      (sum, item) => sum + item.percentage,
      0,
    );
    summary[lastNonZeroIndex].percentage =
      Math.round(
        (summary[lastNonZeroIndex].percentage + 100 - roundedTotal) * 10,
      ) / 10;
  }

  return summary;
}

export function getRecentTestPlanFiles(
  files: readonly TestPlanFileRecord[],
  limit = 4,
): TestPlanFileRecord[] {
  return [...files]
    .sort(
      (first, second) =>
        second.updatedAt.localeCompare(first.updatedAt) ||
        first.originalName.localeCompare(second.originalName, "zh-Hant", {
          numeric: true,
        }),
    )
    .slice(0, Math.max(0, limit));
}
