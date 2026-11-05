import { useState, type ComponentType } from "react";
import { ChevronDown, ChevronUp, Plus, Settings2, X, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

const SHORTCUT_LIMIT = 4;
const DEFAULT_SHORTCUT_IDS = ["station-status", "material-requests", "pcb-designer", "file-uploads"] as const;

interface ShortcutItem {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
}

interface MobileHomeShortcutsProps {
  items: ShortcutItem[];
  userId?: string;
  onSelect: (id: string) => void;
}

function readShortcutIds(storageKey?: string): readonly string[] {
  if (storageKey) {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
      if (Array.isArray(saved)) {
        return saved.filter((id): id is string => typeof id === "string");
      }
    } catch {
      // Default shortcuts also work when browser storage is blocked or unreadable.
    }
  }
  return DEFAULT_SHORTCUT_IDS;
}

function visibleShortcuts(ids: readonly string[], items: ShortcutItem[]) {
  return [...new Set(ids)].flatMap((id) => {
    const item = items.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  }).slice(0, SHORTCUT_LIMIT);
}

export function MobileHomeShortcuts({ items, userId, onSelect }: MobileHomeShortcutsProps) {
  const storageKey = userId ? `station-mobile-home-shortcuts-v1:${userId}` : undefined;
  const [savedIds, setSavedIds] = useState(() => readShortcutIds(storageKey));
  const [draftIds, setDraftIds] = useState(savedIds);
  const [editing, setEditing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const shortcuts = visibleShortcuts(savedIds, items);
  const draft = visibleShortcuts(draftIds, items);
  const visibleDraftIds = draft.map(({ id }) => id);
  const available = items.filter(({ id }) => !visibleDraftIds.includes(id));
  const canEdit = Boolean(storageKey) && items.length > 0;
  const full = draft.length >= SHORTCUT_LIMIT;

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setDraftIds(shortcuts.map(({ id }) => id));
      setSaveFailed(false);
    }
    setEditing(open);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (!draft[target]) return;
    const next = [...visibleDraftIds];
    [next[index], next[target]] = [next[target], next[index]];
    setDraftIds(next);
  };

  const save = () => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(visibleDraftIds));
    } catch {
      setSaveFailed(true);
      return;
    }
    setSavedIds(visibleDraftIds);
    setEditing(false);
  };

  return (
    <section data-mobile-home-shortcuts="true" aria-labelledby="mobile-shortcut-title">
      <Drawer open={canEdit && editing} onOpenChange={handleOpenChange} shouldScaleBackground={false} autoFocus>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 id="mobile-shortcut-title" className="flex items-center gap-2 text-lg font-black tracking-[-0.03em] text-slate-50">
            <Zap className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            我的快捷
          </h2>
          {canEdit && (
            <DrawerTrigger asChild>
              <Button type="button" variant="ghost" className="min-h-11 px-3 text-primary">
                <Settings2 aria-hidden="true" />
                自訂
              </Button>
            </DrawerTrigger>
          )}
        </div>

        {shortcuts.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {shortcuts.map(({ id, title, icon: Icon }) => (
              <button
                key={id}
                type="button"
                data-mobile-home-shortcut={id}
                onClick={() => onSelect(id)}
                className="group flex min-h-[4.25rem] min-w-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl border border-slate-700/75 bg-[#101b1e] px-1 py-1.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-300/10 text-cyan-300 transition-colors group-active:bg-cyan-300/20">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[11px] font-bold leading-tight text-slate-100">{title}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
            {canEdit ? "點「自訂」加入常用的工作區。" : "目前沒有可加入的工作區。"}
          </p>
        )}

        <DrawerContent className="max-h-[min(90dvh,42rem)] sm:mx-auto sm:max-w-lg md:hidden">
          <DrawerHeader className="shrink-0 px-4 pb-3 pt-1 text-left">
            <DrawerTitle>自訂快捷</DrawerTitle>
            <DrawerDescription className="text-xs leading-relaxed">
              最多選 {SHORTCUT_LIMIT} 個，依清單順序顯示。設定保存在此瀏覽器。
            </DrawerDescription>
          </DrawerHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-3" data-vaul-no-drag>
            <section aria-labelledby="mobile-shortcut-selected-title" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 id="mobile-shortcut-selected-title" className="text-sm font-semibold">已選快捷</h3>
                <span role="status" className="text-xs font-semibold tabular-nums text-primary">
                  <span className="sr-only">已選 </span>{draft.length} / {SHORTCUT_LIMIT}
                </span>
              </div>
              {draft.length > 0 ? (
                <ol className="divide-y divide-border rounded-xl border border-border bg-card">
                  {draft.map(({ id, title }, index) => (
                    <li key={id} className="flex min-h-12 items-center gap-2 py-0.5 pl-2.5 pr-1">
                      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                      <span className="min-w-0 flex-1 break-words text-sm font-medium">{title}</span>
                      <div className="flex shrink-0">
                        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`上移 ${title}`} title="上移" disabled={index === 0} onClick={() => move(index, -1)}>
                          <ChevronUp aria-hidden="true" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`下移 ${title}`} title="下移" disabled={index === draft.length - 1} onClick={() => move(index, 1)}>
                          <ChevronDown aria-hidden="true" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-label={`移除 ${title}`} title="移除" onClick={() => setDraftIds(visibleDraftIds.filter((itemId) => itemId !== id))}>
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">從下方加入工作區。</p>
              )}
            </section>

            {available.length > 0 && (
              <section aria-labelledby="mobile-shortcut-available-title" className="space-y-2">
                <h3 id="mobile-shortcut-available-title" className="text-sm font-semibold">可加入的工作區</h3>
                {full && <p className="text-xs text-muted-foreground">已達上限，先移除一個快捷即可加入其他工作區。</p>}
                <div className="grid grid-cols-2 gap-2">
                  {available.map(({ id, title }) => (
                    <Button
                      key={id}
                      type="button"
                      variant="outline"
                      className="h-auto min-h-11 min-w-0 justify-start whitespace-normal px-2.5 py-2 text-left text-xs"
                      aria-label={`加入 ${title}`}
                      disabled={full}
                      onClick={() => setDraftIds([...visibleDraftIds, id])}
                    >
                      <Plus aria-hidden="true" />
                      {title}
                    </Button>
                  ))}
                </div>
              </section>
            )}
          </div>

          <DrawerFooter className="shrink-0 gap-1 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            {saveFailed && <p role="alert" className="px-1 text-sm text-destructive">此瀏覽器無法儲存快捷設定，請檢查網站的儲存權限後重試。</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="ghost" className="px-2 text-muted-foreground" onClick={() => setDraftIds(DEFAULT_SHORTCUT_IDS)}>
                恢復預設
              </Button>
              <div className="ml-auto flex gap-2">
                <DrawerClose asChild>
                  <Button type="button" variant="outline">取消</Button>
                </DrawerClose>
                <Button type="button" aria-label="儲存快捷" onClick={save}>儲存</Button>
              </div>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
