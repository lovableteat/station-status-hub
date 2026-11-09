import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function MaterialTableScroll({ children }: { children: ReactNode }) {
  const tableScrollId = useId();
  const topScroll = useRef<HTMLDivElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState({ viewport: 0, content: 0, maxHeight: undefined as number | undefined });

  useLayoutEffect(() => {
    const viewport = tableScroll.current;
    const table = viewport?.firstElementChild;
    if (!viewport || !table) return;
    const workspace = viewport.closest('.material-sheet-theme');
    const pagination = viewport.closest('section')?.querySelector('[data-testid="material-pagination"]');

    const measure = () => {
      // Reserve the actual footer and toolbar space when browser zoom changes their wrapping.
      const maxHeight = window.innerWidth >= 1024
        ? Math.max(120, Math.floor((window.visualViewport?.height ?? window.innerHeight) - viewport.getBoundingClientRect().top - window.scrollY - (pagination?.getBoundingClientRect().height ?? 0) - 16))
        : undefined;
      const next = { viewport: viewport.clientWidth, content: viewport.scrollWidth, maxHeight };
      setWidths(current => current.viewport === next.viewport && current.content === next.content && current.maxHeight === next.maxHeight ? current : next);
    };
    let frame = 0;
    const scheduleMeasure = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };

    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(viewport);
    observer.observe(table);
    if (workspace) observer.observe(workspace);
    if (pagination) observer.observe(pagination);
    window.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
    };
  }, []);

  useLayoutEffect(() => {
    if (topScroll.current && tableScroll.current) topScroll.current.scrollLeft = tableScroll.current.scrollLeft;
  }, [widths]);

  return <>
    {widths.content > widths.viewport && <div
      ref={topScroll}
      className="material-table-top-scroll"
      style={{ width: widths.viewport }}
      role="region"
      aria-label="BOM 表格左右捲動"
      aria-controls={tableScrollId}
      tabIndex={0}
      onScroll={event => {
        const left = event.currentTarget.scrollLeft;
        if (tableScroll.current && tableScroll.current.scrollLeft !== left) tableScroll.current.scrollLeft = left;
      }}
    >
      <div aria-hidden="true" style={{ width: widths.content, height: 1 }} />
    </div>}
    <div
      ref={tableScroll}
      id={tableScrollId}
      className="relative max-h-[72vh] overflow-auto"
      style={{ maxHeight: widths.maxHeight }}
      data-testid="material-table-scroll"
      onScroll={event => {
        const left = event.currentTarget.scrollLeft;
        if (topScroll.current && topScroll.current.scrollLeft !== left) topScroll.current.scrollLeft = left;
      }}
    >
      {children}
    </div>
  </>;
}
