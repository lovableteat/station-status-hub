import DOMPurify from 'dompurify';
import { SUPABASE_URL } from '@/integrations/supabase/client';
import { parseAttachmentReference, type PrivateAttachmentBucket } from './privateAttachments';

type Reference = { bucket: PrivateAttachmentBucket; path: string };
type Candidate = { url: string; descriptor: string; protected: boolean; reference: Reference | null };
export type AttachmentHtmlBinding = { element: Element; attribute: string; candidates: Candidate[]; multiple: boolean };
const whitespace = /[\t\n\f\r ]/;

// URL tokens in srcset are NOT comma-separated strings: data URLs and ordinary
// URL paths may contain commas. Follow the HTML URL/descriptor token boundaries;
// reject malformed descriptors instead of reinterpreting them as another URL.
export function parseAttachmentSrcset(input: string): { url: string; descriptor: string }[] {
  const result: { url: string; descriptor: string }[] = [];
  let position = 0;
  while (position < input.length) {
    while (position < input.length && (whitespace.test(input[position]) || input[position] === ',')) position++;
    const start = position;
    while (position < input.length && !whitespace.test(input[position])) position++;
    let url = input.slice(start, position);
    if (!url) break;
    if (url.endsWith(',')) { url = url.replace(/,+$/, ''); if (url) result.push({ url, descriptor: '' }); continue; }
    const descriptorStart = position;
    let parentheses = 0;
    while (position < input.length) {
      const char = input[position];
      if (char === ',' && parentheses === 0) break;
      if (char === '(') parentheses++;
      if (char === ')') parentheses = Math.max(0, parentheses - 1);
      position++;
    }
    const descriptors = input.slice(descriptorStart, position).trim().split(/[\t\n\f\r ]+/).filter(Boolean);
    if (position < input.length) position++;
    let width = false, density = false, height = false, valid = true;
    for (const descriptor of descriptors) {
      const value = Number(descriptor.slice(0, -1));
      if (/^\d+w$/.test(descriptor) && Number.isFinite(value) && value > 0 && !width && !density) width = true;
      else if (/^\d+h$/.test(descriptor) && Number.isFinite(value) && value > 0 && !height && !density) height = true;
      else if (/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?x$/.test(descriptor)
        && Number.isFinite(value) && value >= 0 && !density && !width && !height) density = true;
      else valid = false;
    }
    if (height && !width) valid = false;
    if (valid) result.push({ url, descriptor: descriptors.join(' ') });
  }
  return result;
}
function classify(url: string): Pick<Candidate, 'protected' | 'reference'> {
  try {
    const project = new URL(SUPABASE_URL);
    // WHATWG special-scheme parsing treats backslashes as slashes and strips
    // tabs/newlines. Resolve for classification only, including relative aliases;
    // never authorize those normalized spellings for signing.
    const parsed = new URL(url, project.origin + '/');
    const canonicalTransport = /^(?:https?:)?\/\//i.test(url)
      && !Array.from(url).some(char => char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
    // Classification is deliberately wider than signing: wrong scheme/port,
    // a DNS-equivalent trailing dot or encoded routing must not become a public
    // fallback. Only the exact original project origin/path can be signed.
    if (parsed.hostname.replace(/\.$/, '') !== project.hostname.replace(/\.$/, '')) return { protected: false, reference: null };
    const route = /^\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/(issue-attachments|task-attachments)(?:\/|$)/;
    let decodedPath = parsed.pathname, protectedRoute = false, encodingLimit = true;
    for (let depth = 0; depth < 16; depth++) {
      if (route.test(decodedPath)) { protectedRoute = true; encodingLimit = false; break; }
      // Decode routing ASCII even if an unrelated path suffix has malformed UTF8.
      // This is classification only; decoded text is NEVER submitted to Storage.
      const next = decodedPath.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      if (next === decodedPath) { encodingLimit = false; break; }
      decodedPath = next;
    }
    if (!protectedRoute) return { protected: encodingLimit, reference: null };
    if (!canonicalTransport || parsed.origin !== project.origin || !route.test(parsed.pathname)) return { protected: true, reference: null };
    parsed.pathname = parsed.pathname.replace('/storage/v1/render/image/', '/storage/v1/object/');
    const reference = parseAttachmentReference(parsed.href) as Reference | null;
    return { protected: true, reference };
  } catch { return { protected: false, reference: null }; }
}
export function serializeAttachmentCandidates(candidates: { url: string; descriptor: string }[], multiple: boolean): string {
  return candidates.map(candidate => (multiple ? candidate.url.replace(/[\t\n\f\r ]/g, char => encodeURIComponent(char)) : candidate.url) + (multiple && candidate.descriptor ? ' ' + candidate.descriptor : '')).join(multiple ? ', ' : '');
}
export function preparePrivateAttachmentHtml(html: string) {
  // DOMPurify builds an inert document; do not parse the sanitized string again
  // in a live document before removing unsigned URLs.
  const sanitized = DOMPurify.sanitize(html, { RETURN_DOM: true, FORBID_TAGS: ['style'] });
  if (sanitized.nodeType !== 1) throw new Error('Attachment sanitizer did not return an inert element');
  const body = sanitized as Element;
  const bindings: AttachmentHtmlBinding[] = [];
  const urlAttributes = new Set(['src', 'href', 'xlink:href', 'poster', 'background', 'action', 'formaction', 'cite', 'longdesc', 'data', 'usemap', 'glyphref']);
  const cssUrlAttributes = new Set(['fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end', 'cursor', 'color-profile', 'mathbackground']);
  const unsafeCssPattern = /url|image(?:-set)?\s*\(|@import|\/\*|\\|var\s*\(/i;
  const unsafeCss = (value: string) => unsafeCssPattern.test(value.replace(/url\(\s*(["']?)#[a-zA-Z0-9_.:-]+\1\s*\)/gi, ''));
  const elements = Array.from(body.querySelectorAll('*'));
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    // Template contents are separate inert fragments, not querySelector children.
    // Sanitize their URL transports too rather than leaving an unsigned latent copy.
    if (element.localName === 'template') {
      const content = (element as HTMLTemplateElement).content;
      if (content) elements.push(...Array.from(content.querySelectorAll('*')));
    }
    // CSS is not a supported attachment URL transport. Preserve ordinary inline
    // formatting, but fail closed for URL-capable/escaped CSS in this display.
    // Persisted HTML remains untouched; never run a CSS URL through Storage.
    const style = element.getAttribute('style');
    if (style && unsafeCss(style)) element.removeAttribute('style');
    for (const attribute of Array.from(element.attributes)) {
      const key = attribute.name.toLowerCase();
      if (cssUrlAttributes.has(key) && unsafeCss(attribute.value)) { element.removeAttribute(attribute.name); continue; }
      const multiple = key === 'srcset' || key === 'imagesrcset';
      if (!multiple && !urlAttributes.has(key)) continue;
      const values = multiple ? parseAttachmentSrcset(attribute.value).filter(candidate => DOMPurify.isValidAttribute(element.localName, 'srcset', candidate.url)) : [{ url: attribute.value, descriptor: '' }];
      const candidates = values.map(value => ({ ...value, ...classify(value.url) }));
      if (!candidates.some(candidate => candidate.protected)) {
        // Do not leave invalid private candidates dormant in the original text.
        // Also validate each URL, not merely the first scheme in a srcset string.
        if (multiple) {
          const normalized = serializeAttachmentCandidates(candidates, true);
          if (normalized) element.setAttribute(attribute.name, normalized); else element.removeAttribute(attribute.name);
        }
        continue;
      }
      const remaining = serializeAttachmentCandidates(candidates.filter(candidate => !candidate.protected), multiple);
      if (remaining) element.setAttribute(attribute.name, remaining); else element.removeAttribute(attribute.name);
      bindings.push({ element, attribute: attribute.name, candidates, multiple });
    }
  }
  return { body, bindings };
}
