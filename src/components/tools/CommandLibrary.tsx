import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Terminal,
  Copy,
  Plus,
  Edit2,
  Trash2,
  Search,
  ChevronDown,
  ChevronRight,
  Code2,
  BookOpen,
  Zap,
  Settings,
  Database,
  Network,
  Shield,
  Cpu,
  HardDrive,
  Monitor,
  Package,
  Cloud
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Command {
  id: string;
  name: string;
  command: string;
  description: string;
  category: string;
  platform: string;
  tags: string[];
  examples?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface Category {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
}

const categories: Category[] = [
  { id: "system", name: "系統管理", icon: <Settings className="h-4 w-4" />, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { id: "network", name: "網路相關", icon: <Network className="h-4 w-4" />, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { id: "database", name: "資料庫", icon: <Database className="h-4 w-4" />, color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { id: "security", name: "安全性", icon: <Shield className="h-4 w-4" />, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  { id: "hardware", name: "硬體檢測", icon: <Cpu className="h-4 w-4" />, color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  { id: "storage", name: "儲存管理", icon: <HardDrive className="h-4 w-4" />, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { id: "monitor", name: "監控診斷", icon: <Monitor className="h-4 w-4" />, color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" },
  { id: "package", name: "套件管理", icon: <Package className="h-4 w-4" />, color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200" },
  { id: "cloud", name: "雲端服務", icon: <Cloud className="h-4 w-4" />, color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  { id: "other", name: "其他", icon: <Code2 className="h-4 w-4" />, color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" }
];

const platforms = [
  { value: "linux", label: "Linux" },
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  { value: "docker", label: "Docker" },
  { value: "universal", label: "通用" }
];

export function CommandLibrary() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["system"]));
  const { toast } = useToast();

  const [newCommand, setNewCommand] = useState({
    name: "",
    command: "",
    description: "",
    category: "system",
    platform: "linux",
    tags: "",
    examples: "",
    notes: ""
  });

  useEffect(() => {
    loadCommands();
  }, []);

  const loadCommands = async () => {
    try {
      setIsLoading(true);
      
      // 從 Supabase 資料庫載入指令
      const { data, error } = await supabase
        .from('command_library')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        setCommands(data);
      } else {
        // 如果資料庫為空，插入預設指令
        const defaultCommands = [
          {
            name: "檢查系統資訊",
            command: "uname -a",
            description: "顯示完整的系統資訊，包括核心版本、主機名稱等",
            category: "system",
            platform: "linux",
            tags: ["系統", "資訊", "核心"],
            examples: "uname -a\n# 輸出範例：Linux hostname 5.4.0-42-generic #46-Ubuntu SMP Fri Jul 10 00:24:02 UTC 2020 x86_64 x86_64 x86_64 GNU/Linux",
            notes: "常用於確認系統版本和架構"
          },
          {
            name: "查看磁碟使用量",
            command: "df -h",
            description: "以人類可讀的格式顯示文件系統的磁碟使用量",
            category: "storage",
            platform: "linux",
            tags: ["磁碟", "儲存", "空間"],
            examples: "df -h\n# 輸出範例：\n# Filesystem      Size  Used Avail Use% Mounted on\n# /dev/sda1        20G   15G  4.2G  79% /",
            notes: "監控磁碟空間使用情況的基本指令"
          },
          {
            name: "查看網路連線",
            command: "netstat -tulpn",
            description: "顯示所有TCP和UDP連接以及監聽的埠",
            category: "network", 
            platform: "linux",
            tags: ["網路", "連線", "埠"],
            examples: "netstat -tulpn\n# 顯示所有網路連線和監聽埠",
            notes: "用於網路問題診斷和安全檢查"
          }
        ];

        const { data: insertedData, error: insertError } = await supabase
          .from('command_library')
          .insert(defaultCommands)
          .select();

        if (insertError) {
          console.error('Error inserting default commands:', insertError);
        } else if (insertedData) {
          setCommands(insertedData);
        }
      }
    } catch (error) {
      console.error('Error loading commands:', error);
      toast({
        title: "載入失敗",
        description: "無法載入指令庫",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCommand = async () => {
    if (!newCommand.name.trim() || !newCommand.command.trim()) {
      toast({
        title: "驗證錯誤",
        description: "請輸入指令名稱和指令內容",
        variant: "destructive"
      });
      return;
    }

    try {
      const commandData = {
        name: newCommand.name.trim(),
        command: newCommand.command.trim(),
        description: newCommand.description.trim(),
        category: newCommand.category,
        platform: newCommand.platform,
        tags: newCommand.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        examples: newCommand.examples.trim() || null,
        notes: newCommand.notes.trim() || null
      };

      const { data, error } = await supabase
        .from('command_library')
        .insert([commandData])
        .select()
        .single();

      if (error) {
        throw error;
      }

      setCommands(prev => [data, ...prev]);

      toast({
        title: "新增成功",
        description: "指令已新增到指令庫",
      });

      setNewCommand({
        name: "",
        command: "",
        description: "",
        category: "system",
        platform: "linux",
        tags: "",
        examples: "",
        notes: ""
      });
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error('Error adding command:', error);
      toast({
        title: "新增失敗",
        description: "無法新增指令到資料庫",
        variant: "destructive"
      });
    }
  };

  const handleEditCommand = async () => {
    if (!editingCommand) return;

    try {
      const updateData = {
        name: editingCommand.name.trim(),
        command: editingCommand.command.trim(),
        description: editingCommand.description.trim(),
        category: editingCommand.category,
        platform: editingCommand.platform,
        tags: editingCommand.tags,
        examples: editingCommand.examples?.trim() || null,
        notes: editingCommand.notes?.trim() || null
      };

      const { error } = await supabase
        .from('command_library')
        .update(updateData)
        .eq('id', editingCommand.id);

      if (error) {
        throw error;
      }

      // 更新本地狀態
      setCommands(prev => prev.map(cmd => 
        cmd.id === editingCommand.id 
          ? { ...editingCommand, ...updateData, updated_at: new Date().toISOString() }
          : cmd
      ));

      toast({
        title: "更新成功",
        description: "指令已更新",
      });

      setEditingCommand(null);
    } catch (error) {
      console.error('Error updating command:', error);
      toast({
        title: "更新失敗",
        description: "無法更新指令",
        variant: "destructive"
      });
    }
  };

  const handleDeleteCommand = async (id: string) => {
    if (!confirm('確認要刪除這個指令嗎？')) return;

    try {
      const { error } = await supabase
        .from('command_library')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      setCommands(prev => prev.filter(cmd => cmd.id !== id));

      toast({
        title: "刪除成功",
        description: "指令已刪除",
      });
    } catch (error) {
      console.error('Error deleting command:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除指令",
        variant: "destructive"
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "複製成功",
        description: "指令已複製到剪貼簿",
      });
    });
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const filteredCommands = commands.filter(command => {
    const matchesSearch = command.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         command.command.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         command.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         command.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = categoryFilter === "all" || command.category === categoryFilter;
    const matchesPlatform = platformFilter === "all" || command.platform === platformFilter;
    return matchesSearch && matchesCategory && matchesPlatform;
  });

  const commandsByCategory = categories.reduce((acc, category) => {
    acc[category.id] = filteredCommands.filter(cmd => cmd.category === category.id);
    return acc;
  }, {} as Record<string, Command[]>);

  return (
    <div className="space-y-6">
      {/* 標題區域 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Terminal className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">指令集管理</h2>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              新增指令
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>新增指令</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">指令名稱 *</Label>
                  <Input
                    id="name"
                    value={newCommand.name}
                    onChange={(e) => setNewCommand({...newCommand, name: e.target.value})}
                    placeholder="例如：檢查系統資訊"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">分類</Label>
                  <Select value={newCommand.category} onValueChange={(value) => setNewCommand({...newCommand, category: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            {cat.icon}
                            {cat.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="platform">平台</Label>
                  <Select value={newCommand.platform} onValueChange={(value) => setNewCommand({...newCommand, platform: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {platforms.map(platform => (
                        <SelectItem key={platform.value} value={platform.value}>
                          {platform.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags">標籤 (用逗號分隔)</Label>
                  <Input
                    id="tags"
                    value={newCommand.tags}
                    onChange={(e) => setNewCommand({...newCommand, tags: e.target.value})}
                    placeholder="例如：系統,資訊,核心"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="command">指令內容 *</Label>
                <Textarea
                  id="command"
                  value={newCommand.command}
                  onChange={(e) => setNewCommand({...newCommand, command: e.target.value})}
                  placeholder="例如：uname -a"
                  rows={3}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">描述</Label>
                <Textarea
                  id="description"
                  value={newCommand.description}
                  onChange={(e) => setNewCommand({...newCommand, description: e.target.value})}
                  placeholder="簡要描述這個指令的功能和用途"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="examples">使用範例</Label>
                <Textarea
                  id="examples"
                  value={newCommand.examples}
                  onChange={(e) => setNewCommand({...newCommand, examples: e.target.value})}
                  placeholder="提供使用範例和預期輸出"
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">備註</Label>
                <Textarea
                  id="notes"
                  value={newCommand.notes}
                  onChange={(e) => setNewCommand({...newCommand, notes: e.target.value})}
                  placeholder="其他注意事項或相關資訊"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleAddCommand}>
                新增指令
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 搜尋和篩選 */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex-1 min-w-64">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="搜尋指令名稱、內容或標籤..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="分類" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有分類</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>
                <div className="flex items-center gap-2">
                  {cat.icon}
                  {cat.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="平台" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有平台</SelectItem>
            {platforms.map(platform => (
              <SelectItem key={platform.value} value={platform.value}>
                {platform.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 統計資訊 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{commands.length}</div>
            <div className="text-sm text-muted-foreground">總指令數</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{new Set(commands.map(c => c.category)).size}</div>
            <div className="text-sm text-muted-foreground">分類數量</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{new Set(commands.map(c => c.platform)).size}</div>
            <div className="text-sm text-muted-foreground">支援平台</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{filteredCommands.length}</div>
            <div className="text-sm text-muted-foreground">搜尋結果</div>
          </div>
        </Card>
      </div>

      {/* 分類展示 */}
      <div className="space-y-4">
        {categories.map(category => {
          const categoryCommands = commandsByCategory[category.id] || [];
          if (categoryCommands.length === 0) return null;

          return (
            <Card key={category.id}>
              <Collapsible 
                open={expandedCategories.has(category.id)} 
                onOpenChange={() => toggleCategory(category.id)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedCategories.has(category.id) ? 
                          <ChevronDown className="h-4 w-4" /> : 
                          <ChevronRight className="h-4 w-4" />
                        }
                        <Badge className={category.color}>
                          {category.icon}
                          <span className="ml-1">{category.name}</span>
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          ({categoryCommands.length} 個指令)
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="space-y-4">
                      {categoryCommands.map(command => (
                        <div key={command.id} className="border border-border rounded-lg p-4 hover:bg-muted/20 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{command.name}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {platforms.find(p => p.value === command.platform)?.label}
                                </Badge>
                              </div>
                              <div className="bg-muted p-3 rounded font-mono text-sm break-all">
                                {command.command}
                              </div>
                              {command.description && (
                                <p className="text-sm text-muted-foreground">{command.description}</p>
                              )}
                              {command.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {command.tags.map(tag => (
                                    <Badge key={tag} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {command.examples && (
                                <details className="text-sm">
                                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                    使用範例
                                  </summary>
                                  <pre className="mt-2 bg-muted p-2 rounded text-xs overflow-x-auto">
                                    {command.examples}
                                  </pre>
                                </details>
                              )}
                              {command.notes && (
                                <p className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded">
                                  💡 {command.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(command.command)}
                                title="複製指令"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingCommand(command)}
                                title="編輯指令"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteCommand(command.id)}
                                title="刪除指令"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {/* 編輯對話框 */}
      {editingCommand && (
        <Dialog open={!!editingCommand} onOpenChange={() => setEditingCommand(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>編輯指令</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">指令名稱 *</Label>
                  <Input
                    id="edit-name"
                    value={editingCommand.name}
                    onChange={(e) => setEditingCommand({...editingCommand, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-category">分類</Label>
                  <Select value={editingCommand.category} onValueChange={(value) => setEditingCommand({...editingCommand, category: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <div className="flex items-center gap-2">
                            {cat.icon}
                            {cat.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-platform">平台</Label>
                  <Select value={editingCommand.platform} onValueChange={(value) => setEditingCommand({...editingCommand, platform: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {platforms.map(platform => (
                        <SelectItem key={platform.value} value={platform.value}>
                          {platform.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-tags">標籤 (用逗號分隔)</Label>
                  <Input
                    id="edit-tags"
                    value={editingCommand.tags.join(', ')}
                    onChange={(e) => setEditingCommand({...editingCommand, tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-command">指令內容 *</Label>
                <Textarea
                  id="edit-command"
                  value={editingCommand.command}
                  onChange={(e) => setEditingCommand({...editingCommand, command: e.target.value})}
                  rows={3}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">描述</Label>
                <Textarea
                  id="edit-description"
                  value={editingCommand.description}
                  onChange={(e) => setEditingCommand({...editingCommand, description: e.target.value})}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-examples">使用範例</Label>
                <Textarea
                  id="edit-examples"
                  value={editingCommand.examples || ''}
                  onChange={(e) => setEditingCommand({...editingCommand, examples: e.target.value})}
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-notes">備註</Label>
                <Textarea
                  id="edit-notes"
                  value={editingCommand.notes || ''}
                  onChange={(e) => setEditingCommand({...editingCommand, notes: e.target.value})}
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingCommand(null)}>
                取消
              </Button>
              <Button onClick={handleEditCommand}>
                更新指令
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 空狀態 */}
      {!isLoading && filteredCommands.length === 0 && (
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">找不到相關指令</h3>
            <p className="text-sm">
              {searchTerm || categoryFilter !== "all" || platformFilter !== "all" 
                ? "嘗試調整搜尋條件或篩選設定" 
                : "還沒有任何指令，點擊上方按鈕新增第一個指令"
              }
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}