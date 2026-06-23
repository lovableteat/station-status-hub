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
  moduleId: string;
  label: string;
  navHtml: string;
  mainHtml: string;
}

interface SnapshotModuleRecord {
  id: string;
  label: string;
  defaultStateId: string;
}

interface TabActionStep {
  groupIndex: number;
  triggerIndex: number;
  label: string;
}

interface DraftStateTransition extends TabActionStep {
  nextStateKey: string;
}

interface CapturedSnapshotState {
  key: string;
  moduleId: string;
  label: string;
  root: HTMLElement;
  transitions: DraftStateTransition[];
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
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("找不到網站根節點，無法建立整站快照。");
  }

  const directShell = Array.from(root.children).find((element) => {
    if (!(element instanceof HTMLElement)) return false;
    return Boolean(element.querySelector("nav")) && Boolean(element.querySelector("main"));
  });

  if (directShell instanceof HTMLElement) {
    return directShell;
  }

  const main = root.querySelector("main") as HTMLElement | null;
  let candidate = main?.parentElement || null;

  while (candidate && candidate !== root) {
    if (candidate.querySelector("nav") && candidate.querySelector("main")) {
      return candidate;
    }

    candidate = candidate.parentElement;
  }

  throw new Error("找不到完整網站骨架，無法建立整站快照。");
};

