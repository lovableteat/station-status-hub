import { supabase } from "@/integrations/supabase/client";

export interface PendingInlineImage {
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  publicUrl: string;
}

function fileExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && extension !== file.name.toLowerCase()) return extension;
  return file.type.split("/").pop()?.replace("jpeg", "jpg") || "png";
}

export function hasMeaningfulIssueContent(content: string) {
  if (/<img\b/i.test(content)) return true;
  return content.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length > 0;
}

export async function uploadInlineImage(issueId: string, file: File): Promise<PendingInlineImage> {
  const extension = fileExtension(file);
  const fileName = file.name || `clipboard-${Date.now()}.${extension}`;
  const filePath = `${issueId}/inline/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("issue-attachments")
    .upload(filePath, file, { contentType: file.type, upsert: false });

  if (error) throw error;

  const publicUrl = supabase.storage.from("issue-attachments").getPublicUrl(filePath).data.publicUrl;
  return {
    fileName,
    filePath,
    fileSize: file.size,
    fileType: file.type,
    publicUrl,
  };
}

export async function persistInlineImageAttachments(issueId: string, images: PendingInlineImage[]) {
  if (images.length === 0) return;

  const { error } = await supabase.from("issue_attachments").insert(
    images.map((image) => ({
      issue_id: issueId,
      file_name: image.fileName,
      file_path: image.filePath,
      file_size: image.fileSize,
      file_type: image.fileType,
    }))
  );

  if (error) throw error;
}

export async function cleanupInlineImages(images: PendingInlineImage[]) {
  if (images.length === 0) return;
  const { error } = await supabase.storage
    .from("issue-attachments")
    .remove(images.map((image) => image.filePath));
  if (error) throw error;
}
