
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileUploadDialog } from "./FileUploadDialog";
import { CodeStorageManager } from "./CodeStorageManager";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Wrench, 
  Download, 
  Upload, 
  Edit2, 
  Trash2, 
  Plus,
  Code2,
  FileText,
  Settings,
  ChevronDown,
  Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

interface Tool {
  id: string;
  tool_name: string;
  version?: string;
  category: string;
  description?: string;
  file_name?: string;
  file_path?: string;
  file_size?: number;
  is_required: boolean;
  upload_status: string;
  uploaded_by?: string;
  uploaded_at?: string;
  download_count: number;
  sop_content?: string;
}

interface Category {
  value: string;
  label: string;
}

export function ToolsManagement() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [isAddToolOpen, setIsAddToolOpen] = useState(false);
  const [previewTool, setPreviewTool] = useState<Tool | null>(null);
  const [customCategories, setCustomCategories] = useState<Category[]>([
    { value: "driver", label: "驅動程式" },
    { value: "software", label: "軟體工具" },
    { value: "utility", label: "公用程式" },
    { value: "documentation", label: "文件" },
    { value: "other", label: "其他" }
  ]);
  const [newCategory, setNewCategory] = useState("");
  const { toast } = useToast();

  const [newTool, setNewTool] = useState({
    tool_name: "",
    version: "",
    category: "driver",
    description: "",
    is_required: false,
    sop_content: ""
  });

  const loadTools = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('tools_management')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setTools(data || []);
    } catch (error) {
      console.error('Error loading tools:', error);
      toast({
        title: "載入失敗",
        description: "無法載入工具列表",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTools();
  }, []);

  const handleAddTool = async () => {
    if (!newTool.tool_name.trim()) {
      toast({
        title: "驗證錯誤",
        description: "請輸入工具名稱",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('tools_management')
        .insert([{
          tool_name: newTool.tool_name,
          version: newTool.version || null,
          category: newTool.category,
          description: newTool.description || null,
          is_required: newTool.is_required,
          upload_status: 'pending',
          sop_content: newTool.sop_content || null
        }]);

      if (error) throw error;

      toast({
        title: "新增成功",
        description: "工具已新增到列表中",
      });

      setNewTool({
        tool_name: "",
        version: "",
        category: "driver",
        description: "",
        is_required: false,
        sop_content: ""
      });

      loadTools();
    } catch (error) {
      console.error('Error adding tool:', error);
      toast({
        title: "新增失敗",
        description: "無法新增工具",
        variant: "destructive"
      });
    }
  };

  const handleEditTool = async () => {
    if (!editingTool) return;

    try {
      const { error } = await supabase
        .from('tools_management')
        .update({
          tool_name: editingTool.tool_name,
          version: editingTool.version || null,
          category: editingTool.category,
          description: editingTool.description || null,
          is_required: editingTool.is_required,
          sop_content: editingTool.sop_content || null
        })
        .eq('id', editingTool.id);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "工具資訊已更新",
      });

      setEditingTool(null);
      loadTools();
    } catch (error) {
      console.error('Error updating tool:', error);
      toast({
        title: "更新失敗",
        description: "無法更新工具資訊",
        variant: "destructive"
      });
    }
  };

  const handleDeleteTool = async (id: string) => {
    if (!confirm('確認要刪除這個工具嗎？')) return;

    try {
      const { error } = await supabase
        .from('tools_management')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "工具已刪除",
      });

      loadTools();
    } catch (error) {
      console.error('Error deleting tool:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除工具",
        variant: "destructive"
      });
    }
  };

  const addCustomCategory = () => {
    if (!newCategory.trim()) return;
    
    const categoryValue = newCategory.toLowerCase().replace(/\s+/g, '_');
    const newCat = { value: categoryValue, label: newCategory.trim() };
    
    if (customCategories.some(cat => cat.value === categoryValue)) {
      toast({
        title: "分類已存在",
        description: "此分類名稱已存在",
        variant: "destructive"
      });
      return;
    }

    setCustomCategories([...customCategories, newCat]);
    setNewCategory("");
    toast({
      title: "分類新增成功",
      description: `新增分類: ${newCategory}`,
    });
  };

  const handleDownload = async (tool: Tool) => {
    if (!tool.file_path) {
      toast({
        title: "下載失敗",
        description: "檔案路徑不存在",
        variant: "destructive"
      });
      return;
    }

    try {
      // 增加下載次數
      await supabase
        .from('tools_management')
        .update({ download_count: tool.download_count + 1 })
        .eq('id', tool.id);

      // 實際下載邏輯會依據檔案儲存方式實現
      toast({
        title: "下載開始",
        description: `開始下載 ${tool.tool_name}`,
      });

      loadTools();
    } catch (error) {
      console.error('Error downloading tool:', error);
      toast({
        title: "下載失敗",
        description: "無法下載檔案",
        variant: "destructive"
      });
    }
  };

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.tool_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || tool.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded': return 'bg-success text-success-foreground';
      case 'pending': return 'bg-warning text-warning-foreground';
      case 'failed': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'uploaded': return '已上傳';
      case 'pending': return '待上傳';
      case 'failed': return '上傳失敗';
      default: return '未知';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Wrench className="h-6 w-6" />
        <h1 className="text-2xl font-bold">工具管理</h1>
      </div>

      <Tabs defaultValue="tools" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tools" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            工具列表
          </TabsTrigger>
          <TabsTrigger value="code" className="flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            程式碼儲存
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="tools" className="space-y-6">
          {/* 新增工具表單 */}
          <Collapsible open={isAddToolOpen} onOpenChange={setIsAddToolOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plus className="h-5 w-5" />
                      新增工具
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isAddToolOpen ? 'rotate-180' : ''}`} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tool_name">工具名稱 *</Label>
                      <Input
                        id="tool_name"
                        value={newTool.tool_name}
                        onChange={(e) => setNewTool({...newTool, tool_name: e.target.value})}
                        placeholder="輸入工具名稱"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="version">版本</Label>
                      <Input
                        id="version"
                        value={newTool.version}
                        onChange={(e) => setNewTool({...newTool, version: e.target.value})}
                        placeholder="v1.0.0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">分類</Label>
                      <Select value={newTool.category} onValueChange={(value) => setNewTool({...newTool, category: value})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {customCategories.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="description">描述</Label>
                      <Textarea
                        id="description"
                        value={newTool.description}
                        onChange={(e) => setNewTool({...newTool, description: e.target.value})}
                        placeholder="工具描述和使用說明"
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="is_required"
                        checked={newTool.is_required}
                        onCheckedChange={(checked) => setNewTool({...newTool, is_required: checked})}
                      />
                      <Label htmlFor="is_required">必要工具</Label>
                    </div>
                  </div>
                  
                  {/* SOP 欄位 */}
                  <div className="space-y-2 mt-4">
                    <Label>SOP 操作說明</Label>
                    <RichTextEditor
                      content={newTool.sop_content}
                      onChange={(content) => setNewTool({...newTool, sop_content: content})}
                      placeholder="撰寫詳細的操作流程說明，可包含圖片、連結等..."
                      className="min-h-[300px]"
                    />
                  </div>
                  
                  {/* 自訂分類區域 */}
                  <div className="border-t pt-4 mt-4">
                    <Label className="text-sm font-medium">自訂分類</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="輸入新分類名稱"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="flex-1"
                      />
                      <Button onClick={addCustomCategory} size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        新增分類
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-4">
                    <Button onClick={handleAddTool}>
                      <Plus className="h-4 w-4 mr-2" />
                      新增工具
                    </Button>
                    <Button variant="outline" onClick={() => setIsUploadDialogOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      上傳檔案
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* 篩選器 */}
          <div className="flex gap-4 items-center">
            <Input
              placeholder="搜尋工具..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="分類" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有分類</SelectItem>
                {customCategories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 工具列表 */}
          <Card>
            <CardHeader>
              <CardTitle>工具列表</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">載入中...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>工具名稱</TableHead>
                      <TableHead>版本</TableHead>
                      <TableHead>分類</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead>必要</TableHead>
                      <TableHead>上傳時間</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTools.map((tool) => (
                      <TableRow key={tool.id}>
                        <TableCell className="font-medium">
                          <div>
                            <div>{tool.tool_name}</div>
                            {tool.description && (
                              <div className="text-xs text-muted-foreground">
                                {tool.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{tool.version || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {customCategories.find(cat => cat.value === tool.category)?.label || tool.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(tool.upload_status)}>
                            {getStatusText(tool.upload_status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {tool.is_required ? (
                            <Badge variant="destructive">必要</Badge>
                          ) : (
                            <Badge variant="secondary">選用</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {tool.uploaded_at ? 
                            new Date(tool.uploaded_at).toLocaleDateString('zh-TW') + ' ' + new Date(tool.uploaded_at).toLocaleTimeString('zh-TW') : 
                            '-'
                          }
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewTool(tool)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingTool(tool)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            {tool.upload_status === 'uploaded' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownload(tool)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteTool(tool.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <FileUploadDialog
            isOpen={isUploadDialogOpen}
            onClose={() => setIsUploadDialogOpen(false)}
            onUploadSuccess={loadTools}
          />

          {/* 編輯工具對話框 */}
          {editingTool && (
            <Dialog open={!!editingTool} onOpenChange={() => setEditingTool(null)}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>編輯工具</DialogTitle>
                  <DialogDescription>
                    編輯工具資訊和SOP操作說明
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>工具名稱</Label>
                      <Input
                        value={editingTool.tool_name}
                        onChange={(e) => setEditingTool({...editingTool, tool_name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>版本</Label>
                      <Input
                        value={editingTool.version || ''}
                        onChange={(e) => setEditingTool({...editingTool, version: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>分類</Label>
                      <Select value={editingTool.category} onValueChange={(value) => setEditingTool({...editingTool, category: value})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {customCategories.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>描述</Label>
                    <Textarea
                      value={editingTool.description || ''}
                      onChange={(e) => setEditingTool({...editingTool, description: e.target.value})}
                      rows={3}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={editingTool.is_required}
                      onCheckedChange={(checked) => setEditingTool({...editingTool, is_required: checked})}
                    />
                    <Label>必要工具</Label>
                  </div>
                  
                  {/* SOP 編輯欄位 */}
                  <div className="space-y-2">
                    <Label>SOP 操作說明</Label>
                    <RichTextEditor
                      content={editingTool.sop_content || ''}
                      onChange={(content) => setEditingTool({...editingTool, sop_content: content})}
                      placeholder="撰寫詳細的操作流程說明，可包含圖片、連結等..."
                      className="min-h-[300px]"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingTool(null)}>取消</Button>
                  <Button onClick={handleEditTool}>保存變更</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* 預覽工具對話框 - 仿照程式碼片段管理頁面的預覽方式 */}
          {previewTool && (
            <Dialog open={!!previewTool} onOpenChange={() => setPreviewTool(null)}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>工具詳情預覽</DialogTitle>
                  <DialogDescription>
                    查看工具詳細資訊和SOP操作說明
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">工具名稱</Label>
                      <p className="mt-1 text-sm font-mono bg-muted p-2 rounded border">{previewTool.tool_name}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">版本</Label>
                      <p className="mt-1 text-sm font-mono bg-muted p-2 rounded border">{previewTool.version || '未指定'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">分類</Label>
                      <p className="mt-1 text-sm font-mono bg-muted p-2 rounded border">
                        {customCategories.find(cat => cat.value === previewTool.category)?.label || previewTool.category}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">上傳時間</Label>
                      <p className="mt-1 text-sm font-mono bg-muted p-2 rounded border">
                        {previewTool.uploaded_at ? 
                          new Date(previewTool.uploaded_at).toLocaleDateString('zh-TW') + ' ' + new Date(previewTool.uploaded_at).toLocaleTimeString('zh-TW') : 
                          '未上傳'
                        }
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">描述</Label>
                    <div className="mt-1 p-4 bg-muted rounded border">
                      <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed">
                        {previewTool.description || '無描述'}
                      </pre>
                    </div>
                  </div>

                  {/* SOP 預覽區域 */}
                  {previewTool.sop_content && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">SOP 操作說明</Label>
                      <div className="mt-1 p-4 bg-muted rounded border">
                        <div 
                          className="prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: previewTool.sop_content }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">狀態</Label>
                      <div className="mt-1 p-2 bg-muted rounded border">
                        <div className="flex gap-2">
                          <Badge className={getStatusColor(previewTool.upload_status)}>
                            {getStatusText(previewTool.upload_status)}
                          </Badge>
                          {previewTool.is_required && (
                            <Badge variant="destructive">必要</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {previewTool.file_size && (
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">檔案大小</Label>
                        <p className="mt-1 text-sm font-mono bg-muted p-2 rounded border">
                          {(previewTool.file_size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    )}
                  </div>

                  {previewTool.file_path && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">檔案路徑</Label>
                      <div className="mt-1 p-3 bg-muted rounded border font-mono text-sm break-all">
                        {previewTool.file_path}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPreviewTool(null)}>
                    關閉
                  </Button>
                  {previewTool.upload_status === 'uploaded' && (
                    <Button onClick={() => handleDownload(previewTool)}>
                      <Download className="h-4 w-4 mr-2" />
                      下載工具
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>
        
        <TabsContent value="code">
          <CodeStorageManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
