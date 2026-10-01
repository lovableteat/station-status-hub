import { ExternalLink } from "lucide-react";

function linkSource(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("sharepoint")) return "SharePoint";
    return host;
  } catch {
    return "外部網站";
  }
}

export function EvidenceLink({ url, className = "" }: { url: string; className?: string }) {
  return (
    <a
      className={["rd2-readable-link", className].filter(Boolean).join(" ")}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
    >
      <ExternalLink aria-hidden="true" />
      <span>開啟證明連結</span>
      <small>{linkSource(url)}</small>
    </a>
  );
}
