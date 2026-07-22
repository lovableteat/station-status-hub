import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Check, Code2, Copy, Download, Edit2, Filter, Loader2, Plus, Search, Trash2 } from "lucide-react";

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
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

const EMPTY_FORM = {
  title: "",
  description: "",
  code_content: "",
  language: "javascript",
  category: "utility",
  tags: "",
  sop_content: "",
};

const LANGUAGE_OPTIONS = [
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["python", "Python"],
  ["java", "Java"],
  ["csharp", "C#"],
  ["cpp", "C++"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["sql", "SQL"],
  ["bash", "Bash"],
  ["other", "其他"],
] as const;

const CATEGORY_OPTIONS = [
  ["utility", "工具函數"],
  ["component", "元件"],
  ["algorithm", "演算法"],
  ["api", "API"],
  ["database", "資料庫"],
  ["config", "設定"],
  ["template", "範本"],
  ["other", "其他"],
] as const;

export function CodeStorageManager() {
  const [codeSnippets, setCodeSnippets] = useState<CodeSnippet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<CodeSnippet | null>(null);
  const [viewingSnippet, setViewingSnippet] = useState<CodeSnippet | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLanguage, setFilterLanguage] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const codeEditorRef = useRef<HTMLTextAreaElement>(null);
  const codeLineNumbersRef = useRef<HTMLPreElement>(null);
  const { toast } = useToast();

  const codeLineCount = formData.code_content.length === 0
    ? 1
    : formData.code_content.split(/\r\n|\r|\n/).length;

  const loadCodeSnippets = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("code_snippets")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const nextSnippets: CodeSnippet[] = (data || []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description || undefined,
        code_content: item.code_content,
        language: item.language,
        category: item.category,
        tags: item.tags || [],
        sop_content: item.sop_content || undefined,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));

      setCodeSnippets(nextSnippets);
      setViewingSnippet((current) =>
        nextSnippets.find((snippet) => snippet.id === current?.id) || nextSnippets[0] || null,
      );
    } catch (error) {
      console.error("Error loading code snippets:", error);
      toast({ title: "載入失敗", description: "無法載入程式碼片段", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadCodeSnippets();
  }, [loadCodeSnippets]);

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingSnippet(null);
  };

  const openEditor = (snippet?: CodeSnippet) => {
    if (snippet) {
      setEditingSnippet(snippet);
      setFormData({
        title: snippet.title,
        description: snippet.description || "",
        code_content: snippet.code_content,
        language: snippet.language,
        category: snippet.category,
        tags: snippet.tags.join(", "),
        sop_content: snippet.sop_content || "",
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const snippetData = {
        title: formData.title.trim(),
        description: formData.description || null,
        code_content: formData.code_content,
        language: formData.language,
        category: formData.category,
        tags: formData.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        sop_content: formData.sop_content || null,
      };

      if (editingSnippet) {
        const { error } = await supabase
          .from("code_snippets")
          .update(snippetData)
          .eq("id", editingSnippet.id);
        if (error) throw error;
        toast({ title: "更新成功", description: "程式碼片段已更新" });
      } else {
        const { error } = await supabase.from("code_snippets").insert([snippetData]);
        if (error) throw error;
        toast({ title: "新增成功", description: "程式碼片段已新增" });
      }

      setIsDialogOpen(false);
      resetForm();
      await loadCodeSnippets();
    } catch (error) {
      console.error("Error saving code snippet:", error);
      toast({ title: "儲存失敗", description: "無法儲存程式碼片段", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("確認要刪除這個程式碼片段嗎？此操作無法復原。")) return;
    try {
      const { error } = await supabase.from("code_snippets").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "刪除成功", description: "程式碼片段已刪除" });
      await loadCodeSnippets();
    } catch (error) {
      console.error("Error deleting code snippet:", error);
      toast({ title: "刪除失敗", description: "無法刪除程式碼片段", variant: "destructive" });
    }
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: "已複製", description: "程式碼已複製到剪貼簿" });
    } catch {
      toast({ title: "複製失敗", description: "無法存取剪貼簿", variant: "destructive" });
    }
  };

  const downloadCodeFile = (snippet: CodeSnippet) => {
    const extensionByLanguage: Record<string, string> = {
      bash: "sh",
      cpp: "cpp",
      csharp: "cs",
      css: "css",
      html: "html",
      java: "java",
      javascript: "js",
      python: "py",
      sql: "sql",
      typescript: "ts",
    };
    const extension = extensionByLanguage[snippet.language] || "txt";
    const safeTitle = snippet.title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "source-code";
    const url = URL.createObjectURL(new Blob([snippet.code_content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeTitle}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ title: "下載程式檔", description: `${anchor.download} 已準備完成` });
  };

  const handleCodeEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const editor = event.currentTarget;
    const { selectionStart, selectionEnd } = editor;
    const nextCode = `${formData.code_content.slice(0, selectionStart)}  ${formData.code_content.slice(selectionEnd)}`;
    setFormData((current) => ({ ...current, code_content: nextCode }));
    requestAnimationFrame(() => codeEditorRef.current?.setSelectionRange(selectionStart + 2, selectionStart + 2));
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredSnippets = codeSnippets.filter((snippet) => {
    const matchesCategory = filterCategory === "all" || snippet.category === filterCategory;
    const matchesLanguage = filterLanguage === "all" || snippet.language === filterLanguage;
    const searchable = [
      snippet.title,
      snippet.description || "",
      snippet.tags.join(" "),
      advancedSearch ? snippet.code_content : "",
    ].join(" ").toLowerCase();
    return matchesCategory && matchesLanguage && (!normalizedSearch || searchable.includes(normalizedSearch));
  });

  const categories = [...new Set(codeSnippets.map((snippet) => snippet.category))];
  const languages = [...new Set(codeSnippets.map((snippet) => snippet.language))];
  const selectedSnippet = filteredSnippets.find((snippet) => snippet.id === viewingSnippet?.id)
    || filteredSnippets[0]
    || null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-[#f3f8fc]">
            <Code2 className="h-4 w-4 text-[#62d8f3]" />程式碼儲存庫
            <Badge variant="outline" className="border-[#2a526f] bg-[#10263a] text-[#bfeaf5]">
              {filteredSnippets.length}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[#91aabd]">選取程式碼後可直接預覽或編輯，原始換行與縮排完整保留。</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => openEditor()}>
              <Plus className="mr-2 h-4 w-4" />新增程式碼
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-h-[88vh] max-w-5xl overflow-y-auto border-[#2a526f] bg-[#071522]"
            onPointerDownOutside={(event) => {
              const target = event.target as HTMLElement;
              if (target?.closest(".rich-text-editor") || target?.closest('input[type="file"]')) event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editingSnippet ? "編輯程式碼" : "新增程式碼"}</DialogTitle>
              <DialogDescription>程式碼以原始文字儲存，不會壓縮換行或合併縮排。</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code-title">名稱 *</Label>
                  <Input id="code-title" value={formData.title} onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-language">程式語言</Label>
                  <Select value={formData.language} onValueChange={(value) => setFormData((current) => ({ ...current, language: value }))}>
                    <SelectTrigger id="code-language"><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGUAGE_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-category">分類</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData((current) => ({ ...current, category: value }))}>
                    <SelectTrigger id="code-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORY_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-tags">標籤</Label>
                  <Input id="code-tags" value={formData.tags} onChange={(event) => setFormData((current) => ({ ...current, tags: event.target.value }))} placeholder="以逗號分隔" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>用途說明</Label>
                <RichTextEditor content={formData.description} onChange={(description) => setFormData((current) => ({ ...current, description }))} placeholder="說明這段程式碼解決什麼問題" className="min-h-[80px]" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="code_content">程式碼內容 *</Label>
                <div className="overflow-hidden rounded-xl border border-[#2a526f] bg-[#06111f] focus-within:border-[#42c9e8] focus-within:ring-2 focus-within:ring-[#42c9e8]/20">
                  <div className="flex items-center justify-between border-b border-[#2a526f] bg-[#10263a] px-4 py-2 text-xs text-[#9fc8dc]">
                    <span>原始格式編輯器 · 保留換行與縮排</span>
                    <span className="font-mono text-[#d9f6ff]">{codeLineCount} 行</span>
                  </div>
                  <div className="grid grid-cols-[3.25rem_minmax(0,1fr)]">
                    <pre ref={codeLineNumbersRef} aria-hidden="true" className="m-0 overflow-hidden border-r border-[#2a526f] bg-[#0b1b2d] px-3 py-3 text-right font-mono text-sm leading-6 text-[#668ba0] select-none">
                      {Array.from({ length: codeLineCount }, (_, index) => index + 1).join("\n")}
                    </pre>
                    <textarea
                      ref={codeEditorRef}
                      id="code_content"
                      value={formData.code_content}
                      onChange={(event) => setFormData((current) => ({ ...current, code_content: event.target.value }))}
                      onKeyDown={handleCodeEditorKeyDown}
                      onScroll={(event) => {
                        if (codeLineNumbersRef.current) codeLineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
                      }}
                      rows={14}
                      wrap="off"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      className="h-[336px] min-w-0 resize-y overflow-auto whitespace-pre bg-[#06111f] px-4 py-3 font-mono text-sm leading-6 text-[#e8f6ff] caret-[#42c9e8] outline-none placeholder:text-[#668ba0]"
                      style={{ tabSize: 4 }}
                      placeholder="貼上或輸入程式碼"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>SOP 操作說明</Label>
                <RichTextEditor content={formData.sop_content} onChange={(sop_content) => setFormData((current) => ({ ...current, sop_content }))} placeholder="記錄安裝、執行與排錯步驟" className="min-h-[160px]" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
                <Button type="submit"><Check className="mr-2 h-4 w-4" />{editingSnippet ? "儲存變更" : "建立程式碼"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="maintenance-toolbar flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7699ad]" />
          <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value.slice(0, 100))} className="h-9 border-[#2a526f] bg-[#06111f] pl-9" placeholder={advancedSearch ? "搜尋名稱、說明、標籤或程式碼內容" : "搜尋名稱、說明或標籤"} />
        </div>
        <Button type="button" size="sm" variant={advancedSearch ? "default" : "outline"} onClick={() => setAdvancedSearch((value) => !value)}>
          <Filter className="mr-2 h-4 w-4" />搜尋程式內容
        </Button>
        <Select value={filterLanguage} onValueChange={setFilterLanguage}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="語言" /></SelectTrigger>
          <SelectContent><SelectItem value="all">所有語言</SelectItem>{languages.map((language) => <SelectItem key={language} value={language}>{language}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="分類" /></SelectTrigger>
          <SelectContent><SelectItem value="all">所有分類</SelectItem>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div data-testid="code-library-workspace" className="grid min-h-[520px] overflow-hidden rounded-xl border border-[#2a526f] bg-[#071522] lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.55fr)]">
        <aside className="border-b border-[#2a526f] bg-[#081827] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-[#23445d] px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8fb0c2]">程式清單</span>
            <span className="font-mono text-xs text-[#62d8f3]">{filteredSnippets.length}</span>
          </div>
          <div className="max-h-[560px] space-y-1 overflow-y-auto p-2">
            {isLoading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#91aabd]"><Loader2 className="h-4 w-4 animate-spin" />載入中</div>}
            {!isLoading && filteredSnippets.map((snippet) => (
              <button
                key={snippet.id}
                type="button"
                onClick={() => setViewingSnippet(snippet)}
                className={cn(
                  "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                  selectedSnippet?.id === snippet.id
                    ? "border-[#42c9e8] bg-[#123149]"
                    : "border-transparent bg-transparent hover:border-[#2a526f] hover:bg-[#0b1f31]",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-[#eef8fc]">{snippet.title}</span>
                  <Badge variant="outline" className="shrink-0 border-[#315975] bg-[#091725] text-[10px] text-[#a7d7e8]">{snippet.language}</Badge>
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#8fa9b9]">{snippet.category} · {snippet.tags.join(" · ") || "無標籤"}</div>
              </button>
            ))}
            {!isLoading && filteredSnippets.length === 0 && <div className="px-4 py-12 text-center text-sm text-[#7896a8]">找不到符合條件的程式碼</div>}
          </div>
        </aside>

        <section className="min-w-0 bg-[#06111f]">
          {selectedSnippet ? (
            <div className="flex h-full min-h-[520px] flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2a526f] bg-[#0b1b2d] px-5 py-4">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#62d8f3]">程式碼預覽</div>
                  <h3 className="mt-1 truncate text-lg font-semibold text-[#f3f8fc]">{selectedSnippet.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5"><Badge>{selectedSnippet.language}</Badge><Badge variant="outline">{selectedSnippet.category}</Badge>{selectedSnippet.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void handleCopy(selectedSnippet.code_content)}><Copy className="mr-2 h-4 w-4" />複製</Button>
                  <Button size="sm" variant="outline" onClick={() => downloadCodeFile(selectedSnippet)}><Download className="mr-2 h-4 w-4" />下載</Button>
                  <Button size="sm" onClick={() => openEditor(selectedSnippet)}><Edit2 className="mr-2 h-4 w-4" />編輯</Button>
                  <Button size="sm" variant="destructive" onClick={() => void handleDelete(selectedSnippet.id)}><Trash2 className="mr-2 h-4 w-4" />刪除</Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
                {selectedSnippet.description && <div className="rounded-lg border border-[#274a64] bg-[#0b1b2d] p-4 text-sm leading-6 text-[#c8dce8]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedSnippet.description) }} />}
                <pre className="max-h-[520px] overflow-auto whitespace-pre rounded-xl border border-[#23445d] bg-[#020913] p-5 font-mono text-sm leading-6 text-[#d9edf7]"><code>{selectedSnippet.code_content}</code></pre>
                {selectedSnippet.sop_content && <div className="rounded-lg border border-[#274a64] bg-[#0b1b2d] p-4 text-sm leading-6 text-[#c8dce8]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedSnippet.sop_content) }} />}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center px-8 text-center">
              <Code2 className="h-10 w-10 text-[#315975]" />
              <div className="mt-4 text-base font-semibold text-[#dbeaf2]">尚未選取程式碼</div>
              <p className="mt-1 text-sm text-[#7896a8]">選取程式碼後可直接預覽或編輯</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
