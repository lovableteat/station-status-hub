import DOMPurify from "dompurify";
import type { Artifact } from "./types";

export interface DiagramViews { compact: string; expanded: string; }

/** Keep engine diagrams as inert SVG; React provides every interactive action. */
export function readDiagramViews(artifact?: Artifact, schematicName?: string, internalControls = false): DiagramViews {
  if (!artifact) return { compact: "", expanded: "" };
  const document = new DOMParser().parseFromString(new TextDecoder().decode(artifact.bytes), "text/html");
  const compact = document.querySelector<SVGSVGElement>("#v-c svg") ?? document.querySelector<SVGSVGElement>("svg");
  const expanded = internalControls ? document.querySelector<SVGSVGElement>("#v-e svg") : null;
  const sanitize = (svg: SVGSVGElement | null) => {
    if (!svg) return "";
    svg.removeAttribute("data-pdf-page");
    svg.removeAttribute("data-diagram-internal");
    for (const node of svg.querySelectorAll("*")) {
      node.removeAttribute("data-pdf-page");
      node.removeAttribute("data-diagram-internal");
    }
    for (const anchor of svg.querySelectorAll("a")) {
      const href = anchor.getAttribute("href") || anchor.getAttribute("xlink:href") || "";
      const prefix = `${schematicName}#page=`;
      const page = schematicName && href.startsWith(prefix) ? href.slice(prefix.length) : "";
      if (/^[1-9]\d*$/.test(page) && Number(page) <= 10000) {
        anchor.setAttribute("data-pdf-page", page);
        anchor.setAttribute("tabindex", "0");
        anchor.setAttribute("role", "link");
        anchor.setAttribute("aria-label", `查看線路圖第 ${page} 頁`);
      }
    }
    if (expanded) {
      for (const node of svg.querySelectorAll(".intl[data-key]")) {
        if (!node.getAttribute("data-key")) continue;
        node.setAttribute("data-diagram-internal", "true");
        node.setAttribute("tabindex", "0");
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", "展開並定位這個轉換元件的內部 net");
      }
    }
    return DOMPurify.sanitize(svg.outerHTML, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["foreignObject", "style", "script"],
      FORBID_ATTR: ["href", "xlink:href"],
      ADD_ATTR: ["data-pdf-page", "data-diagram-internal", "role"],
    });
  };
  return { compact: sanitize(compact), expanded: sanitize(expanded) };
}
