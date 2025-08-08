import React, { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProjectManagementCenter() {
  useEffect(() => {
    document.title = "專案管理中心 - 測試管理系統";
  }, []);

  return (
    <main className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">專案管理中心</h1>
        <p className="text-muted-foreground">管理專案進度、任務分工與時程</p>
        <link rel="canonical" href="/project-center" />
        <meta name="description" content="專案管理中心，管理專案進度、任務分工與時程" />
      </header>
      <section>
        <Card>
          <CardHeader>
            <CardTitle>功能即將推出</CardTitle>
          </CardHeader>
          <CardContent>
            我們已建立頁面與權限控制，之後可擴充專案與任務管理。
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

export default ProjectManagementCenter;
