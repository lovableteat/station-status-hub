import { type ReactNode, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { BomSeries, BomSeriesVersion } from "./bomVersioning";
import type { BomProjectGroup } from "./materialRequestPresentation";
import "./materialMobileBomPicker.css";

const PAGE_SIZE = 50;

export function MaterialMobileBomPicker({ groups, value, onValueChange, historicalVersion, children }: {
  groups: BomProjectGroup<BomSeries>[];
  value: string;
  onValueChange: (value: string) => void;
  historicalVersion?: { name: string; version: BomSeriesVersion };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => {
    const items = groups.flatMap(group => group.workspaces.map(series => ({
      id: series.current.workspace.id, name: series.name, project: group.label,
      version: series.current.displayNumber, count: series.recordCount, activeProject: group.isActive,
    })));
    if (historicalVersion) items.push({ id: value, name: historicalVersion.name, project: "檢視中的歷史版本", version: `${historicalVersion.version.displayNumber}（歷史）`, count: historicalVersion.version.workspace.payload.recordCount, activeProject: false });
    return items;
  }, [groups, historicalVersion, value]);
  const search = query.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = useMemo(() => options.filter(option => `${option.name} ${option.project}`.normalize("NFKC").toLocaleLowerCase().includes(search)), [options, search]);
  const current = options.find(option => option.id === value);
  const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const changePage = (next: number) => { setPage(next); listRef.current?.scrollTo({ top: 0 }); };
  return (
    <Dialog open={open} onOpenChange={next => { setOpen(next); if (next) { setQuery(""); setPage(0); } }}>
      <DialogTrigger asChild>
        <button type="button" className="material-mobile-context inline-flex items-center justify-between" aria-label="切換 BOM">{children}<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" /></button>
      </DialogTrigger>
      <DialogContent hideCloseButton className="material-mobile-bom-picker" data-testid="material-mobile-bom-picker" onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.focus(); }}>
        <header className="material-mobile-bom-picker-heading">
          <div><DialogTitle>切換 BOM</DialogTitle><DialogDescription title={current ? `${current.name} · ${current.version}` : undefined}>目前：{current ? `${current.name} · ${current.version}` : "未選擇"}</DialogDescription></div>
          <DialogClose asChild><Button ref={closeRef} type="button" variant="ghost" aria-label="關閉 BOM 選擇"><X aria-hidden="true" /></Button></DialogClose>
        </header>
        <div className="material-mobile-bom-picker-search"><Search aria-hidden="true" /><Input aria-label="搜尋 BOM 或專案" placeholder="搜尋 BOM 或專案" value={query} onChange={event => { setQuery(event.target.value); setPage(0); listRef.current?.scrollTo({ top: 0 }); }} />{query && <Button type="button" variant="ghost" aria-label="清除 BOM 搜尋" onClick={() => { setQuery(""); setPage(0); }}><X aria-hidden="true" /></Button>}</div>
        <p className="material-mobile-bom-picker-count" role="status">{query ? `找到 ${matches.length.toLocaleString()} / ${options.length.toLocaleString()} 個 BOM` : `${options.length.toLocaleString()} 個 BOM`}</p>
        <div ref={listRef} className="material-mobile-bom-picker-list" role="group" aria-label="BOM 選擇結果">
          {visible.map(option => <button key={option.id} type="button" className="material-mobile-bom-picker-option" aria-pressed={option.id === value} onClick={() => { onValueChange(option.id); setOpen(false); }}>
            <span className="material-mobile-bom-picker-copy"><strong title={option.name}>{option.name}</strong><span><span title={option.project}>{option.project}{option.activeProject ? " · 目前專案" : ""}</span><span>{option.version} · {option.count.toLocaleString()} 筆</span></span></span>
            {option.id === value && <Check aria-label="目前 BOM" />}
          </button>)}
          {matches.length === 0 && <p className="material-mobile-bom-picker-empty">沒有符合的 BOM，請調整搜尋文字</p>}
        </div>
        <footer className="material-mobile-bom-picker-footer"><span>{matches.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, matches.length)} / ${matches.length.toLocaleString()}` : "0 個結果"}</span><div><Button type="button" variant="outline" aria-label="上一頁 BOM" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}><ChevronLeft aria-hidden="true" /></Button><span>{currentPage + 1} / {totalPages}</span><Button type="button" variant="outline" aria-label="下一頁 BOM" disabled={currentPage + 1 >= totalPages} onClick={() => changePage(currentPage + 1)}><ChevronRight aria-hidden="true" /></Button></div></footer>
      </DialogContent>
    </Dialog>
  );
}
