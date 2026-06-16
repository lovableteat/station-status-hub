import React, { useMemo, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Code,
  GitCompare,
  Download,
  RotateCcw,
  Copy,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { diffLines, diffWords } from 'diff';

interface LineDiff {
  oldNumber?: number;
  newNumber?: number;
  type: 'add' | 'remove' | 'same' | 'modify';
  oldText?: string;
  newText?: string;
  parts?: Array<{ value: string; added?: boolean; removed?: boolean }>;
}

export function CodeComparisonTool() {
  const [oldCode, setOldCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [isComparing, setIsComparing] = useState(false);
  const [stats, setStats] = useState({ added: 0, removed: 0, modified: 0 });
  const [showInline, setShowInline] = useState(true);
  const [showUnchanged, setShowUnchanged] = useState(true);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [currentChange, setCurrentChange] = useState(0);
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const { toast } = useToast();
  const oldColRef = useRef<HTMLDivElement>(null);
  const newColRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  const supportedLanguages = [
    { value: "javascript", label: "JavaScript" },
    { value: "typescript", label: "TypeScript" },
    { value: "python", label: "Python" },
    { value: "java", label: "Java" },
    { value: "csharp", label: "C#" },
    { value: "cpp", label: "C++" },
    { value: "css", label: "CSS" },
    { value: "html", label: "HTML" },
    { value: "sql", label: "SQL" },
    { value: "json", label: "JSON" },
    { value: "xml", label: "XML" },
    { value: "yaml", label: "YAML" },
    { value: "shell", label: "Shell Script" },
    { value: "php", label: "PHP" },
    { value: "ruby", label: "Ruby" },
    { value: "go", label: "Go" },
    { value: "rust", label: "Rust" },
    { value: "swift", label: "Swift" },
    { value: "kotlin", label: "Kotlin" },
    { value: "dart", label: "Dart" }
  ];

  const lineDiffs = useMemo<LineDiff[]>(() => {
    if (!oldCode && !newCode) return [];
    const diffs = diffLines(oldCode, newCode, { ignoreWhitespace });
    const result: LineDiff[] = [];
    let oldNum = 1;
    let newNum = 1;
    let added = 0, removed = 0, modified = 0;

    for (const part of diffs) {
      const lines = part.value.split('\n');
      // remove trailing empty from split
      if (lines[lines.length - 1] === '') lines.pop();

      if (part.added) {
        for (const l of lines) {
          result.push({ type: 'add', newNumber: newNum++, newText: l });
          added++;
        }
      } else if (part.removed) {
        for (const l of lines) {
          result.push({ type: 'remove', oldNumber: oldNum++, oldText: l });
          removed++;
        }
      } else {
        for (const l of lines) {
          result.push({ type: 'same', oldNumber: oldNum, newNumber: newNum, oldText: l, newText: l });
          oldNum++;
          newNum++;
        }
      }
    }

    // Detect modify pairs (remove followed by add) and compute inline word diffs
    const merged: LineDiff[] = [];
    for (let i = 0; i < result.length; i++) {
      const cur = result[i];
      const next = result[i + 1];
      if (cur && next && cur.type === 'remove' && next.type === 'add') {
        const parts = ignoreWhitespace
          ? diffWords(cur.oldText || '', next.newText || '')
          : diffWords(cur.oldText || '', next.newText || '');
        merged.push({ type: 'modify', oldNumber: cur.oldNumber, newNumber: next.newNumber, oldText: cur.oldText, newText: next.newText, parts });
        modified++;
        i++; // skip next
      } else {
        merged.push(cur);
      }
    }

    setStats({ added, removed, modified });
    return merged;
  }, [oldCode, newCode, ignoreWhitespace]);


  const clearAll = () => {
    setOldCode("");
    setNewCode("");
    setStats({ added: 0, removed: 0, modified: 0 });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "已複製",
      description: "程式碼已複製到剪貼板",
    });
  };

  const exportDiff = () => {
    const blob = new Blob([`Added: ${stats.added}, Removed: ${stats.removed}, Modified: ${stats.modified}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'code-diff.txt';
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "匯出完成",
      description: "差異摘要已下載",
    });
  };

  const getBg = (type: string) => {
    switch (type) {
      case 'add': return 'bg-accent/10 border-l-4 border-accent';
      case 'remove': return 'bg-destructive/10 border-l-4 border-destructive';
      case 'modify': return 'bg-primary/10 border-l-4 border-primary';
      default: return 'bg-background';
    }
  };


  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'add':
        return <span className="text-accent font-bold">+</span>;
      case 'remove':
        return <span className="text-destructive font-bold">-</span>;
      case 'modify':
        return <span className="text-primary font-bold">~</span>;
      default:
        return <span className="text-muted-foreground"></span>;
    }
  };

  // 派生顯示資料與差異索引
  const displayDiffs = useMemo(() => (
    showUnchanged ? lineDiffs : lineDiffs.filter((d) => d.type !== 'same')
  ), [lineDiffs, showUnchanged]);
  
  const changeRowIndices = useMemo(() => (
    displayDiffs.map((d, i) => (d.type !== 'same' ? i : -1)).filter((i) => i !== -1)
  ), [displayDiffs]);
  
  const scrollToRow = (rowIdx: number) => {
    document.getElementById(`diff-old-${rowIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById(`diff-new-${rowIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setActiveRow(rowIdx);
  };
  
  const syncScroll = useCallback((fromOld: boolean) => {
    if (isSyncing.current) return;
    const source = fromOld ? oldColRef.current : newColRef.current;
    const target = fromOld ? newColRef.current : oldColRef.current;
    if (!source || !target) return;
    isSyncing.current = true;
    target.scrollTop = source.scrollTop;
    // small timeout to prevent ping-pong
    setTimeout(() => { isSyncing.current = false; }, 0);
  }, []);

  const gotoPrev = () => {
    if (!changeRowIndices.length) return;
    setCurrentChange((prev) => {
      const len = changeRowIndices.length;
      const nextPtr = (prev - 1 + len) % len;
      scrollToRow(changeRowIndices[nextPtr]);
      return nextPtr;
    });
  };

  const gotoNext = () => {
    if (!changeRowIndices.length) return;
    setCurrentChange((prev) => {
      const len = changeRowIndices.length;
      const nextPtr = (prev + 1) % len;
      scrollToRow(changeRowIndices[nextPtr]);
      return nextPtr;
    });
  };

  return (
    <div className="space-y-6">
      {/* 設定區域 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            程式碼比對設定
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>程式語言</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedLanguages.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={clearAll}>
                <RotateCcw className="h-4 w-4 mr-2" />
                清除全部
              </Button>
              <Button onClick={() => setIsComparing(true)} disabled={isComparing}>
                <GitCompare className="h-4 w-4 mr-2" />
                {isComparing ? "比對中..." : "更新結果"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 程式碼輸入區域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>舊版程式碼</CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => copyToClipboard(oldCode)}
              disabled={!oldCode}
            >
              複製
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea
              value={oldCode}
              onChange={(e) => setOldCode(e.target.value)}
              placeholder="貼上舊版程式碼..."
              className="font-mono text-sm min-h-[400px] resize-none"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>新版程式碼</CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => copyToClipboard(newCode)}
              disabled={!newCode}
            >
              複製
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="貼上新版程式碼..."
              className="font-mono text-sm min-h-[400px] resize-none"
            />
          </CardContent>
        </Card>
      </div>

      {/* 比對結果 - 兩欄式逐字差異 */}
      {lineDiffs.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>比對結果</CardTitle>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="default">新增 {stats.added} 行</Badge>
                <Badge variant="destructive">刪除 {stats.removed} 行</Badge>
                <Badge variant="secondary">修改 {stats.modified} 行</Badge>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm">逐字</Label>
                <Switch checked={showInline} onCheckedChange={setShowInline} />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">顯示未變更</Label>
                <Switch checked={showUnchanged} onCheckedChange={setShowUnchanged} />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">忽略空白</Label>
                <Switch checked={ignoreWhitespace} onCheckedChange={setIgnoreWhitespace} />
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={gotoPrev} aria-label="上一個差異">
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={gotoNext} aria-label="下一個差異">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={exportDiff}>
                <Download className="h-4 w-4 mr-2" />
                匯出差異摘要
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                {/* Old */}
                <div ref={oldColRef} className="max-h-[600px] overflow-auto" onScroll={() => syncScroll(true)}>
                  {displayDiffs.map((d, idx) => (
                    <div
                      id={`diff-old-${idx}`}
                      key={`old-${idx}`}
                      tabIndex={0}
                      onMouseEnter={() => setActiveRow(idx)}
                      onFocus={() => setActiveRow(idx)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const next = Math.min((activeRow ?? 0) + 1, displayDiffs.length - 1);
                          scrollToRow(next);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const prev = Math.max((activeRow ?? 0) - 1, 0);
                          scrollToRow(prev);
                        }
                      }}
                      className={`flex gap-2 px-3 py-1 ${getBg(d.type)} ${activeRow === idx ? 'bg-primary/15 outline outline-1 outline-primary' : ''}`}
                      aria-selected={activeRow === idx}
                    >
                      <div className="w-10 text-right text-xs text-muted-foreground select-none">
                        {d.oldNumber ?? ''}
                      </div>
                      <div className="w-4 flex justify-center">
                        {getTypeIcon(d.type)}
                      </div>
                      <div className="flex-1 whitespace-pre-wrap break-all font-mono text-sm">
                        {showInline && d.type === 'modify' && d.parts ? (
                          <span>
                            {d.parts.map((p, i) =>
                              p.removed ? (
                                <span key={i} className="line-through bg-destructive/20 text-destructive-foreground/90 px-1 rounded">{p.value}</span>
                              ) : !p.added ? (
                                <span key={i} className="text-muted-foreground">{p.value}</span>
                              ) : null
                            )}
                          </span>
                        ) : (
                          <span className={
                            d.type === 'remove'
                              ? 'line-through text-destructive bg-destructive/10 px-1 rounded'
                              : d.type === 'add'
                              ? 'opacity-40'
                              : 'text-foreground'
                          }>
                            {d.oldText ?? ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* New */}
                <div ref={newColRef} className="max-h-[600px] overflow-auto" onScroll={() => syncScroll(false)}>
                  {displayDiffs.map((d, idx) => (
                    <div
                      id={`diff-new-${idx}`}
                      key={`new-${idx}`}
                      tabIndex={0}
                      onMouseEnter={() => setActiveRow(idx)}
                      onFocus={() => setActiveRow(idx)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const next = Math.min((activeRow ?? 0) + 1, displayDiffs.length - 1);
                          scrollToRow(next);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const prev = Math.max((activeRow ?? 0) - 1, 0);
                          scrollToRow(prev);
                        }
                      }}
                      className={`flex gap-2 px-3 py-1 ${getBg(d.type)} ${activeRow === idx ? 'bg-primary/15 outline outline-1 outline-primary' : ''}`}
                      aria-selected={activeRow === idx}
                    >
                      <div className="w-10 text-right text-xs text-muted-foreground select-none">
                        {d.newNumber ?? ''}
                      </div>
                      <div className="w-4 flex justify-center">
                        {getTypeIcon(d.type)}
                      </div>
                      <div className="flex-1 whitespace-pre-wrap break-all font-mono text-sm">
                        {showInline && d.type === 'modify' && d.parts ? (
                          <span>
                            {d.parts.map((p, i) =>
                              p.added ? (
                                <span key={i} className="underline decoration-2 underline-offset-2 bg-accent/20 text-foreground px-1 rounded">{p.value}</span>
                              ) : !p.removed ? (
                                <span key={i} className="text-muted-foreground">{p.value}</span>
                              ) : null
                            )}
                          </span>
                        ) : (
                          <span className={
                            d.type === 'add'
                              ? 'text-accent bg-accent/10 underline decoration-2 underline-offset-2 px-1 rounded'
                              : d.type === 'remove'
                              ? 'opacity-40'
                              : 'text-foreground'
                          }>
                            {d.newText ?? ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}