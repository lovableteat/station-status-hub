import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readContract(relativePath) {
  try {
    return await readFile(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      assert.fail(`missing required contract document: ${relativePath}`);
    }
    throw error;
  }
}

function assertContainsAll(source, requiredCopy, contractName) {
  for (const copy of requiredCopy) {
    assert.ok(
      source.includes(copy),
      `${contractName} must include: ${copy}`,
    );
  }
}

test("AGENTS defines the durable filterable data-list contract", async () => {
  const agents = await readContract("../AGENTS.md");

  assertContainsAll(
    agents,
    [
      "持久篩選列",
      "緊接在資料結果區正上方",
      "作用中的篩選條件必須永遠可見",
      "個別清除",
      "全部清除",
      "URL query parameters",
      "同一組篩選 UI",
      "搜尋 → 站點 → 狀態 → 負責人類欄位",
      "保留表格、header 與欄位結構",
      "目前篩選條件沒有符合的機台",
      "次要操作必須與持久篩選列分開",
      "行動版可以收合次要排序與工具",
      "不得收合作用中的篩選條件",
    ],
    "AGENTS.md",
  );
});

test("workspace audit names every current workspace and its list alignment targets", async () => {
  const audit = await readContract("../docs/filter-ui-audit.md");

  assertContainsAll(
    audit,
    [
      "應立即對齊",
      "機台維修紀錄中心",
      "料號申請",
      "Data-center",
      "PCB Designer",
      "後台管理",
      "資料查詢空間",
      "績效考核系統",
      "TestTracker.tsx",
      "ProductionMonitor.tsx",
      "IssueTracker.tsx",
      "ToolsManagement.tsx",
      "TestPlanWorkspace.tsx",
      "MaterialRequestPage.tsx",
      "PcbLeftRail.tsx",
      "UserManagement.tsx",
      "ApiDataTable.tsx",
      "ApiChatConsole.tsx",
      "PerformanceAppraisalPage.tsx",
    ],
    "docs/filter-ui-audit.md",
  );
});

test("workspace audit records justified domain-control exceptions", async () => {
  const audit = await readContract("../docs/filter-ui-audit.md");

  assertContainsAll(
    audit,
    [
      "允許保留差異",
      "FlowInfo.tsx",
      "PcbCanvas.tsx",
      "PcbToolbar.tsx",
      "DeploymentPlanningCenter.tsx",
      "畫布",
      "圖層",
      "模型",
      "空間操作",
      "相容性",
      "不是資料結果篩選",
    ],
    "docs/filter-ui-audit.md",
  );
});
