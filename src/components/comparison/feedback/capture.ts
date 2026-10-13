export async function captureFeedbackScreenshot(signal?: AbortSignal): Promise<File> {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("這個瀏覽器不支援擷取畫面，請使用系統截圖後貼上，或選取圖片。");
  let stream: MediaStream | undefined;
  const video = document.createElement("video");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const stop = () => stream?.getTracks().forEach(track => track.stop());
  signal?.addEventListener("abort", stop);
  try {
    // Invoke synchronously from the user's click so transient activation is kept.
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    if (signal?.aborted) throw new Error("擷取已取消。");
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await Promise.race([
      (async () => {
        await video.play();
        if (video.readyState < 2) await new Promise<void>(resolve => video.addEventListener("loadeddata", () => resolve(), { once: true }));
        // Let the reporting dialog finish closing; static screens do not need
        // a second video frame to be available before taking the snapshot.
        await new Promise<void>(resolve => setTimeout(resolve, 200));
      })(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("擷取畫面逾時，請重新嘗試。")), 15_000); }),
    ]);
    if (!video.videoWidth || !video.videoHeight) throw new Error("未取得畫面，請重新選擇分頁或視窗。");
    const scale = Math.min(1, 4096 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法建立截圖，請使用系統截圖後貼上。");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("截圖建立失敗。")), "image/png"));
    return new File([blob], `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`, { type: "image/png" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") throw new Error("已取消擷取畫面。你仍可貼上截圖或選取圖片。");
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    stop(); signal?.removeEventListener("abort", stop);
    video.pause(); video.srcObject = null;
  }
}
