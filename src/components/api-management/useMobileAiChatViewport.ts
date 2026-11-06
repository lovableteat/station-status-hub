import { useEffect, type RefObject } from "react";

export function useMobileAiChatViewport(
  enabled: boolean,
  panelRef: RefObject<HTMLDivElement>,
  inputRef: RefObject<HTMLTextAreaElement>,
) {
  useEffect(() => {
    const shell = panelRef.current?.closest<HTMLElement>("[data-ai-chat-viewport]");
    const viewport = window.visualViewport;
    if (!enabled || !shell || !viewport) return;

    const root = document.documentElement;
    let layoutWidth = window.innerWidth;
    let restingHeight = Math.max(window.innerHeight, viewport.height);
    let keyboardOpen = false;
    let frame = 0;

    const reset = () => {
      shell.removeAttribute("data-ai-chat-keyboard");
      shell.style.removeProperty("--ai-chat-visible-top");
      shell.style.removeProperty("--ai-chat-visible-height");
    };

    const update = () => {
      if (Math.abs(viewport.scale - 1) > 0.02) return;
      // Dialogs are portaled outside the chat shell and must also clear the keyboard.
      root.style.setProperty("--ai-dialog-visible-height", `${viewport.height}px`);
      root.style.setProperty("--ai-dialog-visible-bottom", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
      const editing = document.activeElement === inputRef.current;
      if (layoutWidth !== window.innerWidth) {
        layoutWidth = window.innerWidth;
        restingHeight = window.innerHeight;
      }

      // Keep the send target in place through blur until the keyboard has moved away.
      keyboardOpen = (editing || keyboardOpen) && Math.max(restingHeight, window.innerHeight) - viewport.height >= 100;
      if (keyboardOpen) {
        shell.style.setProperty("--ai-chat-visible-top", `${viewport.offsetTop}px`);
        shell.style.setProperty("--ai-chat-visible-height", `${viewport.height}px`);
        shell.setAttribute("data-ai-chat-keyboard", viewport.height < 260 ? "short" : "open");
      } else {
        if (!editing) restingHeight = Math.max(window.innerHeight, viewport.height);
        reset();
      }
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    viewport.addEventListener("resize", scheduleUpdate);
    viewport.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    shell.addEventListener("focusin", scheduleUpdate);
    shell.addEventListener("focusout", scheduleUpdate);
    update();
    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", scheduleUpdate);
      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      shell.removeEventListener("focusin", scheduleUpdate);
      shell.removeEventListener("focusout", scheduleUpdate);
      reset();
      root.style.removeProperty("--ai-dialog-visible-height");
      root.style.removeProperty("--ai-dialog-visible-bottom");
    };
  }, [enabled, panelRef, inputRef]);
}
