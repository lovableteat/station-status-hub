
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Upload, X, Image } from "lucide-react";

interface IssueCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onIssueCreated: () => void;
}

export function IssueCreateDialog({ open, onClose, onIssueCreated }: IssueCreateDialogProps) {
  const { systems, stations, testItems } = useUnifiedData();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    system_id: "",
    station_id: "",
    test_item_id: "",
    assigned_to: ""
  });
  
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length !== files.length) {
      toast({
        title: "檔案類型錯誤",
        description: "只能上傳圖片檔案",
        variant: "destructive"
      });
    }
    
    setSelectedFiles(prev => [...prev, ...imageFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (issueId: string) => {
    const uploadPromises = selectedFiles.map(async (file) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${issueId}/${Date.now()}.${fileExt}`;
      
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
    });

    await Promise.all(uploadPromises);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.description.trim()) {
      toast({
        title: "請填寫必要資訊",
        description: "標題和描述為必填欄位",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // 建立問題記錄
      const { data: issue, error: issueError } = await supabase
        .from('issues')
        .insert({
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          system_id: formData.system_id || null,
          station_id: formData.station_id || null,
          test_item_id: formData.test_item_id || null,
          assigned_to: formData.assigned_to || null,
          status: 'open'
        })
        .select()
        .single();

      if (issueError) throw issueError;

      // 上傳附件
      if (selectedFiles.length > 0) {
        await uploadFiles(issue.id);
      }

      toast({
        title: "問題建立成功",
        description: "問題已成功建立並儲存"
      });

      onIssueCreated();
      onClose();
      
      // 重置表單
      setFormData({
        title: "",
        description: "",
        priority: "medium",
        system_id: "",
        station_id: "",
        test_item_id: "",
        assigned_to: ""
      });
      setSelectedFiles([]);

    } catch (error) {
      console.error('Error creating issue:', error);
      toast({
        title: "建立失敗",
        description: "無法建立問題，請重試",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedStation = stations.find(s => s.id === formData.station_id);
  const availableTestItems = selectedStation 
    ? testItems.filter(item => item.station_id === selectedStation.id)
    : [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增問題</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">問題標題 *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="輸入問題標題"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">優先級</Label>
              <Select value={formData.priority} onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">問題描述 *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="詳細描述問題..."
              rows={4}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="system">相關系統</Label>
              <Select value={formData.system_id} onValueChange={(value) => setFormData(prev => ({ ...prev, system_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇系統" />
                </SelectTrigger>
                <SelectContent>
                  {systems.map((system) => (
                    <SelectItem key={system.id} value={system.id}>
                      {system.system_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="station">相關站點</Label>
              <Select value={formData.station_id} onValueChange={(value) => setFormData(prev => ({ ...prev, station_id: value, test_item_id: "" }))}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇站點" />
                </SelectTrigger>
                <SelectContent>
                  {stations.map((station) => (
                    <SelectItem key={station.id} value={station.id}>
                      {station.station_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="test_item">相關測項</Label>
              <Select 
                value={formData.test_item_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, test_item_id: value }))}
                disabled={!selectedStation}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇測項" />
                </SelectTrigger>
                <SelectContent>
                  {availableTestItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.item_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assigned_to">指派給</Label>
            <Input
              id="assigned_to"
              value={formData.assigned_to}
              onChange={(e) => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
              placeholder="輸入負責人姓名"
            />
          </div>

          {/* 照片上傳區域 */}
          <div className="space-y-2">
            <Label>上傳照片</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="text-center">
                <input
                  type="file"
                  id="file-upload"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-gray-400" />
                    <span className="text-sm text-gray-600">點擊選擇圖片或拖拽至此</span>
                  </div>
                </Label>
              </div>
            </div>

            {/* 已選擇的檔案預覽 */}
            {selectedFiles.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="relative group">
                    <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="mt-1 text-xs text-gray-600 truncate">
                      {file.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "建立中..." : "建立問題"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
