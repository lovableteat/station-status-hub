import type { PresentationDraft } from "@/components/api-management/pptxGeneration";

const FONT_FACE = "Microsoft JhengHei";
const PAGE_WIDTH = 13.3333;
const MARGIN = 0.85;
const TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const DARK = "13282B";
const TEAL = "19675E";
const MINT = "9BE0CC";
const PAPER = "FAF9F5";
const WHITE = "F7FCFB";
const SOFT_GREEN = "D4E5E0";
const MUTED = "536664";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function estimatedLines(text: string, fontSize: number, boxWidth = TEXT_WIDTH) {
  const estimatedWidth = Array.from(text).reduce((width, character) => (
    width + (character === " " ? 0.4 : /^[\x00-\x7F]$/.test(character) ? 0.72 : 1)
  ), 0) * fontSize;
  return Math.max(1, Math.ceil(estimatedWidth / (boxWidth * 72 * 0.95)));
}

function headingHeight(text: string, fontSize: number) {
  return estimatedLines(text, fontSize) * fontSize * 1.24 / 72 + 0.12;
}

function bulletStyle(bullets: string[], height: number, cover: boolean) {
  // PowerPoint does not apply its "shrink on overflow" hint consistently on open.
  // Fit the most compact allowed drafts before writing the editable text box.
  for (let fontSize = cover ? 19 : 21; fontSize >= 16; fontSize--) {
    const lineSpacing = Math.round(fontSize * 1.24);
    const paraSpaceAfter = fontSize < 19 ? 4 : cover ? 6 : 10;
    const lines = bullets.reduce((count, bullet) => count + estimatedLines(bullet, fontSize, TEXT_WIDTH - 0.34), 0);
    const requiredHeight = (lines * lineSpacing + (bullets.length - 1) * paraSpaceAfter) / 72 + 0.1;
    if (requiredHeight <= height) return { fontSize, lineSpacing, paraSpaceAfter };
  }
  return { fontSize: 16, lineSpacing: 19, paraSpaceAfter: 3 };
}

export async function createAiPresentationBlob(draft: PresentationDraft): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = draft.title;
  pptx.theme = { headFontFace: FONT_FACE, bodyFontFace: FONT_FACE };

  draft.slides.forEach((content, index) => {
    const slide = pptx.addSlide();
    const cover = index === 0;
    const textColor = cover ? WHITE : DARK;
    slide.background = { color: cover ? DARK : PAPER };

    const textBox = { x: MARGIN, w: TEXT_WIDTH, margin: 0, valign: "top" as const, fontFace: FONT_FACE, fit: "shrink" as const };
    const title = cover ? draft.title : content.title;
    const titleSize = cover && estimatedLines(title, 42) <= 2 ? 42 : 32;
    const titleTop = cover ? 0.76 : 0.7;
    const titleHeight = headingHeight(title, titleSize);
    slide.addText(title, {
      ...textBox, y: titleTop, h: titleHeight,
      color: textColor, bold: true, fontSize: titleSize,
    });

    let bulletTop = titleTop + titleHeight + (cover ? 0.28 : 0.31);
    if (cover && content.title !== draft.title) {
      const headingSize = estimatedLines(content.title, 23) === 1 ? 23 : 18;
      const height = headingHeight(content.title, headingSize);
      slide.addText(content.title, {
        ...textBox, y: bulletTop, h: height, color: MINT, bold: true, fontSize: headingSize,
      });
      bulletTop += height + 0.16;
    }

    const bulletHeight = 6.59 - bulletTop;
    slide.addText(content.bullets.map((bullet, bulletIndex) => ({
      text: bullet,
      options: { bullet: { indent: 22 }, breakLine: bulletIndex < content.bullets.length - 1 },
    })), {
      ...textBox, y: bulletTop, h: bulletHeight, color: cover ? SOFT_GREEN : textColor,
      ...bulletStyle(content.bullets, bulletHeight, cover),
    });

    const source = content.source ? `資料來源　${content.source}` : "";
    if (source) {
      const characters = Array.from(source);
      const displaySource = characters.length <= 120 ? source : `${characters.slice(0, 102).join("")}…（完整來源見講者備註）`;
      slide.addText(displaySource, {
        ...textBox, y: 6.78, h: 0.45, w: TEXT_WIDTH - 0.9, fontSize: 10.5,
        color: cover ? SOFT_GREEN : MUTED,
      });
    }
    slide.addText(`${index + 1} / ${draft.slides.length}`, {
      ...textBox, x: PAGE_WIDTH - MARGIN - 0.72, y: 6.83, w: 0.72, h: 0.25,
      align: "right", color: cover ? MINT : TEAL, fontSize: 11, bold: true,
    });

    const notes = [content.notes, source].filter(Boolean).join("\n\n");
    if (notes) slide.addNotes(notes);
  });

  const blob = await pptx.write({ outputType: "blob", compression: true });
  if (!(blob instanceof Blob)) throw new Error("PowerPoint 檔案產生失敗，請重試。");
  return new Blob([blob], { type: PPTX_MIME });
}

export async function downloadAiPresentation(draft: PresentationDraft): Promise<void> {
  const blob = await createAiPresentationBlob(draft);
  const fileName = draft.title.replace(/[<>:"/\\|?*]/g, "_").replace(/[.\s]+$/g, "");
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${fileName || "簡報"}.pptx`;
  document.body.append(link);
  link.click();
  link.remove();
  // Allow browsers to finish reading the download URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
