const REVALIDATE_KEY = "station-status-hub:html-revalidated";

try {
  window.sessionStorage.setItem(REVALIDATE_KEY, "1");
} catch {
  // Continue with a cache-busted navigation when storage is unavailable.
}

const latestUrl = new URL(window.location.href);
latestUrl.searchParams.set("reload", Date.now().toString());
window.location.replace(latestUrl.toString());
