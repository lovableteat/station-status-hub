import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, Key, Check } from "lucide-react";

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyCreated: () => void;
}

export function CreateApiKeyDialog({ open, onOpenChange, onKeyCreated }: CreateApiKeyDialogProps) {
  const [formData, setFormData] = useState({
    keyName: '',
    description: '',
    permissions: {
      read: true,
      write: false
    },
    expiresAt: ''
  });
  const [loading, setLoading] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setFormData({
      keyName: '',
      description: '',
      permissions: {
        read: true,
        write: false
      },
      expiresAt: ''
    });
    setGeneratedKey(null);
    setCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const createApiKey = async () => {
    if (!formData.keyName.trim()) {
      toast.error('請輸入金鑰名稱');
      return;
    }

    setLoading(true);
    try {
      // Generate new API key
      const { data: keyData, error: keyError } = await supabase
        .rpc('generate_api_key');

      if (keyError) throw keyError;

      // Insert the new API key
      const { error: insertError } = await supabase
        .from('api_keys')
        .insert({
          key_name: formData.keyName.trim(),
          api_key: keyData,
          description: formData.description.trim() || null,
          permissions: formData.permissions,
          expires_at: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
          is_active: true
        });

      if (insertError) throw insertError;

      setGeneratedKey(keyData);
      toast.success('API 金鑰建立成功！');
      onKeyCreated();
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('建立 API 金鑰失敗');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!generatedKey) return;
    
    try {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('已複製到剪貼簿');
    } catch (error) {
      toast.error('複製失敗');
    }
  };

  if (generatedKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              API 金鑰建立成功
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-2">重要提醒</h4>
              <p className="text-sm text-amber-700">
                請立即複製並妥善保存此 API 金鑰。為了安全考慮，我們不會再次顯示完整的金鑰。
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                <Label className="text-sm font-medium">API 金鑰</Label>
                <div className="flex items-center gap-2 mt-2">
                  <code className="flex-1 p-3 bg-muted rounded text-sm font-mono break-all">
                    {generatedKey}
                  </code>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={copyToClipboard}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">金鑰名稱</Label>
                <p className="text-sm text-muted-foreground mt-1">{formData.keyName}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">權限</Label>
                <div className="flex gap-2 mt-1">
                  {formData.permissions.read && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">讀取</span>
                  )}
                  {formData.permissions.write && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">寫入</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={handleClose}>
                完成
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            建立新的 API 金鑰
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="keyName">金鑰名稱 *</Label>
            <Input
              id="keyName"
              placeholder="例如：外部系統整合"
              value={formData.keyName}
              onChange={(e) => setFormData(prev => ({ ...prev, keyName: e.target.value }))}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="description">描述（可選）</Label>
            <Textarea
              id="description"
              placeholder="描述此 API 金鑰的用途..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="mt-1"
            />
          </div>

          <div>
            <Label>權限設定</Label>
            <div className="space-y-2 mt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="read"
                  checked={formData.permissions.read}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({
                      ...prev,
                      permissions: { ...prev.permissions, read: !!checked }
                    }))
                  }
                />
                <Label htmlFor="read" className="text-sm">
                  讀取權限 - 可以獲取資料（問題、系統狀態等）
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="write"
                  checked={formData.permissions.write}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({
                      ...prev,
                      permissions: { ...prev.permissions, write: !!checked }
                    }))
                  }
                />
                <Label htmlFor="write" className="text-sm">
                  寫入權限 - 可以建立和修改資料
                </Label>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="expiresAt">到期時間（可選）</Label>
            <Input
              id="expiresAt"
              type="datetime-local"
              value={formData.expiresAt}
              onChange={(e) => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={createApiKey} disabled={loading}>
              {loading ? '建立中...' : '建立金鑰'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}