export function clearMaterialCrosshair(table: HTMLTableElement) {
  table.querySelectorAll("[data-crosshair-row], [data-crosshair-column], [data-crosshair-active]").forEach(element => {
    element.removeAttribute("data-crosshair-row");
    element.removeAttribute("data-crosshair-column");
    element.removeAttribute("data-crosshair-active");
  });
}

export function markMaterialCrosshair(table: HTMLTableElement, target: EventTarget | null) {
  const cell = target instanceof Element ? target.closest<HTMLTableCellElement>("td, th") : null;
  if (!cell || cell.closest("table") !== table || cell.colSpan !== 1) return;
  if (table.querySelector("[data-crosshair-active]") === cell) return;
  clearMaterialCrosshair(table);
  const column = cell.cellIndex;
  Array.from(table.rows).forEach(row => {
    if (row.cells.length === table.tHead?.rows[0]?.cells.length) row.cells[column]?.setAttribute("data-crosshair-column", "true");
  });
  cell.parentElement?.setAttribute("data-crosshair-row", "true");
  cell.setAttribute("data-crosshair-active", "true");
}
