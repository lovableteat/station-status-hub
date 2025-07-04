import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload, File, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FileUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function FileUploadDialog({ isOpen, onClose, onSuccess }: FileUploadDialogProps) {
  const [formData, setFormData] = useState({
    tool_name: '',
    category: 'driver',
    version: '',
    description: '',
    is_required: false
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleUpload = async () => {
    if (!selectedFile || !formData.tool_name) {
      toast({
        title: "資訊不完整",
        description: "請填寫工具名稱並選擇檔案",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Upload file to Supabase Storage
      const fileName = `${Date.now()}_${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('task-attachments')
        .getPublicUrl(fileName);

      // Save tool information to database
      const { error: dbError } = await supabase
        .from('tools_management')
        .insert({
          tool_name: formData.tool_name,
          category: formData.category,
          version: formData.version || null,
          description: formData.description || null,
          is_required: formData.is_required,
          file_name: selectedFile.name,
          file_path: publicUrl,
          file_size: selectedFile.size,
          upload_status: 'completed',
          uploaded_by: 'system_user',
          uploaded_at: new Date().toISOString()
        });

      if (dbError) throw dbError;

      clearInterval(progressInterval);
      setUploadProgress(100);

      setTimeout(() => {
        toast({
          title: "上傳成功",
          description: "工具檔案已成功上傳"
        });
        onSuccess();
        handleClose();
      }, 500);

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "上傳失敗",
        description: "檔案上傳過程中發生錯誤",
        variant: "destructive"
      });
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    setFormData({
      tool_name: '',
      category: 'driver',
      version: '',
      description: '',
      is_required: false
    });
    setSelectedFile(null);
    setUploadProgress(0);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'software': return '軟體';
      case 'driver': return '驅動程式';
      case 'config': return '配置檔案';
      case 'document': return '文件';
      default: return category;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新增工具</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>工具名稱 *</Label>
            <Input
              value={formData.tool_name}
              onChange={(e) => setFormData({ ...formData, tool_name: e.target.value })}
              placeholder="請輸入工具名稱..."
            />
          </div>

          <div>
            <Label>類別</Label>
            <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="software">軟體</SelectItem>
                <SelectItem value="driver">驅動程式</SelectItem>
                <SelectItem value="config">配置檔案</SelectItem>
                <SelectItem value="document">文件</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>版本</Label>
            <Input
              value={formData.version}
              onChange={(e) => setFormData({ ...formData, version: e.target.value })}
              placeholder="例如: 1.0.0"
            />
          </div>

          <div>
            <Label>描述</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="請輸入工具描述..."
              rows={3}
            />
          </div>

          <div>
            <Label>檔案上傳</Label>
            <div className="space-y-2">
              {!selectedFile ? (
                <div
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">點擊選擇檔案或拖拽檔案到此處</p>
                  <p className="text-xs text-muted-foreground mt-1">支援所有檔案格式</p>
                </div>
              ) : (
                <div className="border rounded-lg p-3 bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <File className="h-4 w-4 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeSelectedFile}
                      disabled={isUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>上傳進度</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={handleClose}
              disabled={isUploading}
            >
              取消
            </Button>
            <Button 
              onClick={handleUpload}
              disabled={isUploading || !selectedFile || !formData.tool_name}
            >
              {isUploading ? (
                <>上傳中...</>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  上傳工具
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}