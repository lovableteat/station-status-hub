import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadSystems();
      loadStations();
      loadTestItems();
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
        .select('id, system_name')
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增問題</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="title">問題標題 *</Label>
              <Input
                id="title"
                placeholder="請輸入問題標題..."
                value={newIssue.title}
                onChange={(e) => setNewIssue(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            
            <div className="col-span-2">
              <Label htmlFor="description">問題描述 *</Label>
              <Textarea
                id="description"
                placeholder="請詳細描述問題..."
                value={newIssue.description}
                onChange={(e) => setNewIssue(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="priority">優先級</Label>
              <Select value={newIssue.priority} onValueChange={(value) => setNewIssue(prev => ({ ...prev, priority: value as any }))}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇優先級" />
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
              <Select value={newIssue.status} onValueChange={(value) => setNewIssue(prev => ({ ...prev, status: value as any }))}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">開啟</SelectItem>
                  <SelectItem value="in_progress">處理中</SelectItem>
                  <SelectItem value="resolved">已解決</SelectItem>
                  <SelectItem value="closed">已關閉</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="assigned_to">指派給</Label>
              <Input
                id="assigned_to"
                placeholder="負責人姓名"
                value={newIssue.assigned_to}
                onChange={(e) => setNewIssue(prev => ({ ...prev, assigned_to: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="system">相關機台</Label>
              <Select value={newIssue.system_id} onValueChange={(value) => setNewIssue(prev => ({ ...prev, system_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇機台" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">無</SelectItem>
                  {systems.map(system => (
                    <SelectItem key={system.id} value={system.id}>
                      {system.system_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="station">相關站點</Label>
              <Select value={newIssue.station_id} onValueChange={(value) => setNewIssue(prev => ({ ...prev, station_id: value, test_item_id: "" }))}>
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
                disabled={!newIssue.station_id}
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

            <div>
              <Label htmlFor="relate">相關項目</Label>
              <Input
                id="relate"
                placeholder="請輸入相關項目"
                value={newIssue.relate}
                onChange={(e) => setNewIssue(prev => ({ ...prev, relate: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="category">問題分類</Label>
              <Select value={newIssue.category} onValueChange={(value) => setNewIssue(prev => ({ ...prev, category: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇問題來源" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">無</SelectItem>
                  <SelectItem value="L10">L10</SelectItem>
                  <SelectItem value="L11">L11</SelectItem>
                  <SelectItem value="EK7">EK7</SelectItem>
                  <SelectItem value="其他">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="process_notes">處理過程</Label>
              <Textarea
                id="process_notes"
                placeholder="請記錄處理過程..."
                value={newIssue.process_notes}
                onChange={(e) => setNewIssue(prev => ({ ...prev, process_notes: e.target.value }))}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="solution">解決方案</Label>
              <Textarea
                id="solution"
                placeholder="請記錄解決方案..."
                value={newIssue.solution}
                onChange={(e) => setNewIssue(prev => ({ ...prev, solution: e.target.value }))}
                rows={3}
              />
            </div>

            {/* 照片上傳區域 */}
            <div className="col-span-2">
              <Label>上傳照片</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('photo-upload')?.click()}
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    選擇照片
                  </Button>
                  <input
                    id="photo-upload"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <span className="text-sm text-muted-foreground">
                    支援 JPG, PNG, GIF 格式
                  </span>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">已選擇的照片：</p>
                    <div className="space-y-1">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                          <span className="text-sm truncate">{file.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(1)} KB
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2 flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
                取消
              </Button>
              <Button onClick={createIssue} disabled={!newIssue.title || !newIssue.description || isLoading}>
                {isLoading ? "建立中..." : "建立問題"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}