import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Download, Wrench, Upload, FileText, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FileUploadDialog } from "./FileUploadDialog";

interface Tool {
  id: string;
  tool_name: string;
  category: string;
  version?: string;
  description?: string;
  file_name?: string;
  file_path?: string;
  file_size?: number;
  is_required: boolean;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export function ToolsManagement() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all-categories");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    try {
      const { data, error } = await supabase
        .from('tools_management')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // If no data from database, use mock data
      if (!data || data.length === 0) {
        const mockTools: Tool[] = [
          {
            id: "1",
            tool_name: "測試軟體 v2.1",
            category: "software",
            version: "2.1.0",
            description: "GB300 系統測試專用軟體",
            file_name: "test_software_v2.1.exe",
            file_size: 45600000,
            is_required: true,
            download_count: 25,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: "2",
            tool_name: "硬體驅動程式",
            category: "driver",
            version: "1.5.3",
            description: "通訊介面驅動程式",
            file_name: "comm_driver_v1.5.3.zip",
            file_size: 12800000,
            is_required: true,
            download_count: 18,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: "3",
            tool_name: "配置檔案模板",
            category: "config",
            version: "1.0.0",
            description: "標準配置檔案模板",
            file_name: "config_template.json",
            file_size: 2048,
            is_required: false,
            download_count: 12,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ];
        setTools(mockTools);
      } else {
        setTools(data);
      }
      
      setIsLoading(false);
    } catch (error) {
      toast({
        title: "載入失敗",
        description: "無法載入工具列表",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'software': return '軟體';
      case 'driver': return '驅動程式';
      case 'config': return '配置檔案';
      case 'document': return '文件';
      default: return category;
    }
  };

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.tool_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !filterCategory || filterCategory === "all-categories" || tool.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(tools.map(t => t.category))];

  const handleDownload = async (tool: Tool) => {
    try {
      if (tool.file_path) {
        // Create a temporary link to download the file
        const link = document.createElement('a');
        link.href = tool.file_path;
        link.download = tool.file_name || tool.tool_name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Update download count
        await supabase
          .from('tools_management')
          .update({ download_count: tool.download_count + 1 })
          .eq('id', tool.id);
        
        toast({
          title: "開始下載",
          description: `正在下載 ${tool.tool_name}`
        });
        
        loadTools(); // Refresh the list
      } else {
        toast({
          title: "下載失敗",
          description: "檔案路徑不存在",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "下載失敗",
        description: "無法下載檔案",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (toolId: string) => {
    try {
      await supabase
        .from('tools_management')
        .delete()
        .eq('id', toolId);
      
      toast({
        title: "刪除成功",
        description: "工具已刪除"
      });
      
      loadTools();
    } catch (error) {
      toast({
        title: "刪除失敗",
        description: "無法刪除工具",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">工具管理</h1>
          <p className="text-muted-foreground">設備資源與工具檔案管理系統</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          新增工具
        </Button>
        
        <FileUploadDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onSuccess={loadTools}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜尋工具名稱或描述..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="選擇類別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-categories">全部類別</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {getCategoryLabel(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tools Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            工具列表
            <Badge variant="outline" className="ml-auto">
              {filteredTools.length} 個工具
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>工具名稱</TableHead>
                <TableHead>類別</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>描述</TableHead>
                <TableHead>檔案大小</TableHead>
                <TableHead>必要性</TableHead>
                <TableHead>下載次數</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTools.map((tool) => (
                <TableRow key={tool.id}>
                  <TableCell className="font-medium">{tool.tool_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {getCategoryLabel(tool.category)}
                    </Badge>
                  </TableCell>
                  <TableCell>{tool.version || '-'}</TableCell>
                  <TableCell className="max-w-48 truncate">
                    {tool.description || '-'}
                  </TableCell>
                  <TableCell>{formatFileSize(tool.file_size)}</TableCell>
                  <TableCell>
                    <Badge className={tool.is_required ? 'bg-danger text-danger-foreground' : 'bg-muted text-muted-foreground'}>
                      {tool.is_required ? '必要' : '選用'}
                    </Badge>
                  </TableCell>
                  <TableCell>{tool.download_count}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDownload(tool)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDelete(tool.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {filteredTools.length === 0 && (
            <div className="text-center py-8">
              <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">沒有找到相關工具</h3>
              <p className="text-muted-foreground">請調整搜尋條件或新增新的工具</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}