import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { preparePrivateAttachmentHtml, serializeAttachmentCandidates } from '@/lib/privateAttachmentHtml';
import { ATTACHMENT_REFRESH_MS, signedAttachmentUrl } from '@/lib/privateAttachments';

// Rendering only: persisted issue/history HTML is never rewritten or saved.
export function PrivateAttachmentHtml({ html, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'> & { html: string }) {
  const [rendered, setRendered] = useState({ source: '', html: '' });
  const signedOut = useRef(false);
  useEffect(() => {
    let active = true, generation = 0, unsignedHtml = '';
    const refresh = async () => {
      const request = ++generation;
      const { body, bindings } = preparePrivateAttachmentHtml(html);
      const elements = new Map<Element, { title: string | null; disabled: string | null; failed: boolean }>();
      for (const { element } of bindings) {
        if (!elements.has(element)) elements.set(element, { title: element.getAttribute('title'), disabled: element.getAttribute('aria-disabled'), failed: false });
        element.setAttribute('title', '正在確認附件存取權限');
      }
      unsignedHtml = body.innerHTML;
      if (active && request === generation) setRendered({ source: html, html: unsignedHtml });
      if (signedOut.current) return;
      const signed = new Map<string, Promise<string>>();
      await Promise.all(bindings.map(async ({ element, attribute, candidates, multiple }) => {
        const resolved = await Promise.all(candidates.map(async candidate => {
          if (!candidate.protected) return candidate;
          if (!candidate.reference) { elements.get(element)!.failed = true; return null; }
          const { bucket, path } = candidate.reference;
          const key = `${bucket}/${path}`;
          if (!signed.has(key)) signed.set(key, signedAttachmentUrl(bucket, path));
          try {
            const url = new URL(await signed.get(key)!);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid signed attachment URL');
            return { ...candidate, url: url.href };
          }
          catch { elements.get(element)!.failed = true; return null; }
        }));
        // Do not even assign a stale capability to the detached sanitizer DOM.
        if (!active || request !== generation || signedOut.current) return;
        const value = serializeAttachmentCandidates(resolved.filter(candidate => candidate !== null), multiple);
        if (value) element.setAttribute(attribute, value); else element.removeAttribute(attribute);
        if (attribute === 'href' || attribute === 'xlink:href') element.setAttribute('rel', 'noopener noreferrer');
      }));
      for (const [element, state] of elements) {
        if (state.failed) {
          element.setAttribute('title', '附件無法載入，請確認登入與存取權限。');
          element.setAttribute('aria-disabled', 'true');
          if (element.tagName === 'A') element.append('（附件無法載入）');
        } else {
          if (state.title === null) element.removeAttribute('title'); else element.setAttribute('title', state.title);
          if (state.disabled === null) element.removeAttribute('aria-disabled'); else element.setAttribute('aria-disabled', state.disabled);
        }
      }
      if (active && request === generation) setRendered({ source: html, html: body.innerHTML });
    };
    void refresh();
    const timer = setInterval(() => void refresh(), ATTACHMENT_REFRESH_MS);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      signedOut.current = event === 'SIGNED_OUT' || !session;
      generation++;
      // Schedule removal of prior-session URLs before waiting for new signing.
      if (active) setRendered({ source: html, html: unsignedHtml });
      queueMicrotask(() => { if (active) void refresh(); });
    });
    return () => { active = false; generation++; clearInterval(timer); data.subscription.unsubscribe(); };
  }, [html]);
  return <div {...props} dangerouslySetInnerHTML={{ __html: rendered.source === html ? rendered.html : '' }} />;
}
