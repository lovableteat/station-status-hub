
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Code, Plus, Edit2, Trash2, Copy, Eye } from "lucide-react";
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
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLanguage, setFilterLanguage] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    code_content: "",
    language: "javascript",
    category: "utility",
    tags: ""
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
      tags: snippet.tags.join(', ')
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
      tags: ""
    });
    setEditingSnippet(null);
  };

  const filteredSnippets = codeSnippets.filter(snippet => {
    const matchesCategory = filterCategory === "all" || snippet.category === filterCategory;
    const matchesLanguage = filterLanguage === "all" || snippet.language === filterLanguage;
    const matchesSearch = searchTerm === "" || 
      snippet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      snippet.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      snippet.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesCategory && matchesLanguage && matchesSearch;
  });

  const categories = [...new Set(codeSnippets.map(s => s.category))];
  const languages = [...new Set(codeSnippets.map(s => s.language))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          <h2 className="text-xl font-semibold">程式碼儲存列表</h2>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              新增程式碼
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="code_content">程式碼內容 *</Label>
                <Textarea
                  id="code_content"
                  value={formData.code_content}
                  onChange={(e) => setFormData({...formData, code_content: e.target.value})}
                  rows={12}
                  className="font-mono text-sm"
                  required
                />
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

      {/* 篩選器 */}
      <div className="flex gap-4 items-center">
        <Input
          placeholder="搜尋程式碼片段..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
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

      {/* 程式碼片段列表 */}
      {isLoading ? (
        <div className="text-center py-8">載入中...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSnippets.map((snippet) => (
            <Card key={snippet.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{snippet.title}</CardTitle>
                  <div className="flex gap-1">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleCopy(snippet.code_content)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleEdit(snippet)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive"
                      onClick={() => handleDelete(snippet.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <Badge variant="secondary" className="text-xs">
                    {snippet.language}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {snippet.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {snippet.description && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {snippet.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1 mb-3">
                  {snippet.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      #{tag}
                    </Badge>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  更新時間: {new Date(snippet.updated_at).toLocaleDateString('zh-TW')}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 檢視程式碼對話框 */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{viewingSnippet?.title}</DialogTitle>
            {viewingSnippet?.description && (
              <DialogDescription>{viewingSnippet.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 items-center">
              <Badge>{viewingSnippet?.language}</Badge>
              <Badge variant="outline">{viewingSnippet?.category}</Badge>
              {viewingSnippet?.tags.map((tag, index) => (
                <Badge key={index} variant="secondary">#{tag}</Badge>
              ))}
            </div>
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-sm">
                <code>{viewingSnippet?.code_content}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => viewingSnippet && handleCopy(viewingSnippet.code_content)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
