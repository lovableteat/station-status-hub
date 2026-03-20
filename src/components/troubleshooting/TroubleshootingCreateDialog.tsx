import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/components/auth/UserContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  issueTypes: string[];
}

export function TroubleshootingCreateDialog({ open, onOpenChange, onCreated, issueTypes }: Props) {
  const { user } = useUser();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    issue_type: 'Other',
    issue_category: 'hardware',
    severity: 'medium',
    description: '',
    root_cause: '',
    solution: '',
  });

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast({ title: "請輸入問題標題", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('troubleshooting_records').insert({
        title: form.title,
        issue_type: form.issue_type,
        issue_category: form.issue_category,
        severity: form.severity,
        description: form.description || null,
        root_cause: form.root_cause || null,
        solution: form.solution || null,
        reported_by: user?.username || null,
        status: 'open',
      });

      if (error) throw error;

      toast({ title: "新增成功", description: "故障排除記錄已建立" });
      onCreated();
      onOpenChange(false);
      setForm({ title: '', issue_type: 'Other', issue_category: 'hardware', severity: 'medium', description: '', root_cause: '', solution: '' });
    } catch (error) {
      console.error('新增失敗:', error);
      toast({ title: "新增失敗", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>新增故障排除記錄</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>問題標題 *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="簡述問題..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>問題類型</Label>
              <Select value={form.issue_type} onValueChange={(v) => setForm(f => ({ ...f, issue_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {issueTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>問題分類</Label>
              <Select value={form.issue_category} onValueChange={(v) => setForm(f => ({ ...f, issue_category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hardware">硬體</SelectItem>
                  <SelectItem value="software">軟體</SelectItem>
                  <SelectItem value="network">網路</SelectItem>
                  <SelectItem value="power">電源</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>嚴重度</Label>
            <Select value={form.severity} onValueChange={(v) => setForm(f => ({ ...f, severity: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">嚴重</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="low">低</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>問題描述</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="詳細描述問題..."
              rows={3}
            />
          </div>
          <div>
            <Label>根本原因</Label>
            <Textarea
              value={form.root_cause}
              onChange={(e) => setForm(f => ({ ...f, root_cause: e.target.value }))}
              placeholder="分析根本原因..."
              rows={2}
            />
          </div>
          <div>
            <Label>解決方案</Label>
            <Textarea
              value={form.solution}
              onChange={(e) => setForm(f => ({ ...f, solution: e.target.value }))}
              placeholder="解決方式..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '新增中...' : '新增'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
