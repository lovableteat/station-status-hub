interface SiteArchiveExportInput {
  systems: any[];
  stations: any[];
  testItems: any[];
  progress: any[];
  stationContents: any[];
  exportedBy?: string | null;
}

interface SnapshotModule {
  id: string;
  label: string;
}

interface SnapshotPage {
  id: string;
  label: string;
  html: string;
}

const SNAPSHOT_MODULES: SnapshotModule[] = [
  { id: "dashboard", label: "系統儀表板" },
  { id: "test-tracker", label: "L10 測試追蹤" },
  { id: "flow-info", label: "L10 測試流程設定" },
  { id: "monitor", label: "生產監控牆" },
  { id: "issues", label: "問題追蹤" },
  { id: "data", label: "資料中心" },
  { id: "tools", label: "工具管理" },
  { id: "users", label: "使用者管理" },
];

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const nextPaint = async (frames = 2) => {
  for (let index = 0; index < frames; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildFileName = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `station-status-hub-full-site-snapshot-${y}${m}${d}-${hh}${mm}.html`;
};

const createExportOverlay = () => {
  const overlay = document.createElement("div");
  overlay.setAttribute("data-site-export-overlay", "true");
  overlay.innerHTML = `
    <div class="site-export-overlay-card">
      <div class="site-export-overlay-spinner"></div>
      <div class="site-export-overlay-copy">
        <strong>正在建立整站 HTML 快照</strong>
        <span>系統會依序擷取每個模組的實際畫面，完成後會自動下載。</span>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    [data-site-export-overlay="true"] {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, rgba(6, 10, 18, 0.72), rgba(9, 14, 24, 0.82));
      backdrop-filter: blur(10px);
    }

    .site-export-overlay-card {
      display: flex;
      align-items: center;
      gap: 18px;
      width: min(560px, calc(100vw - 32px));
      padding: 22px 24px;
      border-radius: 24px;
      border: 1px solid rgba(121, 154, 255, 0.24);
      background: rgba(18, 24, 38, 0.92);
      box-shadow:
        0 24px 80px -36px rgba(0, 0, 0, 0.6),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      color: #e9efff;
    }

    .site-export-overlay-spinner {
      width: 22px;
      height: 22px;
      border-radius: 999px;
      border: 2px solid rgba(122, 162, 255, 0.26);
      border-top-color: rgba(122, 162, 255, 1);
      animation: site-export-spin 0.8s linear infinite;
      flex-shrink: 0;
    }

    .site-export-overlay-copy {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .site-export-overlay-copy strong {
      font-size: 16px;
      font-weight: 700;
    }

    .site-export-overlay-copy span {
      color: rgba(233, 239, 255, 0.78);
      font-size: 13px;
      line-height: 1.6;
    }

    @keyframes site-export-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  return () => {
    overlay.remove();
    style.remove();
  };
};

const rewriteCssUrls = (cssText: string, baseUrl: string) => {
  return cssText
    .replace(/url\(([^)]+)\)/gi, (fullMatch, rawUrl) => {
      const cleaned = String(rawUrl).trim().replace(/^['"]|['"]$/g, "");

      if (
        !cleaned ||
        /^(data:|blob:|https?:|#)/i.test(cleaned)
      ) {
        return fullMatch;
      }

      try {
        const quote =
          String(rawUrl).trim().startsWith('"')
            ? '"'
            : String(rawUrl).trim().startsWith("'")
              ? "'"
              : "";

        return `url(${quote}${new URL(cleaned, baseUrl).href}${quote})`;
      } catch {
        return fullMatch;
      }
    })
    .replace(/@import\s+(url\()?['"]([^'"]+)['"]\)?/gi, (fullMatch, prefix, rawUrl) => {
      if (/^(data:|blob:|https?:)/i.test(rawUrl)) {
        return fullMatch;
      }

      try {
        const absoluteUrl = new URL(rawUrl, baseUrl).href;
        return `@import url("${absoluteUrl}")`;
      } catch {
        return fullMatch;
      }
    });
};

const collectDocumentStyles = async () => {
  const styleNodes = Array.from(
    document.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
      'style, link[rel="stylesheet"]'
    )
  );

  const chunks = await Promise.all(
    styleNodes.map(async (node) => {
      if (node instanceof HTMLStyleElement) {
        return node.textContent || "";
      }

      const href = node.href;
      if (!href) return "";

      try {
        const response = await fetch(href);
        if (!response.ok) {
          throw new Error(`Unable to fetch stylesheet: ${href}`);
        }

        const cssText = await response.text();
        return rewriteCssUrls(cssText, href);
      } catch {
        try {
          const sheet = node.sheet as CSSStyleSheet | null;
          if (!sheet?.cssRules) return "";

          const cssText = Array.from(sheet.cssRules)
            .map((rule) => rule.cssText)
            .join("\n");

          return rewriteCssUrls(cssText, href);
        } catch {
          return "";
        }
      }
    })
  );

  return chunks.filter(Boolean).join("\n\n");
};

const findAppShell = () => {
  const shell = document.querySelector("#root > *") as HTMLElement | null;
  if (!shell) {
    throw new Error("找不到目前網站畫面，無法建立整站快照。");
  }

  return shell;
};

const findMainElement = () => {
  const main = document.querySelector("#root main") as HTMLElement | null;
  if (!main) {
    throw new Error("找不到目前網站主內容區塊，無法建立整站快照。");
  }

  return main;
};

const getVisibleModules = () => {
  const navButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("nav .space-y-1 > button")
  );

  if (!navButtons.length) {
    return SNAPSHOT_MODULES;
  }

  return SNAPSHOT_MODULES.filter((module, index) => Boolean(navButtons[index]));
};

const detectCurrentModule = () => {
  const navButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("nav .space-y-1 > button")
  );

  const activeIndex = navButtons.findIndex((button) =>
    button.className.includes("bg-primary")
  );

  if (activeIndex === -1) {
    return "dashboard";
  }

  return SNAPSHOT_MODULES[activeIndex]?.id || "dashboard";
};

const syncFormValues = (root: HTMLElement) => {
  root.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
    if (input.type === "checkbox" || input.type === "radio") {
      if (input.checked) {
        input.setAttribute("checked", "checked");
      } else {
        input.removeAttribute("checked");
      }

      return;
    }

    input.setAttribute("value", input.value);
  });

  root.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((textarea) => {
    textarea.textContent = textarea.value;
  });

  root.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
    Array.from(select.options).forEach((option) => {
      if (option.value === select.value) {
        option.setAttribute("selected", "selected");
      } else {
        option.removeAttribute("selected");
      }
    });
  });
};

const absolutizeAssetUrls = (root: HTMLElement) => {
  root.querySelectorAll<HTMLElement>("[src], [href], [poster]").forEach((element) => {
    if (element instanceof HTMLImageElement && element.currentSrc) {
      element.setAttribute("src", element.currentSrc);
    }

    if (element instanceof HTMLSourceElement && element.src) {
      element.setAttribute("src", element.src);
    }

    if (element instanceof HTMLVideoElement && element.currentSrc) {
      element.setAttribute("src", element.currentSrc);
    }

    if (element instanceof HTMLAnchorElement && element.href) {
      element.setAttribute("href", element.href);
    }

    if (element instanceof HTMLIFrameElement && element.src) {
      element.setAttribute("src", element.src);
    }

    const poster = element.getAttribute("poster");
    if (poster) {
      try {
        element.setAttribute("poster", new URL(poster, window.location.href).href);
      } catch {
        // ignore invalid poster URLs
      }
    }
  });
};

const normalizeSnapshotDom = (root: HTMLElement, visibleModules: SnapshotModule[]) => {
  syncFormValues(root);
  absolutizeAssetUrls(root);

  root
    .querySelectorAll(
      [
        '[data-site-export-overlay="true"]',
        '[data-radix-popper-content-wrapper]',
        '[data-sonner-toaster]',
        '[data-radix-toast-viewport]',
      ].join(",")
    )
    .forEach((node) => node.remove());

  const navButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("nav .space-y-1 > button")
  );

  navButtons.forEach((button, index) => {
    const module = visibleModules[index];
    if (!module) return;

    button.setAttribute("data-archive-nav", module.id);
    button.setAttribute("type", "button");
  });

  root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
  });
};

const waitForModuleToRender = async (moduleId: string) => {
  const main = findMainElement();
  const startedAt = performance.now();
  let lastMarkup = main.innerHTML;
  let stableSince = performance.now();

  await wait(220);
  await nextPaint(2);

  while (performance.now() - startedAt < 7000) {
    await wait(140);
    await nextPaint(1);

    const nextMarkup = main.innerHTML;
    const hasSpinner = Boolean(main.querySelector(".animate-spin"));
    const moduleHeadingVisible = main.textContent?.trim().length;

    if (nextMarkup === lastMarkup && !hasSpinner && moduleHeadingVisible) {
      if (performance.now() - stableSince >= 420) {
        return;
      }
    } else {
      lastMarkup = nextMarkup;
      stableSince = performance.now();
    }
  }

  console.warn(`Timed out while waiting for module snapshot: ${moduleId}`);
};

const navigateToModule = async (moduleId: string) => {
  window.dispatchEvent(
    new CustomEvent("navigate", {
      detail: { module: moduleId },
    })
  );

  await waitForModuleToRender(moduleId);
};

const captureModulePages = async (visibleModules: SnapshotModule[]) => {
  const pages: SnapshotPage[] = [];

  for (const module of visibleModules) {
    await navigateToModule(module.id);

    const shell = findAppShell();
    const snapshotRoot = shell.cloneNode(true) as HTMLElement;

    normalizeSnapshotDom(snapshotRoot, visibleModules);

    pages.push({
      id: module.id,
      label: module.label,
      html: snapshotRoot.outerHTML,
    });
  }

  return pages;
};

const buildArchiveHtml = ({
  pages,
  styles,
  exportedAt,
  exportedBy,
  currentModule,
}: {
  pages: SnapshotPage[];
  styles: string;
  exportedAt: string;
  exportedBy?: string | null;
  currentModule: string;
}) => {
  const htmlClass = escapeHtml(document.documentElement.className);
  const bodyClass = escapeHtml(document.body.className);
  const title = escapeHtml(document.title || "Station Status Hub Snapshot");
  const pageMarkup = pages
    .map(
      (page) => `
        <section data-archive-page="${escapeHtml(page.id)}" hidden>
          ${page.html}
        </section>
      `
    )
    .join("");

  const metadata = JSON.stringify(
    {
      type: "station-status-hub-full-site-snapshot",
      exportedAt,
      exportedBy: exportedBy || null,
      source: window.location.href,
      modules: pages.map((page) => ({
        id: page.id,
        label: page.label,
      })),
    },
    null,
    2
  ).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="zh-Hant" class="${htmlClass}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>${styles}</style>
    <style>
      html,
      body {
        min-height: 100%;
      }

      [data-archive-page][hidden] {
        display: none !important;
      }
    </style>
  </head>
  <body class="${bodyClass}">
    ${pageMarkup}
    <script id="station-status-hub-archive-metadata" type="application/json">${metadata}</script>
    <script>
      (function () {
        const pages = Array.from(document.querySelectorAll("[data-archive-page]"));
        const pageIds = pages.map((page) => page.getAttribute("data-archive-page"));
        const defaultModule = ${JSON.stringify(currentModule)};

        function showModule(moduleId) {
          const nextModule = pageIds.includes(moduleId) ? moduleId : defaultModule;

          pages.forEach((page) => {
            page.hidden = page.getAttribute("data-archive-page") !== nextModule;
          });

          window.scrollTo({ top: 0, behavior: "auto" });

          if (window.location.hash !== "#" + nextModule) {
            history.replaceState(null, "", "#" + nextModule);
          }
        }

        document.addEventListener("click", function (event) {
          const trigger = event.target.closest("[data-archive-nav]");
          if (!trigger) return;

          event.preventDefault();
          const moduleId = trigger.getAttribute("data-archive-nav");
          if (!moduleId) return;

          showModule(moduleId);
        });

        window.addEventListener("hashchange", function () {
          const hashModule = window.location.hash.replace(/^#/, "");
          showModule(hashModule || defaultModule);
        });

        const initialHash = window.location.hash.replace(/^#/, "");
        showModule(initialHash || defaultModule);
      })();
    </script>
  </body>
</html>`;
};

const downloadHtml = (html: string) => {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildFileName();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export async function exportSiteArchiveHtml({
  systems,
  stations,
  testItems,
  progress,
  stationContents,
  exportedBy,
}: SiteArchiveExportInput) {
  void systems;
  void stations;
  void testItems;
  void progress;
  void stationContents;

  const cleanupOverlay = createExportOverlay();
  const visibleModules = getVisibleModules();
  const currentModule = detectCurrentModule();

  try {
    const [styles, pages] = await Promise.all([
      collectDocumentStyles(),
      captureModulePages(visibleModules),
    ]);

    const html = buildArchiveHtml({
      pages,
      styles,
      exportedAt: new Date().toISOString(),
      exportedBy,
      currentModule,
    });

    downloadHtml(html);

    return {
      warnings: [],
    };
  } finally {
    try {
      await navigateToModule(currentModule);
    } catch (restoreError) {
      console.error("Failed to restore module after site snapshot export:", restoreError);
    }

    cleanupOverlay();
  }
}
