import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardSource = await readFile(
  new URL("../src/components/dashboard/Dashboard.tsx", import.meta.url),
  "utf8",
);

test("dashboard explains why machines need attention and what supervisors can do", () => {
  const requiredCopy = [
    "需關注機台",
    "依測項完成率由低到高",
    "未完成測項",
    "卡關站點",
    "負責人",
    "最近更新",
    "開啟生產看板",
    "查看機台",
  ];

  for (const copy of requiredCopy) {
    assert.match(dashboardSource, new RegExp(copy), `missing clarified copy: ${copy}`);
  }

  assert.doesNotMatch(dashboardSource, /管理層待辦/);
  assert.doesNotMatch(dashboardSource, />查看全部</);
});

test("dashboard separates critical issues and explains the zero state", () => {
  const requiredCopy = ["高風險問題", "目前沒有高風險問題", "查看問題"];

  for (const copy of requiredCopy) {
    assert.match(dashboardSource, new RegExp(copy), `missing issue copy: ${copy}`);
  }

  assert.match(dashboardSource, /onNavigate\?\.\("issues"\)/);
});
