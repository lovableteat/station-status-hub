import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Cloud,
  Code2,
  Copy,
  Cpu,
  Database,
  Edit2,
  HardDrive,
  Loader2,
  Monitor,
  Network,
  Package,
  Plus,
  Search,
  Settings,
  Shield,
  Terminal,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

interface CommandDraft {
  name: string;
  command: string;
  description: string;
  category: string;
  platform: string;
  tags: string;
  examples: string;
  notes: string;
}

const EMPTY_DRAFT: CommandDraft = {
  name: "",
  command: "",
  description: "",
  category: "system",
  platform: "linux",
  tags: "",
  examples: "",
  notes: "",
};

const categories = [
  { id: "system", name: "系統管理", icon: Settings },
  { id: "network", name: "網路相關", icon: Network },
  { id: "database", name: "資料庫", icon: Database },
  { id: "security", name: "安全性", icon: Shield },
  { id: "hardware", name: "硬體檢測", icon: Cpu },
  { id: "storage", name: "儲存管理", icon: HardDrive },
  { id: "monitor", name: "監控診斷", icon: Monitor },
  { id: "package", name: "套件管理", icon: Package },
  { id: "cloud", name: "雲端服務", icon: Cloud },
  { id: "other", name: "其他", icon: Code2 },
] as const;

const platforms = [
  { value: "linux", label: "Linux" },
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  { value: "docker", label: "Docker" },
  { value: "universal", label: "通用" },
] as const;

const DEFAULT_COMMANDS = [
  {
    name: "檢查系統資訊",
    command: "uname -a",
    description: "顯示完整的系統資訊，包括核心版本、主機名稱等",
    category: "system",
    platform: "linux",
    tags: ["系統", "資訊", "核心"],
    examples: "uname -a",
    notes: "常用於確認系統版本和架構",
  },
  {
    name: "查看磁碟使用量",
    command: "df -h",
    description: "以人類可讀的格式顯示文件系統的磁碟使用量",
    category: "storage",
    platform: "linux",
    tags: ["磁碟", "儲存", "空間"],
    examples: "df -h",
    notes: "監控磁碟空間使用情況的基本指令",
  },
  {
    name: "查看網路連線",
    command: "netstat -tulpn",
    description: "顯示所有 TCP 和 UDP 連接以及監聽的埠",
    category: "network",
    platform: "linux",
    tags: ["網路", "連線", "埠"],
    examples: "netstat -tulpn",
    notes: "用於網路問題診斷和安全檢查",
  },
];

