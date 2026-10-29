import type { MaterialSpecDocument, MaterialWorkbookRecord } from "./materialRequestUtils";

type AttachmentRecord = Pick<MaterialWorkbookRecord, "specDocument" | "specDocuments">;

/** Read old single-document records without copying or losing their attachment. */
export function getMaterialSpecDocuments(record: AttachmentRecord): MaterialSpecDocument[] {
  const seen = new Set<string>();
  return [...(record.specDocuments ?? []), ...(record.specDocument ? [record.specDocument] : [])]
    .filter(document => document?.path && !seen.has(document.path) && seen.add(document.path));
}

export function withMaterialSpecDocuments<T extends AttachmentRecord>(record: T, documents: MaterialSpecDocument[]): T {
  const unique = getMaterialSpecDocuments({ specDocuments: documents });
  // Mirror the first attachment for older clients that still understand a single document.
  return { ...record, specDocuments: unique, specDocument: unique[0] };
}
