import Image from '@tiptap/extension-image';
import { supabase } from '@/integrations/supabase/client';
import { ATTACHMENT_REFRESH_MS, parseAttachmentReference, signedAttachmentUrl, type PrivateAttachmentBucket } from '@/lib/privateAttachments';

// NodeView changes display DOM only. ProseMirror node.attrs.src and getHTML()
// retain the durable original URL, including for save, copy, undo and redo.
export const PrivateAttachmentEditorImage = Image.extend({
  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const image = document.createElement('img');
      let current = node, active = true, generation = 0, signedOut = false;
      const applyAttributes = () => {
        for (const [key, value] of Object.entries({ ...HTMLAttributes, ...current.attrs })) {
          if (key !== 'src' && value != null) image.setAttribute(key, String(value));
        }
        // Display-only metadata lets previews use the durable node value, never a temporary signed src.
        image.setAttribute('data-attachment-reference', String(current.attrs.src || ''));
      };
      const render = async () => {
        const request = ++generation;
        const source = String(current.attrs.src || '');
        const reference = parseAttachmentReference(source);
        if (!reference) { image.setAttribute('src', source); return; }
        image.removeAttribute('src');
        if (signedOut) return;
        try {
          const url = await signedAttachmentUrl(reference.bucket as PrivateAttachmentBucket, reference.path);
          if (active && request === generation) {
            image.src = url;
            if (current.attrs.title) image.title = String(current.attrs.title);
            else image.removeAttribute('title');
          }
        } catch {
          if (active && request === generation) image.title = '附件無法載入，請確認登入與存取權限。';
        }
      };
      applyAttributes();
      void render();
      const timer = setInterval(() => void render(), ATTACHMENT_REFRESH_MS);
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        signedOut = event === 'SIGNED_OUT' || !session;
        generation++;
        queueMicrotask(() => { if (active) void render(); });
      });
      return {
        dom: image,
        update(next) { if (next.type !== current.type) return false; current = next; applyAttributes(); void render(); return true; },
        ignoreMutation: () => true,
        destroy() { active = false; generation++; clearInterval(timer); data.subscription.unsubscribe(); },
      };
    };
  },
});
