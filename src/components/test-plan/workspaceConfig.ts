import type { TestPlanWorkspaceKind } from "./types";

export interface TestPlanWorkspaceConfig {
  moduleId: "test-plan" | "bom-management";
  workspaceKind: TestPlanWorkspaceKind;
  title: string;
  description: string;
  spaceLabel: string;
  createSpaceLabel: string;
}

export const TEST_PLAN_WORKSPACE_CONFIG: TestPlanWorkspaceConfig = {
  moduleId: "test-plan",
  workspaceKind: "test-plan",
  title: "Test_Plan",
  description:
    "集中管理電路板與工程資料：測試計畫、機構圖、PCB、韌體、程式碼、量測紀錄與 Office 檔案",
  spaceLabel: "資料空間",
  createSpaceLabel: "新增空間",
};

export const BOM_MANAGEMENT_WORKSPACE_CONFIG: TestPlanWorkspaceConfig = {
  moduleId: "bom-management",
  workspaceKind: "bom-management",
  title: "BOM 資料管理",
  description:
    "集中管理 BOM 清單、供應商資料、替代料、料況追蹤與相關 Excel 文件，資料與 Test_Plan 分開保存。",
  spaceLabel: "BOM 空間",
  createSpaceLabel: "新增 BOM 空間",
};
