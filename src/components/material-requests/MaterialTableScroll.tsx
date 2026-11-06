import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function MaterialTableScroll({ children }: { children: ReactNode }) {
  const tableScrollId = useId();
  const topScroll = useRef<HTMLDivElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState({ viewport: 0, content: 0 });

  useLayoutEffect(() => {
    const viewport = tableScroll.current;
    const table = viewport?.firstElementChild;
    if (!viewport || !table) return;

    const measure = () => {
      const next = { viewport: viewport.clientWidth, content: viewport.scrollWidth };
      setWidths(current => current.viewport === next.viewport && current.content === next.content ? current : next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(table);
    return () => observer.disconnect();
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