function mapCommand(item: {
  id: string;
  name: string;
  command: string;
  description: string | null;
  category: string;
  platform: string;
  tags: string[] | null;
  examples: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): Command {
  return {
    id: item.id,
    name: item.name,
    command: item.command,
    description: item.description || "",
    category: item.category,
    platform: item.platform,
    tags: item.tags || [],
    examples: item.examples || undefined,
    notes: item.notes || undefined,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

export function CommandLibrary() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);
  const [draft, setDraft] = useState<CommandDraft>(EMPTY_DRAFT);
  const { toast } = useToast();

  const loadCommands = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("command_library")
        .select("*")
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;

      let nextCommands = (data || []).map(mapCommand);
      if (!nextCommands.length) {
        const { data: inserted, error: insertError } = await supabase
          .from("command_library")
          .insert(DEFAULT_COMMANDS)
          .select();
        if (insertError) throw insertError;
        nextCommands = (inserted || []).map(mapCommand);
      }

      setCommands(nextCommands);
      setSelectedCommand((current) =>
        nextCommands.find((command) => command.id === current?.id) || nextCommands[0] || null,
      );
    } catch (error) {
      console.error("Error loading commands:", error);
      toast({ title: "載入失敗", description: "無法載入指令庫", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadCommands();
  }, [loadCommands]);

  const openEditor = (command?: Command) => {
    setEditingCommand(command || null);
    setDraft(command ? {
      name: command.name,
      command: command.command,
      description: command.description,
      category: command.category,
      platform: command.platform,
      tags: command.tags.join(", "),
      examples: command.examples || "",
      notes: command.notes || "",
    } : EMPTY_DRAFT);
    setIsDialogOpen(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.command.trim()) {
      toast({ title: "資料不完整", description: "請輸入指令名稱與內容", variant: "destructive" });
      return;
    }

    const payload = {
      name: draft.name.trim(),
      command: draft.command.trim(),
      description: draft.description.trim(),
      category: draft.category,
      platform: draft.platform,
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      examples: draft.examples.trim() || null,
      notes: draft.notes.trim() || null,
    };

    try {
      if (editingCommand) {
        const { error } = await supabase.from("command_library").update(payload).eq("id", editingCommand.id);
        if (error) throw error;
        toast({ title: "更新成功", description: "指令內容已儲存" });
      } else {
        const { error } = await supabase.from("command_library").insert([payload]);
        if (error) throw error;
        toast({ title: "新增成功", description: "指令已加入共用庫" });
      }

      setIsDialogOpen(false);
      setEditingCommand(null);
      setDraft(EMPTY_DRAFT);
      await loadCommands();
    } catch (error) {
      console.error("Error saving command:", error);
      toast({ title: "儲存失敗", description: "無法儲存指令", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("確認要刪除這個指令嗎？")) return;
    try {
      const { error } = await supabase.from("command_library").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "刪除成功", description: "指令已刪除" });
      await loadCommands();
    } catch (error) {
      console.error("Error deleting command:", error);
      toast({ title: "刪除失敗", description: "無法刪除指令", variant: "destructive" });
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "已複製", description: "指令已複製到剪貼簿" });
    } catch {
      toast({ title: "複製失敗", description: "無法存取剪貼簿", variant: "destructive" });
    }
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredCommands = commands.filter((command) => {
    const searchable = [command.name, command.command, command.description, command.tags.join(" ")].join(" ").toLowerCase();
    return (categoryFilter === "all" || command.category === categoryFilter)
      && (platformFilter === "all" || command.platform === platformFilter)
      && (!normalizedSearch || searchable.includes(normalizedSearch));
  });

  const activeCommand = filteredCommands.find((command) => command.id === selectedCommand?.id)
    || filteredCommands[0]
    || null;
  const selectedCategory = categories.find((category) => category.id === activeCommand?.category);
  const SelectedCategoryIcon = selectedCategory?.icon || Code2;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-[#f3f8fc]">
            <Terminal className="h-4 w-4 text-amber-200" />指令庫
            <Badge variant="outline" className="border-[#5e5632] bg-amber-300/[0.08] text-amber-100">{filteredCommands.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-[#91aabd]">選取指令後可直接複製或編輯，平台、範例與備註集中顯示。</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => setIsDialogOpen(open)}>
          <DialogTrigger asChild><Button size="sm" onClick={() => openEditor()}><Plus className="mr-2 h-4 w-4" />新增指令</Button></DialogTrigger>
          <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto border-[#2a526f] bg-[#071522]">
            <DialogHeader>
              <DialogTitle>{editingCommand ? "編輯指令" : "新增指令"}</DialogTitle>
              <DialogDescription>填寫可辨識的名稱、執行內容與適用平台，方便同仁搜尋與重複使用。</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="command-name">指令名稱 *</Label><Input id="command-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="command-category">分類</Label><Select value={draft.category} onValueChange={(category) => setDraft((current) => ({ ...current, category }))}><SelectTrigger id="command-category"><SelectValue /></SelectTrigger><SelectContent>{categories.map(({ id, name, icon: Icon }) => <SelectItem key={id} value={id}><span className="flex items-center gap-2"><Icon className="h-4 w-4" />{name}</span></SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label htmlFor="command-platform">平台</Label><Select value={draft.platform} onValueChange={(platform) => setDraft((current) => ({ ...current, platform }))}><SelectTrigger id="command-platform"><SelectValue /></SelectTrigger><SelectContent>{platforms.map((platform) => <SelectItem key={platform.value} value={platform.value}>{platform.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label htmlFor="command-tags">標籤</Label><Input id="command-tags" value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="以逗號分隔" /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="command-content">指令內容 *</Label><Textarea id="command-content" value={draft.command} onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))} rows={5} wrap="off" className="whitespace-pre bg-[#06111f] font-mono leading-6" /></div>
              <div className="space-y-2"><Label htmlFor="command-description">用途說明</Label><Textarea id="command-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={3} /></div>
              <div className="space-y-2"><Label htmlFor="command-examples">使用範例</Label><Textarea id="command-examples" value={draft.examples} onChange={(event) => setDraft((current) => ({ ...current, examples: event.target.value }))} rows={5} wrap="off" className="whitespace-pre bg-[#06111f] font-mono leading-6" /></div>
              <div className="space-y-2"><Label htmlFor="command-notes">備註與風險</Label><Textarea id="command-notes" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} /></div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button><Button type="submit"><Check className="mr-2 h-4 w-4" />{editingCommand ? "儲存變更" : "建立指令"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="maintenance-toolbar flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7699ad]" /><Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value.slice(0, 100))} className="h-9 border-[#2a526f] bg-[#06111f] pl-9" placeholder="搜尋名稱、內容、說明或標籤" /></div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">所有分類</SelectItem>{categories.map(({ id, name }) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
        <Select value={platformFilter} onValueChange={setPlatformFilter}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">所有平台</SelectItem>{platforms.map((platform) => <SelectItem key={platform.value} value={platform.value}>{platform.label}</SelectItem>)}</SelectContent></Select>
      </div>

      <div data-testid="command-library-workspace" className="grid min-h-[520px] overflow-hidden rounded-xl border border-[#2a526f] bg-[#071522] lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.55fr)]">
        <aside className="border-b border-[#2a526f] bg-[#081827] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-[#23445d] px-4 py-3"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fb0c2]">指令清單</span><span className="font-mono text-xs text-amber-200">{filteredCommands.length}</span></div>
          <div className="max-h-[560px] space-y-1 overflow-y-auto p-2">
            {isLoading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#91aabd]"><Loader2 className="h-4 w-4 animate-spin" />載入中</div>}
            {!isLoading && filteredCommands.map((command) => {
              const category = categories.find((item) => item.id === command.category);
              const Icon = category?.icon || Code2;
              return (
                <button key={command.id} type="button" onClick={() => setSelectedCommand(command)} className={cn("w-full rounded-lg border px-3 py-3 text-left transition-colors", activeCommand?.id === command.id ? "border-amber-200/60 bg-amber-300/[0.08]" : "border-transparent hover:border-[#2a526f] hover:bg-[#0b1f31]")}>
                  <div className="flex items-center gap-2"><Icon className="h-4 w-4 shrink-0 text-[#87cce1]" /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#eef8fc]">{command.name}</span><Badge variant="outline" className="border-[#315975] bg-[#091725] text-[10px] text-[#a7d7e8]">{platforms.find((platform) => platform.value === command.platform)?.label || command.platform}</Badge></div>
                  <code className="mt-2 block truncate rounded bg-[#06111f] px-2 py-1.5 text-xs text-[#bbd7e4]">{command.command}</code>
                </button>
              );
            })}
            {!isLoading && filteredCommands.length === 0 && <div className="px-4 py-12 text-center text-sm text-[#7896a8]">找不到符合條件的指令</div>}
          </div>
        </aside>

        <section className="min-w-0 bg-[#06111f]">
          {activeCommand ? (
            <div className="flex h-full min-h-[520px] flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2a526f] bg-[#0b1b2d] px-5 py-4">
                <div className="min-w-0"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200"><SelectedCategoryIcon className="h-4 w-4" />指令預覽</div><h3 className="mt-1 truncate text-lg font-semibold text-[#f3f8fc]">{activeCommand.name}</h3><div className="mt-2 flex flex-wrap gap-1.5"><Badge>{selectedCategory?.name || activeCommand.category}</Badge><Badge variant="outline">{platforms.find((platform) => platform.value === activeCommand.platform)?.label || activeCommand.platform}</Badge>{activeCommand.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div></div>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void copyToClipboard(activeCommand.command)}><Copy className="mr-2 h-4 w-4" />複製</Button><Button size="sm" onClick={() => openEditor(activeCommand)}><Edit2 className="mr-2 h-4 w-4" />編輯</Button><Button size="sm" variant="destructive" onClick={() => void handleDelete(activeCommand.id)}><Trash2 className="mr-2 h-4 w-4" />刪除</Button></div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
                <div><div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7ea3b8]">執行內容</div><pre className="overflow-auto whitespace-pre rounded-xl border border-[#3c4c45] bg-[#020913] p-5 font-mono text-sm leading-6 text-[#e8f4d6]"><code>{activeCommand.command}</code></pre></div>
                {activeCommand.description && <PreviewBlock label="用途說明" content={activeCommand.description} />}
                {activeCommand.examples && <PreviewBlock label="使用範例" content={activeCommand.examples} code />}
                {activeCommand.notes && <PreviewBlock label="備註與風險" content={activeCommand.notes} tone="warning" />}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center px-8 text-center"><Terminal className="h-10 w-10 text-[#315975]" /><div className="mt-4 text-base font-semibold text-[#dbeaf2]">尚未選取指令</div><p className="mt-1 text-sm text-[#7896a8]">選取指令後可直接複製或編輯</p></div>
          )}
        </section>
      </div>
    </div>
  );
}

function PreviewBlock({ content, code = false, label, tone = "default" }: { content: string; code?: boolean; label: string; tone?: "default" | "warning" }) {
  return (
    <div className={cn("rounded-xl border p-4", tone === "warning" ? "border-amber-300/25 bg-amber-300/[0.06]" : "border-[#274a64] bg-[#0b1b2d]")}>
      <div className={cn("mb-2 text-xs font-semibold uppercase tracking-[0.12em]", tone === "warning" ? "text-amber-200" : "text-[#7ea3b8]")}>{label}</div>
      {code ? <pre className="overflow-auto whitespace-pre font-mono text-sm leading-6 text-[#d9edf7]">{content}</pre> : <p className="whitespace-pre-line text-sm leading-6 text-[#c8dce8]">{content}</p>}
    </div>
  );
}
