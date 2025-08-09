import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Code, 
  GitCompare, 
  FileText, 
  Download,
  RotateCcw,
  Copy
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DiffLine {
  lineNumber: number;
  type: 'add' | 'remove' | 'modify' | 'same';
  oldContent?: string;
  newContent?: string;
  content: string;
}

export function CodeComparisonTool() {
  const [oldCode, setOldCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [differences, setDifferences] = useState<DiffLine[]>([]);
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

  const compareCode = async () => {
    if (!oldCode.trim() || !newCode.trim()) {
      toast({
        title: "請輸入程式碼",
        description: "請在兩個區域都輸入程式碼後再進行比對",
        variant: "destructive"
      });
      return;
    }

    setIsComparing(true);

    try {
      // 模擬比對處理
      await new Promise(resolve => setTimeout(resolve, 1000));

      const oldLines = oldCode.split('\n');
      const newLines = newCode.split('\n');
      const maxLines = Math.max(oldLines.length, newLines.length);
      
      const diffs: DiffLine[] = [];
      let addedCount = 0;
      let removedCount = 0;
      let modifiedCount = 0;

      for (let i = 0; i < maxLines; i++) {
        const oldLine = oldLines[i] || '';
        const newLine = newLines[i] || '';

        if (oldLine === newLine) {
          diffs.push({
            lineNumber: i + 1,
            type: 'same',
            content: oldLine
          });
        } else if (!oldLine && newLine) {
          diffs.push({
            lineNumber: i + 1,
            type: 'add',
            content: newLine,
            newContent: newLine
          });
          addedCount++;
        } else if (oldLine && !newLine) {
          diffs.push({
            lineNumber: i + 1,
            type: 'remove',
            content: oldLine,
            oldContent: oldLine
          });
          removedCount++;
        } else {
          diffs.push({
            lineNumber: i + 1,
            type: 'modify',
            content: newLine,
            oldContent: oldLine,
            newContent: newLine
          });
          modifiedCount++;
        }
      }

      setDifferences(diffs);
      setStats({ added: addedCount, removed: removedCount, modified: modifiedCount });

      toast({
        title: "比對完成",
        description: `發現 ${addedCount + removedCount + modifiedCount} 處差異`,
      });
    } catch (error) {
      toast({
        title: "比對失敗",
        description: "系統錯誤，請稍後再試",
        variant: "destructive"
      });
    } finally {
      setIsComparing(false);
    }
  };

  const clearAll = () => {
    setOldCode("");
    setNewCode("");
    setDifferences([]);
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
    const diffText = differences.map(diff => {
      const prefix = diff.type === 'add' ? '+ ' : diff.type === 'remove' ? '- ' : '  ';
      return `${prefix}${diff.content}`;
    }).join('\n');

    const blob = new Blob([diffText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'code-diff.txt';
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "匯出完成",
      description: "差異報告已下載",
    });
  };

  const getLineStyle = (type: string) => {
    switch (type) {
      case 'add':
        return 'bg-green-100 dark:bg-green-900/30 border-l-4 border-green-500';
      case 'remove':
        return 'bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500';
      case 'modify':
        return 'bg-orange-100 dark:bg-orange-900/30 border-l-4 border-orange-500';
      default:
        return 'bg-gray-50 dark:bg-gray-800/50';
    }
  };

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
              <Button onClick={compareCode} disabled={isComparing}>
                <GitCompare className="h-4 w-4 mr-2" />
                {isComparing ? "比對中..." : "開始比對"}
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
              <Copy className="h-4 w-4" />
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
              <Copy className="h-4 w-4" />
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

      {/* 比對結果 */}
      {differences.length > 0 && (
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
              匯出差異
            </Button>
          </CardHeader>
          <CardContent>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                {differences.map((diff, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-2 p-2 text-sm font-mono ${getLineStyle(diff.type)}`}
                  >
                    <div className="w-8 text-center text-gray-500 select-none">
                      {diff.lineNumber}
                    </div>
                    <div className="w-6 text-center">
                      {getTypeIcon(diff.type)}
                    </div>
                    <div className="flex-1 whitespace-pre-wrap break-all">
                      {diff.type === 'modify' ? (
                        <div className="space-y-1">
                          <div className="text-red-600 line-through">
                            {diff.oldContent}
                          </div>
                          <div className="text-green-600">
                            {diff.newContent}
                          </div>
                        </div>
                      ) : (
                        <span className={
                          diff.type === 'add' ? 'text-green-600' :
                          diff.type === 'remove' ? 'text-red-600' :
                          ''
                        }>
                          {diff.content}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}