import type { ImgHTMLAttributes } from 'react';
import type { PrivateAttachmentBucket } from '@/lib/privateAttachments';
import { usePrivateAttachmentUrl } from './usePrivateAttachmentUrl';

export function PrivateAttachmentImage({ bucket = 'issue-attachments', path, alt = '', ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { bucket?: PrivateAttachmentBucket; path: string }) {
  const { url, error } = usePrivateAttachmentUrl(bucket, path);
  return error ? <span role="status" className={props.className} title={error}>{alt || '圖片'}：附件無法載入</span>
    : <img {...props} src={url || undefined} alt={alt} aria-busy={!url} />;
}
