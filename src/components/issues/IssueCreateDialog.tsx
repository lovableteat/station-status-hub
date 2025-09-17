import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, X, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

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

  useEffect(() => {
    if (isOpen) {
      loadSystems();
      loadStations();
      loadTestItems();
      loadEngineers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (newIssue.station_id) {
      loadTestItemsForStation(newIssue.station_id);
    }
  }, [newIssue.station_id]);

  const loadSystems = async () => {
    try {
      const { data, error } = await supabase
        .from('test_systems')
        .select('id, system_name, serial_number')
        .order('system_name');
      
      if (error) throw error;
      setSystems(data || []);
    } catch (error) {
      console.error('Error loading systems:', error);
    }
  };

  const loadStations = async () => {
    try {
      const { data, error } = await supabase
        .from('test_flow_stations')
        .select('id, station_name')
        .order('station_order');
      
      if (error) throw error;
      setStations(data || []);
    } catch (error) {
      console.error('Error loading stations:', error);
    }
  };

  const loadTestItems = async () => {
    try {
      const { data, error } = await supabase
        .from('test_flow_items')
        .select('id, item_name, station_id')
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
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length !== files.length) {
      toast({
        title: "檔案類型錯誤",
        description: "請只選擇圖片檔案",
        variant: "destructive"
      });
    }
    
    setSelectedFiles(prev => [...prev, ...imageFiles]);
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
    if (!newIssue.title || !newIssue.description) {
      toast({
        title: "資料不完整",
        description: "請填寫問題標題和描述",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('issues')
        .insert([{
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

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          新增問題
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增問題</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 p-1">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左側：基本資訊 */}
            <div className="lg:col-span-2 space-y-4">
              <div>
                <Label htmlFor="title">問題標題 *</Label>
                <Input
                  id="title"
                  placeholder="請輸入問題標題..."
                  value={newIssue.title}
                  onChange={(e) => setNewIssue(prev => ({ ...prev, title: e.target.value }))}
                  disabled={isLoading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="priority">優先級</Label>
                  <Select 
                    value={newIssue.priority} 
                    onValueChange={(value) => setNewIssue(prev => ({ ...prev, priority: value as any }))}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">低</SelectItem>
                      <SelectItem value="medium">中</SelectItem>
                      <SelectItem value="high">高</SelectItem>
                      <SelectItem value="critical">緊急</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="status">狀態</Label>
                  <Select 
                    value={newIssue.status} 
                    onValueChange={(value) => setNewIssue(prev => ({ ...prev, status: value as any }))}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">開啟</SelectItem>
                      <SelectItem value="in_progress">處理中</SelectItem>
                      <SelectItem value="resolved">已解決</SelectItem>
                      <SelectItem value="closed">已關閉</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="assigned_to">負責人</Label>
                <Select 
                  value={newIssue.assigned_to} 
                  onValueChange={(value) => setNewIssue(prev => ({ ...prev, assigned_to: value }))}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="請選擇負責人..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">未指派</SelectItem>
                    {engineers.map(engineer => (
                      <SelectItem key={engineer.id} value={engineer.name}>
                        {engineer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="system">相關機台</Label>
                  <Select 
                    value={newIssue.system_id} 
                    onValueChange={(value) => setNewIssue(prev => ({ ...prev, system_id: value }))}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇機台" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">無</SelectItem>
                      {systems.map(system => (
                        <SelectItem key={system.id} value={system.id}>
                          {system.system_name}{system.serial_number ? ` (${system.serial_number})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="station">相關站點</Label>
                  <Select 
                    value={newIssue.station_id} 
                    onValueChange={(value) => {
                      setNewIssue(prev => ({ ...prev, station_id: value, test_item_id: "" }));
                    }}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇站點" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">無</SelectItem>
                      {stations.map(station => (
                        <SelectItem key={station.id} value={station.id}>
                          {station.station_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="test_item">相關測項</Label>
                  <Select 
                    value={newIssue.test_item_id} 
                    onValueChange={(value) => setNewIssue(prev => ({ ...prev, test_item_id: value }))}
                    disabled={isLoading || !newIssue.station_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇測項" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">無</SelectItem>
                      {filteredTestItems.map(item => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.item_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="relate">相關項目</Label>
                  <Input
                    id="relate"
                    placeholder="請輸入相關項目..."
                    value={newIssue.relate}
                    onChange={(e) => setNewIssue(prev => ({ ...prev, relate: e.target.value }))}
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <Label htmlFor="category">問題分類</Label>
                  <Input
                    id="category"
                    placeholder="請輸入問題分類..."
                    value={newIssue.category}
                    onChange={(e) => setNewIssue(prev => ({ ...prev, category: e.target.value }))}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">問題描述 *</Label>
                <RichTextEditor
                  content={newIssue.description}
                  onChange={(content) => setNewIssue(prev => ({ ...prev, description: content }))}
                  placeholder="請詳細描述問題..."
                  className="min-h-[120px]"
                  disableImageUpload={true}
                />
              </div>

              <div>
                <Label htmlFor="process_notes">處理過程</Label>
                <RichTextEditor
                  content={newIssue.process_notes}
                  onChange={(content) => setNewIssue(prev => ({ ...prev, process_notes: content }))}
                  placeholder="請記錄詳細的處理過程，包含：&#10;1. 問題分析與診斷&#10;2. 解決方案制定&#10;3. 實施步驟記錄&#10;4. 測試驗證結果&#10;5. 後續追蹤事項"
                  className="min-h-[100px]"
                  disableImageUpload={true}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  處理過程記錄有助於問題的追蹤和經驗積累
                </div>
              </div>

              <div>
                <Label htmlFor="solution">解決方案</Label>
                <RichTextEditor
                  content={newIssue.solution}
                  onChange={(content) => setNewIssue(prev => ({ ...prev, solution: content }))}
                  placeholder="請記錄解決方案..."
                  className="min-h-[100px]"
                  disableImageUpload={true}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  詳細記錄解決方案有助於類似問題的快速處理
                </div>
              </div>
            </div>

            {/* 右側：附件管理 */}
            <div className="space-y-4">
              <div>
                <Label>附件管理</Label>
                <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                  <div className="text-sm font-medium">上傳檔案</div>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileSelect}
                    className="text-sm"
                  />
                  <div className="text-xs text-muted-foreground">
                    支援圖片、PDF、Word文件等格式
                  </div>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <div className="text-sm font-medium">待上傳檔案</div>
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                        <div className="flex-1 truncate">
                          <div className="font-medium">{file.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
              取消
            </Button>
            <Button onClick={createIssue} disabled={!newIssue.title || !newIssue.description || isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? "建立中..." : "建立問題"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}