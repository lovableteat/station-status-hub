import React, { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BomCenter() {
  useEffect(() => {
    document.title = "BOM比對中心 - 測試管理系統";
  }, []);

  return (
    <main className="p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">BOM比對中心</h1>
        <p className="text-muted-foreground">上傳與比對BOM，檢查差異與版本一致性</p>
        <link rel="canonical" href="/bom-center" />
        <meta name="description" content="BOM比對中心，管理與比對BOM，檢查差異與版本一致性" />
      </header>
      <section>
        <Card>
          <CardHeader>
            <CardTitle>功能即將推出</CardTitle>
          </CardHeader>
          <CardContent>
            我們已建立頁面與權限控制，之後可擴充上傳/比對邏輯。
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

export default BomCenter;
