import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileText, 
  Code, 
  Upload, 
  Download, 
  GitCompare,
  Settings,
  History,
  Users
} from "lucide-react";
import { BomComparisonTool } from "./BomComparisonTool";
import { CodeComparisonTool } from "./CodeComparisonTool";

export function BomCenter() {
  const [activeTab, setActiveTab] = useState<'home' | 'bom-comparison' | 'code-comparison'>('home');

  useEffect(() => {
    document.title = "BOM比對中心 - 測試管理系統";
  }, []);

  const tools = [
    {
      id: "bom-comparison",
      name: "BOM比對工具",
      description: "比較新舊BOM表，快速找出元件差異、數量變更和位置異動",
      icon: FileText,
      features: ["支援Excel直接複製貼上", "自動比對元件差異", "一鍵下載報表", "多人協作"],
      status: "active"
    },
    {
      id: "code-comparison", 
      name: "程式碼比對工具",
      description: "比較兩組程式碼，高亮顯示差異內容",
      icon: Code,
      features: ["語法高亮", "並排比較", "差異統計", "支援多種語言"],
      status: "active"
    }
  ];

  return (
    <main className="min-h-screen bg-background p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">比對中心</h1>
        <p className="text-muted-foreground">集中管理所有比對工具，提升效率與準確性</p>
        <link rel="canonical" href="/compare" />
        <meta name="description" content="比對中心，提供BOM表比對、程式碼比對等多種工具，支援多人協作" />
      </header>

      {/* Landing or subpages */}
      {activeTab === 'home' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {tools.map((tool) => (
            <Card 
              key={tool.id}
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg`}
              onClick={() => setActiveTab(tool.id as 'bom-comparison' | 'code-comparison')}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <tool.icon className="h-6 w-6 text-primary" />
                    <CardTitle className="text-lg">{tool.name}</CardTitle>
                  </div>
                  <Badge variant={tool.status === "active" ? "default" : "secondary"}>
                    {tool.status === "active" ? "可用" : "即將推出"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{tool.description}</p>
                <div className="flex flex-wrap gap-1">
                  {tool.features.map((feature, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {activeTab === 'bom-comparison' && (
        <Card className="border-none shadow-none bg-transparent">
          <CardContent className="p-0 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">BOM比對工具</h2>
              <Button variant="outline" onClick={() => setActiveTab('home')}>返回比對中心</Button>
            </div>
            <BomComparisonTool />
          </CardContent>
        </Card>
      )}

      {activeTab === 'code-comparison' && (
        <Card className="border-none shadow-none bg-transparent">
          <CardContent className="p-0 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">程式碼比對工具</h2>
              <Button variant="outline" onClick={() => setActiveTab('home')}>返回比對中心</Button>
            </div>
            <CodeComparisonTool />
          </CardContent>
        </Card>
      )}
    </main>
  );
}

export default BomCenter;