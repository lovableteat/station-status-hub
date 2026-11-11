import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import { ATTACHMENT_REFRESH_MS, parseAttachmentReference, signedAttachmentUrl, type PrivateAttachmentBucket } from '@/lib/privateAttachments';

// Rendering only: persisted issue/history HTML is never rewritten or saved.
export function PrivateAttachmentHtml({ html, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'> & { html: string }) {
  const [rendered, setRendered] = useState({ source: '', html: '' });
  const signedOut = useRef(false);
  useEffect(() => {
    let active = true, generation = 0;
    const refresh = async () => {
      const request = ++generation;
      const body = new DOMParser().parseFromString(DOMPurify.sanitize(html), 'text/html').body;
      const pending: { element: Element; attribute: string; bucket: PrivateAttachmentBucket; path: string }[] = [];
      body.querySelectorAll('img[src],a[href]').forEach(element => {
        const attribute = element.tagName === 'IMG' ? 'src' : 'href';
        const reference = parseAttachmentReference(element.getAttribute(attribute) || '');
        if (!reference) return;
        element.removeAttribute(attribute);
        element.setAttribute('title', '正在確認附件存取權限');
        pending.push({ element, attribute, bucket: reference.bucket as PrivateAttachmentBucket, path: reference.path });
      });
      if (active && request === generation) setRendered({ source: html, html: body.innerHTML });
      if (signedOut.current) return;
      const signed = new Map<string, Promise<string>>();
      await Promise.all(pending.map(async ({ element, attribute, bucket, path }) => {
        const key = `${bucket}/${path}`;
        if (!signed.has(key)) signed.set(key, signedAttachmentUrl(bucket, path));
        try {
          element.setAttribute(attribute, await signed.get(key)!);
          element.removeAttribute('title');
          if (attribute === 'href') element.setAttribute('rel', 'noopener noreferrer');
        } catch {
          element.setAttribute('title', '附件無法載入，請確認登入與存取權限。');
          element.setAttribute('aria-disabled', 'true');
          if (attribute === 'href') element.append('（附件無法載入）');
        }
      }));
      if (active && request === generation) setRendered({ source: html, html: body.innerHTML });
    };
    void refresh();
    const timer = setInterval(() => void refresh(), ATTACHMENT_REFRESH_MS);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      signedOut.current = event === 'SIGNED_OUT' || !session;
      generation++;
      queueMicrotask(() => { if (active) void refresh(); });
    });
    return () => { active = false; generation++; clearInterval(timer); data.subscription.unsubscribe(); };
  }, [html]);
  return <div {...props} dangerouslySetInnerHTML={{ __html: rendered.source === html ? rendered.html : '' }} />;
}
