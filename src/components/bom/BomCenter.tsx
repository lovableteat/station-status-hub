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
    document.title = "比對中心 - 測試管理系統";
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
    <main className="min-h-screen">
      <header className="container mx-auto px-4 pt-6 pb-4">
        <h1 className="text-3xl font-bold">比對中心</h1>
        <p className="text-muted-foreground mt-1">集中管理BOM與程式碼比對工具，維持一致的站內樣式。</p>
        <link rel="canonical" href="/compare" />
        <meta name="description" content="比對中心，提供BOM表比對、程式碼比對等多種工具，支援多人協作" />
      </header>

      {/* Landing or subpages */}
      {activeTab === 'home' ? (
        <div className="max-w-6xl mx-auto space-y-8">
          {/* 統計信息 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">2</div>
                <div className="text-sm text-blue-700">可用工具</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-green-600 mb-2">24/7</div>
                <div className="text-sm text-green-700">服務可用</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200">
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-purple-600 mb-2">∞</div>
                <div className="text-sm text-purple-700">無限比對</div>
              </CardContent>
            </Card>
          </div>

          {/* 工具卡片 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {tools.map((tool, index) => (
              <Card 
                key={tool.id}
                className={`group cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] 
                  bg-gradient-to-br from-card to-card/80 border-2 hover:border-primary/30
                  ${index === 0 ? 'lg:col-span-1' : 'lg:col-span-1'}`}
                onClick={() => setActiveTab(tool.id as 'bom-comparison' | 'code-comparison')}
              >
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-xl group-hover:bg-primary/20 transition-colors">
                        <tool.icon className="h-8 w-8 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-xl group-hover:text-primary transition-colors">
                          {tool.name}
                        </CardTitle>
                        <Badge variant={tool.status === "active" ? "default" : "secondary"} className="mt-1">
                          {tool.status === "active" ? "可用" : "即將推出"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground leading-relaxed">{tool.description}</p>
                  
                  {/* 使用指南 */}
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      使用指南
                    </h4>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {tool.id === 'bom-comparison' ? (
                        <>
                          <p>• 直接從Excel複製BOM數據並貼上</p>
                          <p>• 系統自動識別並對比差異項目</p>
                          <p>• 支援批量操作和即時協作</p>
                          <p>• 可導出詳細比對報告</p>
                        </>
                      ) : (
                        <>
                          <p>• 貼上新舊版本程式碼進行比對</p>
                          <p>• 支援20+種程式語言語法高亮</p>
                          <p>• 逐行、逐字詳細差異分析</p>
                          <p>• 可導出差異摘要報告</p>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {tool.features.map((feature, index) => (
                      <Badge key={index} variant="outline" className="text-xs hover:bg-primary/10">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                  
                  <Button className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    開始使用 {tool.name}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
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