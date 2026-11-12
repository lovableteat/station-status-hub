import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ATTACHMENT_REFRESH_MS, signedAttachmentUrl, type PrivateAttachmentBucket } from '@/lib/privateAttachments';

export function usePrivateAttachmentUrl(bucket: PrivateAttachmentBucket, path: string | null | undefined) {
  const [state, setState] = useState({ bucket, path: '', url: '', error: '' });
  const signedOut = useRef(false);
  useEffect(() => {
    let active = true, generation = 0;
    const refresh = async () => {
      const request = ++generation;
      if (!path || signedOut.current) { setState({ bucket, path: path || '', url: '', error: '' }); return; }
      try {
        const url = await signedAttachmentUrl(bucket, path);
        if (active && request === generation) setState({ bucket, path, url, error: '' });
      } catch {
        if (active && request === generation) setState({ bucket, path, url: '', error: '附件無法載入，請確認登入與存取權限。' });
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), ATTACHMENT_REFRESH_MS);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      signedOut.current = event === 'SIGNED_OUT' || !session;
      generation++;
      if (active) setState({ bucket, path: path || '', url: '', error: '' });
      if (!signedOut.current) queueMicrotask(() => { if (active) void refresh(); });
    });
    return () => { active = false; generation++; clearInterval(timer); data.subscription.unsubscribe(); };
  }, [bucket, path]);
  return state.bucket === bucket && state.path === path ? state : { bucket, path: path || '', url: '', error: '' };
}

