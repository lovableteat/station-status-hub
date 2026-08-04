import { TestPlanWorkspace } from "@/components/test-plan/TestPlanWorkspace";
import { BOM_MANAGEMENT_WORKSPACE_CONFIG } from "@/components/test-plan/workspaceConfig";

export function BomManagementWorkspace() {
  return <TestPlanWorkspace config={BOM_MANAGEMENT_WORKSPACE_CONFIG} />;
}
