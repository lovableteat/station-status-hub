import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Code, 
  GitCompare, 
  Download,
  RotateCcw,
  Copy
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
  const { toast } = useToast();

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
    const diffs = diffLines(oldCode, newCode);
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
        const parts = diffWords(cur.oldText || '', next.newText || '');
        merged.push({ type: 'modify', oldNumber: cur.oldNumber, newNumber: next.newNumber, oldText: cur.oldText, newText: next.newText, parts });
        modified++;
        i++; // skip next
      } else {
        merged.push(cur);
      }
    }

    setStats({ added, removed, modified });
    return merged;
  }, [oldCode, newCode]);


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

  const getBg = (type: string) => type === 'add' ? 'bg-green-100 dark:bg-green-900/30' : type === 'remove' ? 'bg-red-100 dark:bg-red-900/30' : type === 'modify' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-gray-50 dark:bg-gray-800/50';


  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'add':
        return <span className="text-green-600 font-bold">+</span>;
      case 'remove':
        return <span className="text-red-600 font-bold">-</span>;
      case 'modify':
        return <span className="text-orange-600 font-bold">~</span>;
      default:
        return <span className="text-gray-400"></span>;
    }
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>比對結果</CardTitle>
              <div className="flex gap-4 mt-2">
                <Badge variant="default" className="bg-green-500">
                  新增 {stats.added} 行
                </Badge>
                <Badge variant="destructive">
                  刪除 {stats.removed} 行
                </Badge>
                <Badge variant="secondary">
                  修改 {stats.modified} 行
                </Badge>
              </div>
            </div>
            <Button variant="outline" onClick={exportDiff}>
              <Download className="h-4 w-4 mr-2" />
              匯出差異摘要
            </Button>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                {/* Old */}
                <div className="max-h-[600px] overflow-auto">
                  {lineDiffs.map((d, idx) => (
                    <div key={`old-${idx}`} className={`flex gap-2 px-3 py-1 ${getBg(d.type)}`}>
                      <div className="w-10 text-right text-xs text-muted-foreground select-none">
                        {d.oldNumber ?? ''}
                      </div>
                      <div className="flex-1 whitespace-pre-wrap break-all font-mono text-sm">
                        {d.type === 'modify' && d.parts ? (
                          <span>
                            {d.parts.map((p, i) => p.removed ? (
                              <span key={i} className="bg-red-500/20 line-through">{p.value}</span>
                            ) : !p.added ? (
                              <span key={i}>{p.value}</span>
                            ) : null)}
                          </span>
                        ) : (
                          <span className={d.type === 'remove' ? 'text-red-600' : d.type === 'add' ? 'opacity-50' : ''}>
                            {d.oldText ?? ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* New */}
                <div className="max-h-[600px] overflow-auto">
                  {lineDiffs.map((d, idx) => (
                    <div key={`new-${idx}`} className={`flex gap-2 px-3 py-1 ${getBg(d.type)}`}>
                      <div className="w-10 text-right text-xs text-muted-foreground select-none">
                        {d.newNumber ?? ''}
                      </div>
                      <div className="flex-1 whitespace-pre-wrap break-all font-mono text-sm">
                        {d.type === 'modify' && d.parts ? (
                          <span>
                            {d.parts.map((p, i) => p.added ? (
                              <span key={i} className="bg-green-500/20 underline">{p.value}</span>
                            ) : !p.removed ? (
                              <span key={i}>{p.value}</span>
                            ) : null)}
                          </span>
                        ) : (
                          <span className={d.type === 'add' ? 'text-green-600' : d.type === 'remove' ? 'opacity-50' : ''}>
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