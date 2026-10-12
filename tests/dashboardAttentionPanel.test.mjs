import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardSource = await readFile(
  new URL("../src/components/dashboard/Dashboard.tsx", import.meta.url),
  "utf8",
);

test("dashboard focuses on real issue follow-up instead of delivery and machine progress", () => {
  const requiredCopy = [
    "問題儀表板",
    "優先追蹤問題",
    "嚴重度",
    "負責人",
    "七日未更新",
    "查看全部問題",
  ];

  for (const copy of requiredCopy) {
    assert.match(dashboardSource, new RegExp(copy), `missing clarified copy: ${copy}`);
  }

  assert.doesNotMatch(dashboardSource, /整體交付進度|近七日產出趨勢|需關注機台|站點產能|calculateDashboardMetrics|useUnifiedData/);
});

test("dashboard keeps the issue table structure and explains real empty and failed states", () => {
  const requiredCopy = ["目前沒有未結問題", "問題載入失敗", "重新載入"];

  for (const copy of requiredCopy) {
    assert.match(dashboardSource, new RegExp(copy), `missing issue copy: ${copy}`);
  }

  assert.match(dashboardSource, /<TableHeader>/);
  assert.match(dashboardSource, /fetchAllPages/);
});
