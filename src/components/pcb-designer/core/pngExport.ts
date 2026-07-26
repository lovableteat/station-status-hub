import type { PcbBoard } from "../types.ts";

export async function exportPcbSvgAsPng(
  svg: SVGSVGElement,
  filename: string,
  includeGrid: boolean,
  board: Pick<PcbBoard, "width" | "height">,
): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-export-hidden]").forEach((node) => node.remove());
  if (!includeGrid) {
    clone.querySelector('[data-layer="grid"]')?.remove();
  } else {
    clone.querySelectorAll("[data-grid-surface]").forEach((node) =>
      node.removeAttribute("display"));
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  clone.setAttribute("viewBox", `0 0 ${board.width} ${board.height}`);
  const scale = 4;
  const width = Math.max(1, Math.round(board.width * scale));
  const height = Math.max(1, Math.round(board.height * scale));
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("瀏覽器無法建立 PNG 畫布。");
    context.fillStyle = "#081827";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 編碼失敗。")), "image/png"));
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
  } finally {
    URL.revokeObjectURL(url);
  }
}
