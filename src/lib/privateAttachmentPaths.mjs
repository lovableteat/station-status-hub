export const PRIVATE_ATTACHMENT_BUCKETS = ['issue-attachments', 'task-attachments'];

function validPath(path) {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/')
    && !/[\u0000-\u001f\u007f\\]/.test(path)
    && !path.split('/').some(part => part === '.' || part === '..' || part === '');
}

// Only this project's recognized Storage routes may be re-signed. Never send
// credentials or turn an arbitrary external URL into an authorized object path.
export function parsePrivateAttachmentUrl(value, projectUrl) {
  if (!value || !projectUrl) return null;
  try {
    const url = new URL(value);
    const project = new URL(projectUrl);
    if (url.origin !== project.origin || !['https:', 'http:'].includes(url.protocol)) return null;
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/(issue-attachments|task-attachments)\/(.+)$/);
    if (!match) return null;
    const path = decodeURIComponent(match[2]);
    return validPath(path) ? { bucket: match[1], path } : null;
  } catch { return null; }
}

export function resolvePrivateAttachmentPath(bucket, value, projectUrl) {
  if (!PRIVATE_ATTACHMENT_BUCKETS.includes(bucket)) throw new Error('Unsupported attachment bucket');
  const parsed = parsePrivateAttachmentUrl(value, projectUrl);
  if (parsed) {
    if (parsed.bucket !== bucket) throw new Error('Attachment bucket mismatch');
    return parsed.path;
  }
  if (!value || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//') || !validPath(value)) {
    throw new Error('Invalid attachment path');
  }
  return value;
}
