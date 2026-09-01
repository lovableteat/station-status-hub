const platformIntroVideoUrl =
  "https://lovableteat.github.io/station-status-hub/videos/platform-introduction.mp4";
const platformIntroPosterUrl =
  "https://img.youtube.com/vi/uegeSwdfWjQ/maxresdefault.jpg";

export function PlatformIntroVideo() {
  return (
    <section
      aria-labelledby="platform-introduction-video-title"
      className="mb-3 overflow-hidden rounded-[1.35rem] border border-primary/20 bg-[linear-gradient(135deg,rgba(16,31,56,0.96),rgba(8,18,34,0.98))] p-3 shadow-[0_22px_50px_-34px_rgba(56,189,248,0.6)] sm:p-4"
      data-testid="platform-introduction-video"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80">
            Platform introduction
          </p>
          <h2
            id="platform-introduction-video-title"
            className="mt-1 text-lg font-black tracking-[-0.025em] text-foreground sm:text-xl"
          >
            平台介紹影片
          </h2>
        </div>
        <a
          href="https://www.youtube.com/watch?v=uegeSwdfWjQ"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          YouTube 原始影片
        </a>
      </div>
      <video
        className="aspect-video w-full rounded-xl border border-white/10 bg-slate-950/70 object-contain"
        controls
        preload="metadata"
        poster={platformIntroPosterUrl}
        aria-label="工作整合平台介紹影片"
      >
        <source src={platformIntroVideoUrl} type="video/mp4" />
        你的瀏覽器不支援影片播放，請改看 YouTube 原始影片。
      </video>
    </section>
  );
}
