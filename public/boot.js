const RETRY_KEY = "station-status-hub:boot-retry";

function getBasePath() {
  const { pathname } = window.location;
  if (pathname.startsWith("/station-status-hub/")) {
    return "/station-status-hub/";
  }
  return "/";
}

function renderFallbackMessage(message) {
  const root = document.getElementById("root");
  if (!root || root.children.length > 0) return;

  root.innerHTML =
    '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#08111f;color:#e2e8f0;font-family:Arial,sans-serif;">' +
    '<div style="max-width:560px;border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:28px;background:rgba(15,23,42,.88);box-shadow:0 24px 80px rgba(2,8,23,.34);">' +
    '<div style="font-size:28px;font-weight:700;margin-bottom:12px;">頁面重新同步中</div>' +
    `<div style="font-size:15px;line-height:1.8;color:#cbd5e1;">${message}</div>` +
    '<button onclick="window.location.reload()" style="margin-top:18px;height:44px;padding:0 18px;border:none;border-radius:999px;background:#38bdf8;color:#082032;font-size:14px;font-weight:700;cursor:pointer;">重新整理頁面</button>' +
    "</div></div>";
}

function retryBoot(reason) {
  const hasRetried = sessionStorage.getItem(RETRY_KEY) === "1";
  if (hasRetried) {
    console.warn("station-status-hub boot retry already used:", reason);
    renderFallbackMessage(
      "剛剛偵測到瀏覽器拿到舊版資源，系統已經自動重整過一次。如果你還是看到這個畫面，請再按一次重新整理。"
    );
    return;
  }

  sessionStorage.setItem(RETRY_KEY, "1");
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("reload", Date.now().toString());
  window.location.replace(nextUrl.toString());
}

function appendStylesheet(href) {
  if (!href || document.querySelector(`link[data-boot-css="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.bootCss = href;
  document.head.appendChild(link);
}

async function loadProductionEntry() {
  const basePath = getBasePath();
  const manifestUrl = new URL(`${basePath}asset-manifest.json`, window.location.origin);
  manifestUrl.searchParams.set("t", Date.now().toString());

  const manifestResponse = await fetch(manifestUrl.toString(), {
    cache: "no-store",
  });

  if (!manifestResponse.ok) {
    throw new Error(`manifest-${manifestResponse.status}`);
  }

  const manifest = await manifestResponse.json();
  const entry = manifest["index.html"];

  if (!entry?.file) {
    throw new Error("missing-index-entry");
  }

  (entry.css || []).forEach((cssPath) => {
    appendStylesheet(new URL(cssPath, `${window.location.origin}${basePath}`).toString());
  });

  await import(new URL(entry.file, `${window.location.origin}${basePath}`).toString());
}

async function boot() {
  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "";

  try {
    if (isLocalHost) {
      await import("/src/main.tsx");
    } else {
      await loadProductionEntry();
    }

    window.setTimeout(() => {
      const root = document.getElementById("root");
      const hasRendered = !!root && root.children.length > 0;
      if (hasRendered) {
        sessionStorage.removeItem(RETRY_KEY);
        return;
      }
      retryBoot("empty-root-after-boot");
    }, 1800);
  } catch (error) {
    console.error("station-status-hub boot failed:", error);
    retryBoot(error instanceof Error ? error.message : "boot-failed");
  }
}

void boot();