const findMainElement = () => {
  const main = findAppShell().querySelector("main") as HTMLElement | null;
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

const isLiveElementVisible = (element: HTMLElement) => {
  if (element.hidden) return false;

  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  return element.getClientRects().length > 0;
};

const isSnapshotElementVisible = (element: HTMLElement) => {
  if (element.hidden) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;

  let current: HTMLElement | null = element;

  while (current) {
    if (current.hidden) return false;
    if (current.getAttribute("aria-hidden") === "true") return false;
    current = current.parentElement;
  }

  return true;
};

const getTabTriggerLabel = (trigger: HTMLElement) =>
  trigger.textContent?.replace(/\s+/g, " ").trim() || "未命名分頁";

const getVisibleTabGroups = (
  root: ParentNode,
  visibilityStrategy: (element: HTMLElement) => boolean
) =>
  Array.from(root.querySelectorAll<HTMLElement>('[role="tablist"]')).filter(
    visibilityStrategy
  );

const getVisibleTabTriggers = (
  group: HTMLElement,
  visibilityStrategy: (element: HTMLElement) => boolean
) =>
  Array.from(group.querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter(
    visibilityStrategy
  );

const getLiveTabActions = () => {
  const main = findMainElement();
  const groups = getVisibleTabGroups(main, isLiveElementVisible);

  return groups.flatMap((group, groupIndex) =>
    getVisibleTabTriggers(group, isLiveElementVisible)
      .map((trigger, triggerIndex) => ({
        groupIndex,
        triggerIndex,
        label: getTabTriggerLabel(trigger),
        active:
          trigger.getAttribute("data-state") === "active" ||
          trigger.getAttribute("aria-selected") === "true",
      }))
      .filter((action) => !action.active)
      .map(({ active, ...action }) => action)
  );
};

const buildLiveStateKey = (moduleId: string) => {
  const main = findMainElement();
  const groups = getVisibleTabGroups(main, isLiveElementVisible);

  if (!groups.length) {
    return `${moduleId}::default`;
  }

  return `${moduleId}::${groups
    .map((group, groupIndex) => {
      const triggers = getVisibleTabTriggers(group, isLiveElementVisible);
      const activeIndex = triggers.findIndex(
        (trigger) =>
          trigger.getAttribute("data-state") === "active" ||
          trigger.getAttribute("aria-selected") === "true"
      );

      return `${groupIndex}:${triggers
        .map((trigger) => getTabTriggerLabel(trigger))
        .join(">")}#${activeIndex}`;
    })
    .join("|")}`;
};

const serializeTabPath = (path: TabActionStep[]) =>
  path.map((step) => `${step.groupIndex}.${step.triggerIndex}`).join("|");

const annotateTabTransitions = (
  root: HTMLElement,
  transitions: DraftStateTransition[],
  stateIdByKey: Map<string, string>
) => {
  const main = root.querySelector("main");
  if (!main) return;

  const groups = getVisibleTabGroups(main, isSnapshotElementVisible);

  transitions.forEach((transition) => {
    const group = groups[transition.groupIndex];
    if (!group) return;

    const triggers = getVisibleTabTriggers(group, isSnapshotElementVisible);
    const trigger = triggers[transition.triggerIndex];
    const nextStateId = stateIdByKey.get(transition.nextStateKey);

    if (!trigger || !nextStateId) return;

    trigger.setAttribute("data-archive-state-target", nextStateId);
    trigger.setAttribute("type", "button");
  });
};

const waitForMainToStabilize = async (label: string) => {
  const main = findMainElement();
  const startedAt = performance.now();
  let lastMarkup = main.innerHTML;
  let stableSince = performance.now();

  await wait(180);
  await nextPaint(2);

  while (performance.now() - startedAt < 5000) {
    await wait(110);
    await nextPaint(1);

    const nextMarkup = main.innerHTML;
    const hasSpinner = Boolean(main.querySelector(".animate-spin"));

    if (nextMarkup === lastMarkup && !hasSpinner) {
      if (performance.now() - stableSince >= 320) {
        return;
      }
    } else {
      lastMarkup = nextMarkup;
      stableSince = performance.now();
    }
  }

  console.warn(`Timed out while waiting for content to stabilize: ${label}`);
};

const navigateToModule = async (moduleId: string) => {
  window.dispatchEvent(
    new CustomEvent("navigate", {
      detail: { module: moduleId },
    })
  );

  await waitForMainToStabilize(`module:${moduleId}`);
};

const replayTabPath = async (moduleId: string, path: TabActionStep[]) => {
  if (!path.length) return;

  for (const step of path) {
    const main = findMainElement();
    const groups = getVisibleTabGroups(main, isLiveElementVisible);
    const group = groups[step.groupIndex];

    if (!group) {
      throw new Error(`找不到模組 ${moduleId} 的第 ${step.groupIndex + 1} 個分頁群組。`);
    }

    const triggers = getVisibleTabTriggers(group, isLiveElementVisible);
    const trigger = triggers[step.triggerIndex];

    if (!trigger) {
      throw new Error(
        `找不到模組 ${moduleId} 的分頁「${step.label}」，請重新整理後再匯出一次。`
      );
    }

    const isActive =
      trigger.getAttribute("data-state") === "active" ||
      trigger.getAttribute("aria-selected") === "true";

    if (isActive) continue;

    trigger.click();
    await waitForMainToStabilize(`tab:${moduleId}:${step.label}`);
  }
};

const exploreModuleStates = async (
  module: SnapshotModule,
  visibleModules: SnapshotModule[]
) => {
  const capturedStates: CapturedSnapshotState[] = [];
  const visitedStateKeys = new Set<string>();
  const queuedPaths = new Set<string>([""]);
  const queue: TabActionStep[][] = [[]];
  let defaultStateKey = `${module.id}::default`;

  while (queue.length) {
    const path = queue.shift() || [];

    await navigateToModule(module.id);
    await replayTabPath(module.id, path);

    const stateKey = buildLiveStateKey(module.id);
    if (path.length === 0) {
      defaultStateKey = stateKey;
    }

    if (visitedStateKeys.has(stateKey)) {
      continue;
    }

    visitedStateKeys.add(stateKey);

    const shell = findAppShell();
    const snapshotRoot = shell.cloneNode(true) as HTMLElement;
    normalizeSnapshotDom(snapshotRoot, visibleModules);

    const actions = getLiveTabActions();
    const transitions: DraftStateTransition[] = [];

    for (const action of actions) {
      const nextPath = [...path, action];

      await navigateToModule(module.id);
      await replayTabPath(module.id, nextPath);

      const nextStateKey = buildLiveStateKey(module.id);
      transitions.push({
        ...action,
        nextStateKey,
      });

      const nextPathKey = serializeTabPath(nextPath);
      if (!visitedStateKeys.has(nextStateKey) && !queuedPaths.has(nextPathKey)) {
        queue.push(nextPath);
        queuedPaths.add(nextPathKey);
      }
    }

    capturedStates.push({
      key: stateKey,
      moduleId: module.id,
      label: module.label,
      root: snapshotRoot,
      transitions,
    });
  }

  return {
    defaultStateKey,
    states: capturedStates,
  };
};

const finalizeCapturedStates = (
  capturedStates: CapturedSnapshotState[],
  visibleModules: SnapshotModule[]
) => {
  const stateIdByKey = new Map<string, string>();

  capturedStates.forEach((state, index) => {
    stateIdByKey.set(state.key, `${state.moduleId}__${index}`);
  });

  const pages: SnapshotPage[] = capturedStates.map((state) => {
    const snapshotRoot = state.root.cloneNode(true) as HTMLElement;
    normalizeSnapshotDom(snapshotRoot, visibleModules);
    annotateTabTransitions(snapshotRoot, state.transitions, stateIdByKey);

    const nav = snapshotRoot.querySelector("nav");
    const main = snapshotRoot.querySelector("main");

    if (!nav || !main) {
      throw new Error("整站快照缺少左側欄或主內容區塊，請重新整理網站後再試一次。");
    }

    return {
      id: stateIdByKey.get(state.key) || state.key,
      moduleId: state.moduleId,
      label: state.label,
      navHtml: nav.innerHTML,
      mainHtml: main.innerHTML,
    };
  });

  return { pages, stateIdByKey };
};

const captureModulePages = async (visibleModules: SnapshotModule[]) => {
  const capturedStates: CapturedSnapshotState[] = [];
  const modules: SnapshotModuleRecord[] = [];

  for (const module of visibleModules) {
    const explored = await exploreModuleStates(module, visibleModules);
    capturedStates.push(...explored.states);

    modules.push({
      id: module.id,
      label: module.label,
      defaultStateId: explored.defaultStateKey,
    });
  }

  const { pages, stateIdByKey } = finalizeCapturedStates(
    capturedStates,
    visibleModules
  );

  return {
    pages,
    modules: modules.map((module) => ({
      ...module,
      defaultStateId:
        stateIdByKey.get(module.defaultStateId) || module.defaultStateId,
    })),
  };
};

const captureShellTemplate = (visibleModules: SnapshotModule[]) => {
  const shell = findAppShell();
  const snapshotRoot = shell.cloneNode(true) as HTMLElement;

  normalizeSnapshotDom(snapshotRoot, visibleModules);

  const nav = snapshotRoot.querySelector("nav");
  const main = snapshotRoot.querySelector("main");

  if (!nav || !main) {
    throw new Error("找不到完整的網站版面骨架，無法建立整站快照。");
  }

  snapshotRoot.setAttribute("data-archive-shell-root", "true");
  nav.setAttribute("data-archive-nav-host", "true");
  main.setAttribute("data-archive-main-host", "true");

  return snapshotRoot.outerHTML;
};

const buildArchiveHtml = ({
  pages,
  modules,
  shellHtml,
  styles,
  exportedAt,
  exportedBy,
  currentModule,
}: {
  pages: SnapshotPage[];
  modules: SnapshotModuleRecord[];
  shellHtml: string;
  styles: string;
  exportedAt: string;
  exportedBy?: string | null;
  currentModule: string;
}) => {
  const htmlClass = escapeHtml(document.documentElement.className);
  const bodyClass = escapeHtml(document.body.className);
  const title = escapeHtml(document.title || "Station Status Hub Snapshot");
  const snapshotPayload = JSON.stringify(
    {
      defaultModule: currentModule,
      modules,
      pages,
    },
    null,
    2
  ).replace(/</g, "\\u003c");

  const metadata = JSON.stringify(
    {
      type: "station-status-hub-full-site-snapshot",
      exportedAt,
      exportedBy: exportedBy || null,
      source: window.location.href,
      modules: modules.map((page) => ({
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
    </style>
  </head>
  <body class="${bodyClass}">
    ${shellHtml}
    <script id="station-status-hub-archive-snapshots" type="application/json">${snapshotPayload}</script>
    <script id="station-status-hub-archive-metadata" type="application/json">${metadata}</script>
    <script>
      (function () {
        const payloadElement = document.getElementById("station-status-hub-archive-snapshots");
        const payload = payloadElement ? JSON.parse(payloadElement.textContent || "{}") : {};
        const pages = Array.isArray(payload.pages) ? payload.pages : [];
        const modules = Array.isArray(payload.modules) ? payload.modules : [];
        const pageMap = new Map(pages.map((page) => [page.id, page]));
        const moduleDefaults = new Map(modules.map((module) => [module.id, module.defaultStateId]));
        const defaultModule = payload.defaultModule || ${JSON.stringify(currentModule)};
        const navHost = document.querySelector("[data-archive-nav-host]");
        const mainHost = document.querySelector("[data-archive-main-host]");
        let currentStateId = moduleDefaults.get(defaultModule) || pages[0]?.id;

        function renderState(stateId, options) {
          const nextPage = pageMap.get(stateId) || pages[0];
          if (!nextPage || !navHost || !mainHost) return;

          navHost.innerHTML = nextPage.navHtml;
          mainHost.innerHTML = nextPage.mainHtml;
          currentStateId = nextPage.id;

          if (!options || options.scroll !== false) {
            window.scrollTo({ top: 0, behavior: "auto" });
          }
        }

        function showModule(moduleId) {
          const nextModule = moduleDefaults.has(moduleId) ? moduleId : defaultModule;
          const nextStateId = moduleDefaults.get(nextModule) || currentStateId || pages[0]?.id;
          if (!nextStateId) return;

          renderState(nextStateId);
          if (window.location.hash !== "#" + nextModule) {
            history.replaceState(null, "", "#" + nextModule);
          }
        }

        document.addEventListener("click", function (event) {
          const stateTrigger = event.target.closest("[data-archive-state-target]");
          if (stateTrigger) {
            event.preventDefault();
            const nextStateId = stateTrigger.getAttribute("data-archive-state-target");
            if (!nextStateId) return;

            renderState(nextStateId, { scroll: false });
            return;
          }

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
    const [styles, snapshotData] = await Promise.all([
      collectDocumentStyles(),
      captureModulePages(visibleModules),
    ]);

    await navigateToModule(currentModule);
    const shellHtml = captureShellTemplate(visibleModules);

    const html = buildArchiveHtml({
      pages: snapshotData.pages,
      modules: snapshotData.modules,
      shellHtml,
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
