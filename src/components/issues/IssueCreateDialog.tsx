import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, ClipboardPenLine, Link2, Paperclip, Plus, Save, Upload, UserRound, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";

interface NewIssue {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  assigned_to: string;
  system_id?: string;
  station_id?: string;
  test_item_id?: string;
  relate: string;
  category: string;
  process_notes: string;
  solution: string;
}

interface IssueCreateDialogProps {
  onIssueCreated: () => void;
}

interface TestSystem {
  id: string;
  system_name: string;
  serial_number?: string;
}

interface TestStation {
  id: string;
  station_name: string;
}

interface TestItem {
  id: string;
  item_name: string;
  station_id: string;
}

export function IssueCreateDialog({ onIssueCreated }: IssueCreateDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newIssue, setNewIssue] = useState<NewIssue>({
    title: "",
    description: "",
    priority: "medium",
    status: "open",
    assigned_to: "",
    system_id: undefined,
    station_id: undefined,
    test_item_id: undefined,
    relate: "",
    category: "",
    process_notes: "",
    solution: ""
  });

  // 照片上傳相關狀態
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

  // 選項數據
  const [systems, setSystems] = useState<TestSystem[]>([]);
  const [stations, setStations] = useState<TestStation[]>([]);
  const [testItems, setTestItems] = useState<TestItem[]>([]);
  const [engineers, setEngineers] = useState<Array<{id: string, name: string}>>([]);

  const { toast } = useToast();
  const { activeProjectId } = useTestProject();

  useEffect(() => {
    if (isOpen) {
      loadSystems();
      loadStations();
      loadTestItems();
      loadEngineers();
    }
  }, [activeProjectId, isOpen]);

  useEffect(() => {
    if (newIssue.station_id) {
      loadTestItemsForStation(newIssue.station_id);
    }
  }, [newIssue.station_id]);

  const loadSystems = async () => {
    try {
      if (!activeProjectId) {
        setSystems([]);
        return;
      }

      const { data, error } = await supabase
        .from('test_systems')
        .select('id, system_name, serial_number')
        .eq('project_id', activeProjectId)
        .order('system_name');
      
      if (error) throw error;
      setSystems(data || []);
    } catch (error) {
      console.error('Error loading systems:', error);
    }
  };

  const loadStations = async () => {
    try {
      if (!activeProjectId) {
        setStations([]);
        return;
      }

      const { data, error } = await supabase
        .from('test_flow_stations')
        .select('id, station_name')
        .eq('project_id', activeProjectId)
        .order('station_order');
      
      if (error) throw error;
      setStations(data || []);
    } catch (error) {
      console.error('Error loading stations:', error);
    }
  };

  const loadTestItems = async () => {
    try {
      if (!activeProjectId) {
        setTestItems([]);
        return;
      }

      const { data, error } = await supabase
        .from('test_flow_items')
        .select('id, item_name, station_id')
        .eq('project_id', activeProjectId)
        .order('item_order');
      
      if (error) throw error;
      setTestItems(data || []);
    } catch (error) {
      console.error('Error loading test items:', error);
    }
  };

  const loadEngineers = async () => {
    try {
      const { data, error } = await supabase
        .from('engineers')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      
      if (error) {
        console.error('載入工程師列表錯誤:', error);
        return;
      }
      
      setEngineers(data || []);
    } catch (error) {
      console.error('載入工程師列表失敗:', error);
    }
  };

  const loadTestItemsForStation = async (stationId: string) => {
    try {
      const { data, error } = await supabase
        .from('test_flow_items')
        .select('id, item_name, station_id')
        .eq('station_id', stationId)
        .order('item_order');
      
      if (error) throw error;
      setTestItems(data || []);
    } catch (error) {
      console.error('Error loading test items for station:', error);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const supportedFiles = files.filter(file => {
      const supportedMimeTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ];
      return file.type.startsWith('image/') || supportedMimeTypes.includes(file.type) || /\.(pdf|doc|docx|txt)$/i.test(file.name);
    });
    
    if (supportedFiles.length !== files.length) {
      toast({
        title: "檔案類型錯誤",
        description: "僅支援圖片、PDF、Word 與純文字檔案。",
        variant: "destructive"
      });
    }
    
    setSelectedFiles(prev => [...prev, ...supportedFiles]);
    event.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (issueId: string) => {
    if (selectedFiles.length === 0) return;

    const uploadPromises = selectedFiles.map(async (file, index) => {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${issueId}/${Date.now()}-${index}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('issue-attachments')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // 儲存附件記錄
        const { error: dbError } = await supabase
          .from('issue_attachments')
          .insert({
            issue_id: issueId,
            file_name: file.name,
            file_path: fileName,
            file_size: file.size,
            file_type: file.type
          });

        if (dbError) throw dbError;

        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      } catch (error) {
        console.error('Error uploading file:', error);
        toast({
          title: "上傳失敗",
          description: `檔案 ${file.name} 上傳失敗`,
          variant: "destructive"
        });
      }
    });

    await Promise.all(uploadPromises);
  };

  const createIssue = async () => {
    const descriptionText = newIssue.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!newIssue.title.trim() || !descriptionText) {
      toast({
        title: "資料不完整",
        description: "請填寫問題標題和問題描述",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);

      if (!activeProjectId) {
        throw new Error("No active project");
      }

      const { data, error } = await supabase
        .from('issues')
        .insert([{
          project_id: activeProjectId,
          title: newIssue.title,
          description: newIssue.description,
          priority: newIssue.priority,
          status: newIssue.status,
          assigned_to: newIssue.assigned_to || null,
          system_id: (newIssue.system_id && newIssue.system_id !== "none") ? newIssue.system_id : null,
          station_id: (newIssue.station_id && newIssue.station_id !== "none") ? newIssue.station_id : null,
          test_item_id: (newIssue.test_item_id && newIssue.test_item_id !== "none") ? newIssue.test_item_id : null,
          relate: newIssue.relate || null,
          category: newIssue.category || null,
          process_notes: newIssue.process_notes || null,
          solution: newIssue.solution || null
        }])
        .select()
        .single();

      if (error) throw error;

      // 上傳照片
      if (selectedFiles.length > 0) {
        await uploadFiles(data.id);
      }

      toast({
        title: "問題建立成功",
        description: "新問題已成功建立"
      });

      // 重置表單
      setNewIssue({
        title: "",
        description: "",
        priority: "medium",
        status: "open",
        assigned_to: "",
        system_id: undefined,
        station_id: undefined,
        test_item_id: undefined,
        relate: "",
        category: "",
        process_notes: "",
        solution: ""
      });
      setSelectedFiles([]);
      setUploadProgress({});
      setIsOpen(false);
      onIssueCreated();
    } catch (error) {
      console.error('Error creating issue:', error);
      toast({
        title: "建立失敗",
        description: "無法建立問題",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTestItems = testItems.filter(item => 
    !newIssue.station_id || item.station_id === newIssue.station_id
  );
  const hasDescription = newIssue.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          新增問題
        </Button>
      </DialogTrigger>
      <DialogContent className="!flex !max-w-6xl !gap-0 !overflow-hidden !p-0 h-[min(900px,calc(100vh-1.5rem))] w-[calc(100vw-1.5rem)] flex-col border-[#2a526f] bg-[#071522] text-[#f3f8fc]">
        <DialogHeader className="shrink-0 border-b border-[#2a526f] bg-[linear-gradient(110deg,#0b1b2d_0%,#102b41_100%)] px-5 py-4 pr-14 text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/35 bg-cyan-300/10 text-cyan-100">
              <ClipboardPenLine className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-xl font-semibold">新增問題</DialogTitle>
                <Badge variant="outline" className="rounded-md border-cyan-300/35 bg-cyan-300/10 text-cyan-100">建立追蹤紀錄</Badge>
              </div>
              <DialogDescription className="mt-1 text-sm text-[#a9c0d1]">先填寫問題現象，再補充關聯機台與附件；建立後可以在問題追蹤頁持續更新。</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-h-0 overflow-y-auto p-4 sm:p-6">
            <div className="space-y-5">
              <section className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-4">
                <div className="mb-4 flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-cyan-100" />
                  <div>
                    <h2 className="text-sm font-semibold">基本資料</h2>
                    <p className="text-xs text-[#8faabd]">先讓團隊一眼看懂問題是什麼、由誰處理。</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-semibold text-[#dce9f2]">問題標題 <span className="text-amber-200">*</span></Label>
                  <Input
                    id="title"
                    placeholder="例如：CATIA-VR 讀取模型時顯示 FAIL LOG"
                    value={newIssue.title}
                    onChange={(event) => setNewIssue(prev => ({ ...prev, title: event.target.value }))}
                    disabled={isLoading}
                    className="h-11 border-[#3c6380] bg-[#10263a] text-base font-semibold placeholder:text-[#7791a3]"
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="priority">優先級</Label>
                    <Select value={newIssue.priority} onValueChange={(value) => setNewIssue(prev => ({ ...prev, priority: value as NewIssue["priority"] }))} disabled={isLoading}>
                      <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">低</SelectItem>
                        <SelectItem value="medium">中</SelectItem>
                        <SelectItem value="high">高</SelectItem>
                        <SelectItem value="critical">緊急</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="status">狀態</Label>
                    <Select value={newIssue.status} onValueChange={(value) => setNewIssue(prev => ({ ...prev, status: value as NewIssue["status"] }))} disabled={isLoading}>
                      <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">開啟</SelectItem>
                        <SelectItem value="in_progress">處理中</SelectItem>
                        <SelectItem value="resolved">已解決</SelectItem>
                        <SelectItem value="closed">已關閉</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  <Label htmlFor="assigned_to">負責人</Label>
                  <Select value={newIssue.assigned_to || "unassigned"} onValueChange={(value) => setNewIssue(prev => ({ ...prev, assigned_to: value === "unassigned" ? "" : value }))} disabled={isLoading}>
                    <SelectTrigger id="assigned_to"><SelectValue placeholder="請選擇負責人" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">未指派</SelectItem>
                      {engineers.map(engineer => <SelectItem key={engineer.id} value={engineer.name}>{engineer.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <section className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-cyan-100" />
                  <div>
                    <h2 className="text-sm font-semibold">關聯範圍</h2>
                    <p className="text-xs text-[#8faabd]">選填，但補上後比較容易從機台、站點反查問題。</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="system">相關機台</Label>
                    <Select value={newIssue.system_id || "none"} onValueChange={(value) => setNewIssue(prev => ({ ...prev, system_id: value === "none" ? undefined : value }))} disabled={isLoading}>
                      <SelectTrigger id="system"><SelectValue placeholder="選擇機台" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">無</SelectItem>
                        {systems.map(system => <SelectItem key={system.id} value={system.id}>{system.system_name}{system.serial_number ? ` (${system.serial_number})` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="station">相關站點</Label>
                    <Select value={newIssue.station_id || "none"} onValueChange={(value) => setNewIssue(prev => ({ ...prev, station_id: value === "none" ? undefined : value, test_item_id: undefined }))} disabled={isLoading}>
                      <SelectTrigger id="station"><SelectValue placeholder="選擇站點" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">無</SelectItem>
                        {stations.map(station => <SelectItem key={station.id} value={station.id}>{station.station_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="test_item">相關測項</Label>
                    <Select value={newIssue.test_item_id || "none"} onValueChange={(value) => setNewIssue(prev => ({ ...prev, test_item_id: value === "none" ? undefined : value }))} disabled={isLoading || !newIssue.station_id}>
                      <SelectTrigger id="test_item"><SelectValue placeholder="先選擇站點" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">無</SelectItem>
                        {filteredTestItems.map(item => <SelectItem key={item.id} value={item.id}>{item.item_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="relate">相關項目</Label>
                    <Input id="relate" value={newIssue.relate} onChange={(event) => setNewIssue(prev => ({ ...prev, relate: event.target.value }))} placeholder="料號／批次／需求單號" disabled={isLoading} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="category">問題分類</Label>
                    <Input id="category" value={newIssue.category} onChange={(event) => setNewIssue(prev => ({ ...prev, category: event.target.value }))} placeholder="硬體／線材／軟體" disabled={isLoading} />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-4">
                <Tabs defaultValue="description" className="w-full">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-200" />
                        <h2 className="text-sm font-semibold">問題內容</h2>
                      </div>
                      <p className="mt-1 text-xs text-[#8faabd]">三種紀錄分開填寫，畫面更短，也方便後續接手。</p>
                    </div>
                    <Badge variant="outline" className="border-amber-300/35 bg-amber-300/10 text-xs text-amber-100">描述為必填</Badge>
                  </div>
                  <TabsList className="grid h-11 w-full grid-cols-3 border border-[#2a526f] bg-[#081827] p-1">
                    <TabsTrigger value="description">問題描述 *</TabsTrigger>
                    <TabsTrigger value="process">處理過程</TabsTrigger>
                    <TabsTrigger value="solution">解決方案</TabsTrigger>
                  </TabsList>
                  <TabsContent value="description" className="mt-3 rounded-xl border border-[#2a526f] bg-[#081827] p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-200" />問題現象與影響</div>
                    <RichTextEditor content={newIssue.description} onChange={(content) => setNewIssue(prev => ({ ...prev, description: content }))} placeholder="記錄錯誤現象、發生條件、影響範圍與重現方式..." className="min-h-[300px] border-[#2a526f] bg-[#071522]" disableImageUpload />
                  </TabsContent>
                  <TabsContent value="process" className="mt-3 rounded-xl border border-[#2a526f] bg-[#081827] p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ClipboardPenLine className="h-4 w-4 text-cyan-100" />診斷與處理時間線</div>
                    <RichTextEditor content={newIssue.process_notes} onChange={(content) => setNewIssue(prev => ({ ...prev, process_notes: content }))} placeholder="依時間記錄診斷、執行步驟、測試結果與待追蹤事項..." className="min-h-[300px] border-[#2a526f] bg-[#071522]" disableImageUpload />
                  </TabsContent>
                  <TabsContent value="solution" className="mt-3 rounded-xl border border-[#2a526f] bg-[#081827] p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-200" />最終修復與驗證</div>
                    <RichTextEditor content={newIssue.solution} onChange={(content) => setNewIssue(prev => ({ ...prev, solution: content }))} placeholder="記錄採用方案、變更內容、驗證結果與預防措施..." className="min-h-[300px] border-[#2a526f] bg-[#071522]" disableImageUpload />
                  </TabsContent>
                </Tabs>
              </section>
            </div>
          </main>

          <aside className="min-h-0 overflow-y-auto border-t border-[#2a526f] bg-[#091a2a] p-4 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <section className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4 text-cyan-100" />附件</div>
                  {selectedFiles.length > 0 && <Badge variant="outline" className="border-cyan-300/35 bg-cyan-300/10 text-cyan-100">{selectedFiles.length} 個</Badge>}
                </div>
                <label htmlFor="issue-attachments" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#3c6380] bg-[#10263a] px-4 py-6 text-center transition hover:border-cyan-300/60 hover:bg-[#16324b]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-100"><Upload className="h-5 w-5" /></span>
                  <span className="text-sm font-semibold">選擇檔案</span>
                  <span className="text-xs text-[#8faabd]">可多選圖片、PDF、Word 或 TXT</span>
                </label>
                <input id="issue-attachments" type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt" onChange={handleFileSelect} className="sr-only" />

                {selectedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8faabd]">待上傳檔案</div>
                    {selectedFiles.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-[#2a526f] bg-[#081827] p-2.5 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-[#dce9f2]">{file.name}</div>
                          <div className="text-xs text-[#8faabd]">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeFile(index)} className="h-8 w-8 shrink-0 text-[#8faabd] hover:bg-rose-400/10 hover:text-rose-100">
                          <X className="h-4 w-4" />
                          <span className="sr-only">移除 {file.name}</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ClipboardPenLine className="h-4 w-4 text-cyan-100" />填寫提示</div>
                <ol className="space-y-3 text-sm text-[#a9c0d1]">
                  <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-300/15 text-xs font-semibold text-cyan-100">1</span><span>標題寫出機台、現象與錯誤關鍵字，之後比較好搜尋。</span></li>
                  <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-300/15 text-xs font-semibold text-cyan-100">2</span><span>描述記錄發生條件、影響範圍與重現步驟。</span></li>
                  <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-300/15 text-xs font-semibold text-cyan-100">3</span><span>有畫面或錯誤檔時直接附上，方便後續判斷。</span></li>
                </ol>
              </section>

              <section className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
                <div className="mb-3 text-sm font-semibold">建立前檢查</div>
                <div className="space-y-2 text-xs text-[#a9c0d1]">
                  <div className="flex items-center gap-2"><Badge variant="outline" className="border-amber-300/35 bg-amber-300/10 text-amber-100">必要</Badge><span>問題標題</span></div>
                  <div className="flex items-center gap-2"><Badge variant="outline" className="border-amber-300/35 bg-amber-300/10 text-amber-100">必要</Badge><span>問題描述</span></div>
                  <div className="flex items-center gap-2"><Badge variant="outline" className="border-[#3c6380] bg-[#10263a] text-[#a9c0d1]">選填</Badge><span>關聯資料、附件與處理紀錄</span></div>
                </div>
              </section>
            </div>
          </aside>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#2a526f] bg-[#0b1b2d] px-5 py-3">
          <div className="text-xs text-[#8faabd]"><span className="text-amber-200">*</span> 為必填欄位 <span className="mx-2 text-[#3c6380]">|</span>目前狀態：{newIssue.status === "open" ? "開啟" : newIssue.status === "in_progress" ? "處理中" : newIssue.status === "resolved" ? "已解決" : "已關閉"}</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>取消</Button>
            <Button type="button" onClick={createIssue} disabled={!newIssue.title.trim() || !hasDescription || isLoading} className="min-w-28 bg-[#4c8dff] text-[#06111f] hover:bg-[#6da2ff]">
              <Save className="mr-2 h-4 w-4" />
              {isLoading ? "建立中..." : "建立問題"}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
