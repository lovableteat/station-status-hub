import { useIsDesktopLayout } from "@/hooks/use-mobile";

import { DesktopTestProgressTable } from "./desktop/DesktopTestProgressTable";
import { MobileTestProgressList } from "./mobile/MobileTestProgressList";
import type { TestProgressTableProps } from "./shared/types";

export function TestProgressTable(props: TestProgressTableProps) {
  const isDesktopLayout = useIsDesktopLayout();

  return isDesktopLayout
    ? <DesktopTestProgressTable {...props} />
    : <MobileTestProgressList {...props} />;
}
