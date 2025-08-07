
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Search, Code2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

interface CodeSnippet {
  id: string;
  title: string;
  description?: string;
  code_content: string;
  language: string;
  category: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export function CodeSnippetManager() {
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<CodeSnippet | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    code_content: "",
    language: "javascript",
    category: "utility",
    tags: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSnippets();
  }, []);

  const loadSnippets = async () => {
    try {
      const { data, error } = await supabase
        .from('code_snippets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSnippets(data || []);
    } catch (error) {
      console.error('Error loading code snippets:', error);
      toast({
        title: "載入失敗",
        description: "無法載入程式碼片段",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "驗證錯誤",
        description: "請輸入標題",
        variant: "destructive"
      });
      return;
    }

    if (!formData.code_content.trim()) {
      toast({
        title: "驗證錯誤",
        description: "請輸入程式碼內容",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const saveData = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        code_content: formData.code_content.trim(),
        language: formData.language,
        category: formData.category,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        updated_at: new Date().toISOString()
      };

      if (editingSnippet) {
        const { error } = await supabase
          .from('code_snippets')
          .update(saveData)
          .eq('id', editingSnippet.id);

        if (error) throw error;

        toast({
          title: "更新成功",
          description: "程式碼片段已成功更新"
        });
      } else {
        const { error } = await supabase
          .from('code_snippets')
          .insert(saveData);

        if (error) throw error;

        toast({
          title: "建立成功",
          description: "程式碼片段已成功建立"
        });
      }

      setIsEditDialogOpen(false);
      resetForm();
      loadSnippets();
    } catch (error) {
      console.error('Error saving code snippet:', error);
      toast({
        title: "保存失敗",
        description: "無法保存程式碼片段",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (snippet: CodeSnippet) => {
    if (!confirm("確定要刪除這個程式碼片段嗎？")) return;

    try {
      const { error } = await supabase
        .from('code_snippets')
        .delete()
        .eq('id', snippet.id);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "程式碼片段已成功刪除"
      });

      loadSnippets();
    } catch (error) {
      console.error('Error deleting code snippet:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除程式碼片段",
        variant: "destructive"
      });
    }
  };

  const openEditDialog = (snippet?: CodeSnippet) => {
    if (snippet) {
      setEditingSnippet(snippet);
      setFormData({
        title: snippet.title,
        description: snippet.description || "",
        code_content: snippet.code_content,
        language: snippet.language,
        category: snippet.category,
        tags: snippet.tags.join(', ')
      });
    } else {
      setEditingSnippet(null);
      resetForm();
    }
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      code_content: "",
      language: "javascript",
      category: "utility",
      tags: ""
    });
    setEditingSnippet(null);
  };

  const filteredSnippets = snippets.filter(snippet => {
    const matchesSearch = snippet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         snippet.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         snippet.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = filterCategory === "all" || snippet.category === filterCategory;
    
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(snippets.map(s => s.category)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">程式碼片段管理</h3>
        <Button onClick={() => openEditDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          新增片段
        </Button>
      </div>

      {/* 搜尋和篩選 */}
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋程式碼片段..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有分類</SelectItem>
            {categories.map(category => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 程式碼片段列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSnippets.map(snippet => (
          <Card key={snippet.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base truncate">{snippet.title}</CardTitle>
                  <CardDescription className="text-sm">
                    {snippet.description || "無描述"}
                  </CardDescription>
                </div>
                <div className="flex gap-2 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(snippet)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(snippet)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Code2 className="h-3 w-3" />
                  <span>{snippet.language}</span>
                  <Badge variant="outline" className="text-xs">
                    {snippet.category}
                  </Badge>
                </div>
                
                <pre className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-24">
                  <code>{snippet.code_content.slice(0, 200)}
                    {snippet.code_content.length > 200 && '...'}
                  </code>
                </pre>
                
                {snippet.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {snippet.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 編輯對話框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSnippet ? '編輯程式碼片段' : '新增程式碼片段'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">標題 *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="請輸入片段標題..."
                disabled={isSubmitting}
              />
            </div>


            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="language">程式語言</Label>
                <Select 
                  value={formData.language} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, language: value }))}
                  disabled={isSubmitting}
                >
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
                    <SelectItem value="sql">SQL</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                    <SelectItem value="css">CSS</SelectItem>
                    <SelectItem value="bash">Bash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category">分類</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utility">工具函數</SelectItem>
                    <SelectItem value="component">元件</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                    <SelectItem value="database">資料庫</SelectItem>
                    <SelectItem value="testing">測試</SelectItem>
                    <SelectItem value="automation">自動化</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="code_content">程式碼內容 *</Label>
              <Textarea
                id="code_content"
                value={formData.code_content}
                onChange={(e) => setFormData(prev => ({ ...prev, code_content: e.target.value }))}
                placeholder="請輸入程式碼..."
                className="min-h-[300px] font-mono"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <Label htmlFor="sop_description">SOP 說明</Label>
              <RichTextEditor
                content={formData.description}
                onChange={(content) => setFormData(prev => ({ ...prev, description: content }))}
                placeholder="請輸入 SOP 操作說明..."
                className="min-h-[150px]"
                disableImageUpload={true}
              />
              <div className="text-xs text-muted-foreground mt-1">
                <strong>支援功能：</strong> 格式化文字、插入連結等
              </div>
            </div>

            <div>
              <Label htmlFor="tags">標籤 (用逗號分隔)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="例如：react, hook, 工具..."
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? '保存中...' : (editingSnippet ? '更新' : '建立')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
