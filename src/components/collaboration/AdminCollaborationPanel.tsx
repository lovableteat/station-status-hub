import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Radio,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUserPresence } from "@/hooks/useUserPresence";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Recipient {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  status: string | null;
}

interface AnnouncementRow {
  grouped_id: string | null;
  title: string;
  message: string;
  sender_id: string;
  recipient_id: string;
  created_at: string;
  is_read: boolean;
}

interface AnnouncementGroup {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  recipientCount: number;
  readCount: number;
}

const moduleLabels: Record<string, string> = {
  dashboard: "系統儀表板",
  "test-tracker": "L10 測試追蹤",
  "flow-info": "L10 流程設定",
  monitor: "生產監控牆",
  issues: "問題追蹤",
  tools: "工具與資產",
  users: "後台管理",
  collaboration: "通知與在線",
  "api-management": "API 管理",
  "material-requests": "料號申請",
  "data-center": "Data-center",
  "ai-chat": "資料查詢空間",
};

function groupAnnouncements(rows: AnnouncementRow[]): AnnouncementGroup[] {
  const grouped = new Map<string, AnnouncementGroup>();
  rows.forEach((row) => {
    const key = row.grouped_id || `${row.sender_id}:${row.title}:${row.created_at}`;
    const current = grouped.get(key);
    if (current) {
      current.recipientCount += 1;
      if (row.is_read) current.readCount += 1;
      return;
    }
    grouped.set(key, {
      id: key,
      title: row.title,
      message: row.message,
      createdAt: row.created_at,
      recipientCount: 1,
      readCount: row.is_read ? 1 : 0,
    });
  });
  return [...grouped.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function isMissingAnnouncementRpc(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return ["42883", "PGRST202"].includes(error.code || "") ||
    Boolean(error.message?.includes("send_admin_announcement"));
}

export function AdminCollaborationPanel({ canSend }: { canSend: boolean }) {
  const { user } = useUser();
  const { allOnlineUsers, connectionStatus } = useUserPresence();
  const { toast } = useToast();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [history, setHistory] = useState<AnnouncementGroup[]>([]);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [usersResult, historyResult] = await Promise.all([
      supabase
        .from("system_users")
        .select("id,username,display_name,role,status")
        .eq("status", "active")
        .order("display_name", { ascending: true }),
      supabase
        .from("user_notifications")
        .select("grouped_id,title,message,sender_id,recipient_id,created_at,is_read")
        .eq("notification_type", "admin_announcement")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    if (usersResult.error || historyResult.error) {
      setError("協作資料載入失敗，請確認網路連線後重試。");
    } else {
      setRecipients((usersResult.data || []) as Recipient[]);
      setHistory(groupAnnouncements((historyResult.data || []) as AnnouncementRow[]));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const targetCount = audience === "all" ? recipients.length : selectedIds.length;
  const canSubmit = canSend && title.trim().length > 0 && message.trim().length > 0 && targetCount > 0;

  const toggleRecipient = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const sendAnnouncement = async () => {
    if (!user?.userId || !canSubmit || sending) return;
    setSending(true);
    const recipientIds = audience === "all" ? recipients.map((recipient) => recipient.id) : selectedIds;
    const metadata = { module: "collaboration", senderName: user.displayName || user.username };
    let { data, error: sendError } = await supabase.rpc("send_admin_announcement", {
      p_sender_id: user.userId,
      p_recipient_ids: audience === "all" ? null : selectedIds,
      p_title: title.trim(),
      p_message: message.trim(),
      p_metadata: metadata,
    });

    // Older deployments may not have the RPC yet. Existing notification RLS still
    // allows administrators to publish, so keep the feature usable during rollout.
    if (isMissingAnnouncementRpc(sendError)) {
      const groupedId = crypto.randomUUID();
      const fallbackResult = await supabase.from("user_notifications").insert(
        recipientIds.map((recipientId) => ({
          grouped_id: groupedId,
          message: message.trim(),
          metadata,
          notification_type: "admin_announcement",
          priority: "normal",
          recipient_id: recipientId,
          sender_id: user.userId,
          title: title.trim(),
        })),
      );
      sendError = fallbackResult.error;
      data = sendError ? null : { groupId: groupedId, recipientCount: recipientIds.length };
    }
    setSending(false);

    if (sendError) {
      toast({
        title: "公告發送失敗",
        description: sendError.message || "請稍後再試。",
        variant: "destructive",
      });
      return;
    }

    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    toast({
      title: "公告已送出",
      description: `已送達 ${Number(result.recipientCount || targetCount)} 個啟用帳號。`,
    });
    setTitle("");
    setMessage("");
    setSelectedIds([]);
    setAudience("all");
    await loadData();
  };

  const onlineByModule = useMemo(() => {
    const result = new Map<string, number>();
    allOnlineUsers.forEach((onlineUser) => {
      const key = onlineUser.currentModule || "dashboard";
      result.set(key, (result.get(key) || 0) + 1);
    });
    return [...result.entries()].sort((a, b) => b[1] - a[1]);
  }, [allOnlineUsers]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-cyan-200/20 bg-[#0b1b2d] text-slate-400">
        <LoaderCircle className="mr-3 h-6 w-6 animate-spin text-cyan-300" />正在同步協作資料
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-400/5 p-6 text-center">
        <p className="font-semibold text-rose-100">{error}</p>
        <Button onClick={() => void loadData()} className="mt-4 rounded-xl">
          <RefreshCw className="mr-2 h-4 w-4" />重新載入
        </Button>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <section className="rounded-2xl border border-cyan-200/25 bg-[linear-gradient(145deg,#10263a,#0b1b2d)] p-5 shadow-[0_22px_60px_-46px_rgba(34,211,238,0.9)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold text-slate-50">
              <BellRing className="h-5 w-5 text-cyan-300" />發布全站公告
            </div>
            <p className="mt-1 text-sm text-slate-400">公告會立即出現在使用者右上角的協作中心，不需要重新整理。</p>
          </div>
          <Badge className="bg-cyan-300/15 text-cyan-100">{recipients.length} 個啟用帳號</Badge>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setAudience("all")}
              className={cn("rounded-xl border p-4 text-left", audience === "all" ? "border-cyan-300/65 bg-cyan-300/12" : "border-slate-700 bg-[#081726]")}
            >
              <div className="font-semibold text-slate-100">全體啟用帳號</div>
              <div className="mt-1 text-xs text-slate-400">一次通知目前所有可登入帳號</div>
            </button>
            <button
              type="button"
              onClick={() => setAudience("selected")}
              className={cn("rounded-xl border p-4 text-left", audience === "selected" ? "border-cyan-300/65 bg-cyan-300/12" : "border-slate-700 bg-[#081726]")}
            >
              <div className="font-semibold text-slate-100">指定使用者</div>
              <div className="mt-1 text-xs text-slate-400">只通知勾選的同仁</div>
            </button>
          </div>

          {audience === "selected" && (
            <ScrollArea className="h-44 rounded-xl border border-sky-200/15 bg-[#071522] p-2">
              <div className="grid gap-1 sm:grid-cols-2">
                {recipients.map((recipient) => (
                  <label key={recipient.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-sky-300/8">
                    <Checkbox checked={selectedIds.includes(recipient.id)} onCheckedChange={() => toggleRecipient(recipient.id)} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-100">{recipient.display_name || recipient.username}</span>
                      <span className="block truncate text-xs text-slate-500">{recipient.username} · {recipient.role}</span>
                    </span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}

          <label className="grid gap-2 text-sm font-medium text-slate-200">
            公告標題
            <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="例如：今晚 18:00 系統維護" className="h-11 border-sky-200/25 bg-[#071522]" />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-200">
            公告內容
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} placeholder="請輸入影響範圍、時間與同仁需要採取的動作。" className="min-h-32 resize-y border-sky-200/25 bg-[#071522]" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cyan-200/10 pt-4">
            <span className="text-sm text-slate-400">本次預計通知 <strong className="font-mono text-cyan-200">{targetCount}</strong> 人</span>
            <Button onClick={() => void sendAnnouncement()} disabled={!canSubmit || sending} className="h-11 rounded-xl bg-cyan-300 px-5 font-bold text-[#06111f] hover:bg-cyan-200">
              {sending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              立即發布
            </Button>
          </div>
          {!canSend && <p className="text-sm text-amber-200">目前帳號只有檢視權限，無法發布公告。</p>}
        </div>
      </section>

      <div className="grid min-h-0 gap-4 lg:grid-cols-2 xl:grid-cols-1">
        <section className="rounded-2xl border border-emerald-300/20 bg-[#0b1b2d] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-bold text-slate-50"><Users className="h-5 w-5 text-emerald-300" />在線位置</div>
            <Badge className="gap-1.5 bg-emerald-300/15 text-emerald-100"><Radio className="h-3 w-3" />{connectionStatus === "online" ? `${allOnlineUsers.length} 人` : "連線中"}</Badge>
          </div>
          <div className="mt-3 grid gap-2">
            {onlineByModule.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">目前尚未取得在線位置</div>
            ) : onlineByModule.map(([module, count]) => (
              <div key={module} className="flex items-center justify-between rounded-xl border border-sky-200/10 bg-[#071522] px-3 py-2.5">
                <span className="text-sm text-slate-300">{moduleLabels[module] || module}</span>
                <span className="font-mono text-sm font-bold text-emerald-200">{count} 人</span>
              </div>
            ))}
          </div>
        </section>

        <section className="min-h-0 rounded-2xl border border-sky-200/20 bg-[#0b1b2d] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-bold text-slate-50"><Clock3 className="h-5 w-5 text-sky-300" />發送紀錄</div>
            <Button variant="ghost" size="sm" onClick={() => void loadData()} className="text-slate-400"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />更新</Button>
          </div>
          <ScrollArea className="mt-3 h-[310px] pr-2">
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">尚未發布管理公告</div>
              ) : history.map((item) => (
                <article key={item.id} className="rounded-xl border border-sky-200/12 bg-[#071522] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-100">{item.title}</h3>
                    <time className="shrink-0 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-400">{item.message}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />已讀 {item.readCount} / {item.recipientCount}
                  </div>
                </article>
              ))}
            </div>
          </ScrollArea>
        </section>
      </div>
    </div>
  );
}
