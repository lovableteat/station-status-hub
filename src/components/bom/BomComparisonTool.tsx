import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Upload, 
  Download, 
  GitCompare, 
  Trash2, 
  Settings,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BomItem {
  id: string;
  level?: string;
  name?: string;
  mfr?: string;
  mfrPN?: string;
  internalPN?: string;
  qty?: number;
  refDes?: string;
  description?: string;
  supplier?: string;
}

interface ComparisonResult {
  mfrPN: string;
  oldQty: number;
  newQty: number;
  qtyDelta: number;
  diffType: 'add' | 'remove' | 'change' | 'none';
  oldRefDes?: string;
  newRefDes?: string;
  refDesAnalysis?: string;
  description?: string;
}

export function BomComparisonTool() {
  const [oldBom, setOldBom] = useState<BomItem[]>([]);
  const [newBom, setNewBom] = useState<BomItem[]>([]);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");
  const { toast } = useToast();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'old' | 'new') => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 模擬文件解析
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // 這裡應該解析Excel/CSV文件
        toast({
          title: "上傳成功",
          description: `${type === 'old' ? '舊版' : '新版'} BOM 文件已上傳`,
        });
      } catch (error) {
        toast({
          title: "上傳失敗",
          description: "文件格式不正確",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  const handlePasteData = (data: string, type: 'old' | 'new') => {
    try {
      // 解析貼上的表格資料
      const lines = data.trim().split('\n');
      const headers = lines[0].split('\t');
      const items = lines.slice(1).map((line, index) => {
        const values = line.split('\t');
        return {
          id: `${type}-${index}`,
          mfrPN: values[0] || '',
          qty: Number(values[1]) || 0,
          refDes: values[2] || '',
          description: values[3] || ''
        };
      });

      if (type === 'old') {
        setOldBom(items);
      } else {
        setNewBom(items);
      }

      toast({
        title: "資料載入成功",
        description: `已載入 ${items.length} 筆 ${type === 'old' ? '舊版' : '新版'} BOM 資料`,
      });
    } catch (error) {
      toast({
        title: "資料格式錯誤",
        description: "請確認貼上的資料格式正確",
        variant: "destructive"
      });
    }
  };

  const runComparison = async () => {
    setIsComparing(true);
    
    try {
      // 模擬比對邏輯
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const results: ComparisonResult[] = [];
      const allMfrPNs = new Set([
        ...oldBom.map(item => item.mfrPN || ''),
        ...newBom.map(item => item.mfrPN || '')
      ]);

      allMfrPNs.forEach(mfrPN => {
        if (!mfrPN) return;
        
        const oldItem = oldBom.find(item => item.mfrPN === mfrPN);
        const newItem = newBom.find(item => item.mfrPN === mfrPN);
        
        const oldQty = oldItem?.qty || 0;
        const newQty = newItem?.qty || 0;
        const qtyDelta = newQty - oldQty;
        
        let diffType: ComparisonResult['diffType'] = 'none';
        if (!oldItem && newItem) diffType = 'add';
        else if (oldItem && !newItem) diffType = 'remove';
        else if (qtyDelta !== 0) diffType = 'change';
        
        results.push({
          mfrPN,
          oldQty,
          newQty,
          qtyDelta,
          diffType,
          oldRefDes: oldItem?.refDes,
          newRefDes: newItem?.refDes,
          description: newItem?.description || oldItem?.description
        });
      });

      setComparisonResults(results);
      setActiveTab("results");
      
      toast({
        title: "比對完成",
        description: `發現 ${results.filter(r => r.diffType !== 'none').length} 項差異`,
      });
    } catch (error) {
      toast({
        title: "比對失敗",
        description: "系統錯誤，請稍後再試",
        variant: "destructive"
      });
    } finally {
      setIsComparing(false);
    }
  };

  const exportResults = () => {
    // 匯出邏輯
    toast({
      title: "匯出中",
      description: "正在準備下載檔案...",
    });
  };

  const getDiffTypeIcon = (type: string) => {
    switch (type) {
      case 'add': return <Plus className="h-4 w-4 text-green-500" />;
      case 'remove': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'change': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default: return <CheckCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getDiffTypeBadge = (type: string) => {
    const variants = {
      'add': 'default',
      'remove': 'destructive', 
      'change': 'secondary',
      'none': 'outline'
    } as const;
    
    const labels = {
      'add': '新增',
      'remove': '刪除',
      'change': '變更',
      'none': '無變化'
    };
    
    return (
      <Badge variant={variants[type as keyof typeof variants] || 'outline'}>
        {labels[type as keyof typeof labels] || type}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload">資料上傳</TabsTrigger>
          <TabsTrigger value="old-bom">舊版BOM</TabsTrigger>
          <TabsTrigger value="new-bom">新版BOM</TabsTrigger>
          <TabsTrigger value="results">比對結果</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 舊版BOM上傳 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  舊版BOM
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>檔案上傳</Label>
                  <Input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(e) => handleFileUpload(e, 'old')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>或直接貼上資料</Label>
                  <Textarea
                    placeholder="從Excel複製表格資料貼上..."
                    rows={6}
                    onChange={(e) => {
                      if (e.target.value.trim()) {
                        handlePasteData(e.target.value, 'old');
                      }
                    }}
                  />
                </div>
                <Badge variant="outline" className="text-xs">
                  已載入 {oldBom.length} 筆資料
                </Badge>
              </CardContent>
            </Card>

            {/* 新版BOM上傳 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  新版BOM
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>檔案上傳</Label>
                  <Input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(e) => handleFileUpload(e, 'new')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>或直接貼上資料</Label>
                  <Textarea
                    placeholder="從Excel複製表格資料貼上..."
                    rows={6}
                    onChange={(e) => {
                      if (e.target.value.trim()) {
                        handlePasteData(e.target.value, 'new');
                      }
                    }}
                  />
                </div>
                <Badge variant="outline" className="text-xs">
                  已載入 {newBom.length} 筆資料
                </Badge>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center">
            <Button 
              size="lg" 
              onClick={runComparison}
              disabled={isComparing || oldBom.length === 0 || newBom.length === 0}
              className="min-w-48"
            >
              <GitCompare className="h-4 w-4 mr-2" />
              {isComparing ? "比對中..." : "開始比對"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="old-bom">
          <Card>
            <CardHeader>
              <CardTitle>舊版BOM清單</CardTitle>
            </CardHeader>
            <CardContent>
              {oldBom.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800">
                        <th className="border p-2 text-left">Mfr PN</th>
                        <th className="border p-2 text-left">數量</th>
                        <th className="border p-2 text-left">Ref Des</th>
                        <th className="border p-2 text-left">描述</th>
                      </tr>
                    </thead>
                    <tbody>
                      {oldBom.map((item) => (
                        <tr key={item.id}>
                          <td className="border p-2">{item.mfrPN}</td>
                          <td className="border p-2">{item.qty}</td>
                          <td className="border p-2">{item.refDes}</td>
                          <td className="border p-2">{item.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  尚未載入資料
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="new-bom">
          <Card>
            <CardHeader>
              <CardTitle>新版BOM清單</CardTitle>
            </CardHeader>
            <CardContent>
              {newBom.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800">
                        <th className="border p-2 text-left">Mfr PN</th>
                        <th className="border p-2 text-left">數量</th>
                        <th className="border p-2 text-left">Ref Des</th>
                        <th className="border p-2 text-left">描述</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newBom.map((item) => (
                        <tr key={item.id}>
                          <td className="border p-2">{item.mfrPN}</td>
                          <td className="border p-2">{item.qty}</td>
                          <td className="border p-2">{item.refDes}</td>
                          <td className="border p-2">{item.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  尚未載入資料
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>比對結果</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={exportResults}>
                  <Download className="h-4 w-4 mr-2" />
                  匯出Excel
                </Button>
                <Button variant="outline" onClick={exportResults}>
                  <Download className="h-4 w-4 mr-2" />
                  匯出PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {comparisonResults.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800">
                        <th className="border p-2 text-left">Mfr PN</th>
                        <th className="border p-2 text-left">舊數量</th>
                        <th className="border p-2 text-left">新數量</th>
                        <th className="border p-2 text-left">數量差異</th>
                        <th className="border p-2 text-left">差異類型</th>
                        <th className="border p-2 text-left">描述</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonResults.map((result, index) => (
                        <tr key={index} className={
                          result.diffType === 'add' ? 'bg-green-50 dark:bg-green-950' :
                          result.diffType === 'remove' ? 'bg-red-50 dark:bg-red-950' :
                          result.diffType === 'change' ? 'bg-orange-50 dark:bg-orange-950' :
                          ''
                        }>
                          <td className="border p-2">{result.mfrPN}</td>
                          <td className="border p-2">{result.oldQty}</td>
                          <td className="border p-2">{result.newQty}</td>
                          <td className="border p-2">
                            {result.qtyDelta !== 0 && (
                              <span className={result.qtyDelta > 0 ? 'text-green-600' : 'text-red-600'}>
                                {result.qtyDelta > 0 ? '+' : ''}{result.qtyDelta}
                              </span>
                            )}
                          </td>
                          <td className="border p-2">
                            <div className="flex items-center gap-2">
                              {getDiffTypeIcon(result.diffType)}
                              {getDiffTypeBadge(result.diffType)}
                            </div>
                          </td>
                          <td className="border p-2">{result.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  尚未執行比對
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}