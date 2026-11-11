/** Reloading cannot preserve memory-only drafts. Never call this automatically. */
export function requestApplicationUpdate() {
  if (!window.confirm("重新載入會離開目前畫面，尚未儲存的內容可能遺失。請先儲存或匯出需要保留的內容。確定現在載入最新版本嗎？")) return false;
  if (!window.dispatchEvent(new Event("workspace-before-navigate", { cancelable: true }))) return false;
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("reload", Date.now().toString());
  window.location.replace(nextUrl.toString());
  return true;
}

