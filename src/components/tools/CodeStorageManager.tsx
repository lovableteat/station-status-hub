
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Code, Plus, Edit2, Trash2, Copy, Eye, ChevronDown, ChevronRight, Search, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CodeSnippet {
  id: string;
  title: string;
  description?: string;
  code_content: string;
  language: string;
  category: string;
  tags: string[];
  sop_content?: string;
  created_at: string;
  updated_at: string;
}

export function CodeStorageManager() {
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<CodeSnippet | null>(null);
  const [viewingSnippet, setViewingSnippet] = useState<CodeSnippet | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLanguage, setFilterLanguage] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    code_content: "",
    language: "javascript",
    category: "utility",
    tags: "",
    sop_content: ""
  });

  const loadCodeSnippets = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('code_snippets')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      // Type the data properly
      const typedData: CodeSnippet[] = (data || []).map(item => ({
        id: item.id,
        title: item.title,
        description: item.description || undefined,
        code_content: item.code_content,
        language: item.language,
        category: item.category,
        tags: item.tags || [],
        sop_content: item.sop_content || undefined,
        created_at: item.created_at,
        updated_at: item.updated_at
      }));
      
      setCodeSnippets(typedData);
    } catch (error) {
      console.error('Error loading code snippets:', error);
      toast({
        title: "載入失敗",
        description: "無法載入程式碼片段",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCodeSnippets();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const snippetData = {
        title: formData.title,
        description: formData.description || null,
        code_content: formData.code_content,
        language: formData.language,
        category: formData.category,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        sop_content: formData.sop_content || null,
      };

      if (editingSnippet) {
        const { error } = await supabase
          .from('code_snippets')
          .update(snippetData)
          .eq('id', editingSnippet.id);

        if (error) throw error;
        
        toast({
          title: "更新成功",
          description: "程式碼片段已更新",
        });
      } else {
        const { error } = await supabase
          .from('code_snippets')
          .insert([snippetData]);

        if (error) throw error;
        
        toast({
          title: "新增成功",
          description: "程式碼片段已新增",
        });
      }

      resetForm();
      setIsDialogOpen(false);
      loadCodeSnippets();
    } catch (error) {
      console.error('Error saving code snippet:', error);
      toast({
        title: "儲存失敗",
        description: "無法儲存程式碼片段",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (snippet: CodeSnippet) => {
    setEditingSnippet(snippet);
    setFormData({
      title: snippet.title,
      description: snippet.description || "",
      code_content: snippet.code_content,
      language: snippet.language,
      category: snippet.category,
      tags: snippet.tags.join(', '),
      sop_content: snippet.sop_content || ""
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確認要刪除這個程式碼片段嗎？')) return;

    try {
      const { error } = await supabase
        .from('code_snippets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "程式碼片段已刪除",
      });

      loadCodeSnippets();
    } catch (error) {
      console.error('Error deleting code snippet:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除程式碼片段",
        variant: "destructive"
      });
    }
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "複製成功",
        description: "程式碼已複製到剪貼簿",
      });
    } catch (error) {
      toast({
        title: "複製失敗",
        description: "無法複製程式碼",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      code_content: "",
      language: "javascript",
      category: "utility",
      tags: "",
      sop_content: ""
    });
    setEditingSnippet(null);
  };

  // 切換行展開狀態

  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const filteredSnippets = codeSnippets.filter(snippet => {
    const matchesCategory = filterCategory === "all" || snippet.category === filterCategory;
    const matchesLanguage = filterLanguage === "all" || snippet.language === filterLanguage;
    
    if (advancedSearch && searchTerm) {
      // 進階搜尋：支援程式碼內容搜尋
      const matchesSearch = searchTerm === "" || 
        snippet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        snippet.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        snippet.code_content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        snippet.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesCategory && matchesLanguage && matchesSearch;
    } else {
      // 一般搜尋：不搜尋程式碼內容
      const matchesSearch = searchTerm === "" || 
        snippet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        snippet.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        snippet.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesCategory && matchesLanguage && matchesSearch;
    }
  });

  const categories = [...new Set(codeSnippets.map(s => s.category))];
  const languages = [...new Set(codeSnippets.map(s => s.language))];

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            <h2 className="text-xl font-semibold">程式碼片段管理</h2>
            <Badge variant="secondary" className="ml-2">
              {filteredSnippets.length} 個片段
            </Badge>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                新增程式碼
              </Button>
            </DialogTrigger>
          <DialogContent 
            className="max-w-4xl max-h-[80vh] overflow-y-auto" 
            onPointerDownOutside={(e) => {
              // 檢查點擊的元素是否為文件上傳相關
              const target = e.target as HTMLElement;
              if (target?.closest('input[type="file"]') || target?.closest('.rich-text-editor')) {
                e.preventDefault();
              }
            }}
            onEscapeKeyDown={(e) => {
              // 檢查是否在編輯器中，如果是則不關閉對話框
              const target = document.activeElement as HTMLElement;
              if (target?.closest('.ProseMirror') || target?.closest('.rich-text-editor')) {
                e.preventDefault();
              }
            }}
            onInteractOutside={(e) => {
              // 檢查交互的元素是否為編輯器相關
              const target = e.target as HTMLElement;
              if (target?.closest('.rich-text-editor') || target?.closest('input[type="file"]') || target?.closest('.lightbox')) {
                e.preventDefault();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editingSnippet ? "編輯程式碼片段" : "新增程式碼片段"}
              </DialogTitle>
              <DialogDescription>
                儲存和管理你的程式碼片段，支援多種程式語言和分類。
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">標題 *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">程式語言</Label>
                  <Select value={formData.language} onValueChange={(value) => setFormData({...formData, language: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="javascript">JavaScript</SelectItem>
                      <SelectItem value="typescript">TypeScript</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                      <SelectItem value="java">Java</SelectItem>
                      <SelectItem value="csharp">C#</SelectItem>
                      <SelectItem value="cpp">C++</SelectItem>
                      <SelectItem value="html">HTML</SelectItem>
                      <SelectItem value="css">CSS</SelectItem>
                      <SelectItem value="sql">SQL</SelectItem>
                      <SelectItem value="bash">Bash</SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">分類</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utility">工具函數</SelectItem>
                      <SelectItem value="component">元件</SelectItem>
                      <SelectItem value="algorithm">演算法</SelectItem>
                      <SelectItem value="api">API</SelectItem>
                      <SelectItem value="database">資料庫</SelectItem>
                      <SelectItem value="config">設定</SelectItem>
                      <SelectItem value="template">範本</SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags">標籤 (用逗號分隔)</Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData({...formData, tags: e.target.value})}
                    placeholder="react, hook, utility"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">描述</Label>
                <RichTextEditor
                  content={formData.description}
                  onChange={(content) => setFormData({...formData, description: content})}
                  placeholder="請輸入程式碼片段的描述..."
                  className="min-h-[80px]"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="code_content">程式碼內容 *</Label>
                <textarea
                  id="code_content"
                  value={formData.code_content}
                  onChange={(e) => setFormData({...formData, code_content: e.target.value})}
                  rows={12}
                  className="w-full px-3 py-2 border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono text-sm resize-y"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sop_content">SOP 操作說明</Label>
                <RichTextEditor
                  content={formData.sop_content}
                  onChange={(content) => setFormData({...formData, sop_content: content})}
                  placeholder="請輸入詳細的SOP操作說明，包含：&#10;1. 使用前準備&#10;2. 操作步驟詳解&#10;3. 注意事項&#10;4. 常見問題處理&#10;5. 相關資源連結"
                  className="min-h-[200px]"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  <strong>建議包含以下內容：</strong>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>使用前的環境準備與相依性檢查</li>
                    <li>詳細的操作步驟說明（含截圖或範例）</li>
                    <li>重要的注意事項與限制條件</li>
                    <li>常見錯誤的排除方法</li>
                    <li>相關文件或資源的連結</li>
                  </ul>
                </div>
              </div>
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit">
                  {editingSnippet ? "更新" : "新增"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

        {/* 進階搜尋和篩選器 */}
        <div className="space-y-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[300px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={advancedSearch ? "搜尋標題、描述、標籤或程式碼內容..." : "搜尋標題、描述、標籤..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value.trim().slice(0, 100))}
                className="flex-1"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={advancedSearch ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAdvancedSearch(!advancedSearch)}
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {advancedSearch ? "關閉進階搜尋" : "開啟進階搜尋 (包含程式碼內容)"}
                </TooltipContent>
              </Tooltip>
            </div>
            
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="分類" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有分類</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterLanguage} onValueChange={setFilterLanguage}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="語言" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有語言</SelectItem>
                {languages.map(language => (
                  <SelectItem key={language} value={language}>{language}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {searchTerm && (
            <div className="text-sm text-muted-foreground">
              找到 {filteredSnippets.length} 個匹配的程式碼片段
              {advancedSearch && " (包含程式碼內容搜尋)"}
            </div>
          )}
        </div>

        {/* 表格式程式碼片段列表 */}
        {isLoading ? (
          <div className="text-center py-8">載入中...</div>
        ) : filteredSnippets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? "沒有找到匹配的程式碼片段" : "還沒有程式碼片段，點擊上方按鈕新增第一個"}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="min-w-[200px]">標題</TableHead>
                  <TableHead className="w-[100px]">語言</TableHead>
                  <TableHead className="w-[120px]">分類</TableHead>
                  <TableHead className="w-[200px]">標籤</TableHead>
                  <TableHead className="w-[120px]">更新時間</TableHead>
                  <TableHead className="w-[160px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSnippets.map((snippet) => (
                  <>
                    <TableRow key={snippet.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => toggleRowExpansion(snippet.id)}
                        >
                          {expandedRows.has(snippet.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>
                          <div className="font-semibold">{snippet.title}</div>
                          {snippet.description && (
                            <div className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {snippet.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {snippet.language}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {snippet.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {snippet.tags.slice(0, 3).map((tag, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              #{tag}
                            </Badge>
                          ))}
                          {snippet.tags.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{snippet.tags.length - 3}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(snippet.updated_at).toLocaleDateString('zh-TW', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => {
                                  setViewingSnippet(snippet);
                                  setIsViewDialogOpen(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>檢視程式碼</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleCopy(snippet.code_content)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>複製程式碼</TooltipContent>
                          </Tooltip>
                          
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleEdit(snippet)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>編輯</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive"
                                onClick={() => handleDelete(snippet.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>刪除</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                    
                    {/* 展開的程式碼內容 */}
                    {expandedRows.has(snippet.id) && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30 p-0">
                          <Collapsible open={true}>
                            <CollapsibleContent>
                              <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium text-sm">程式碼內容</h4>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleCopy(snippet.code_content)}
                                    >
                                      <Copy className="h-4 w-4 mr-1" />
                                      快速複製
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setViewingSnippet(snippet);
                                        setIsViewDialogOpen(true);
                                      }}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      全螢幕檢視
                                    </Button>
                                  </div>
                                </div>
                                <div className="relative">
                                  <pre className="bg-background border rounded-lg p-3 overflow-auto max-h-80 text-sm">
                                    <code className="language-{snippet.language}">
                                      {snippet.code_content}
                                    </code>
                                  </pre>
                                </div>
                                {snippet.tags.length > 3 && (
                                  <div className="flex flex-wrap gap-1">
                                    <span className="text-sm text-muted-foreground mr-2">所有標籤:</span>
                                    {snippet.tags.map((tag, index) => (
                                      <Badge key={index} variant="secondary" className="text-xs">
                                        #{tag}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 檢視程式碼對話框 */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                {viewingSnippet?.title}
              </DialogTitle>
              {viewingSnippet?.description && (
                <DialogDescription>{viewingSnippet.description}</DialogDescription>
              )}
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2 items-center flex-wrap">
                <Badge>{viewingSnippet?.language}</Badge>
                <Badge variant="outline">{viewingSnippet?.category}</Badge>
                {viewingSnippet?.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary">#{tag}</Badge>
                ))}
                <div className="ml-auto text-sm text-muted-foreground">
                  更新於 {viewingSnippet && new Date(viewingSnippet.updated_at).toLocaleString('zh-TW')}
                </div>
              </div>
              <div className="relative">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">程式碼內容</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => viewingSnippet && handleCopy(viewingSnippet.code_content)}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      複製程式碼
                    </Button>
                  </div>
                </div>
                <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[60vh] text-sm border">
                  <code className="language-{viewingSnippet?.language}">
                    {viewingSnippet?.code_content}
                  </code>
                </pre>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}
