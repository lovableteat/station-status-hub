import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("issue content editors share one workspace and paste screenshots inline", async () => {
  const richTextEditor = await read("../src/components/ui/rich-text-editor.tsx");
  const contentWorkspace = await read("../src/components/issues/IssueContentWorkspace.tsx");
  const inlineImages = await read("../src/components/issues/issueInlineImages.ts");
  const createDialog = await read("../src/components/issues/IssueCreateDialog.tsx");
  const editDialog = await read("../src/components/issues/IssueEditDialog.tsx");

  assert.match(richTextEditor, /const handlePaste = useCallback/);
  assert.match(richTextEditor, /event\.clipboardData\.items/);
  assert.match(richTextEditor, /item\.type\.startsWith\(['"]image\//);
  assert.match(richTextEditor, /onPaste=\{handlePaste\}/);
  assert.match(richTextEditor, /await onImageUpload\(file\)/);
  assert.match(richTextEditor, /URL\.createObjectURL\(file\)/);
  assert.match(richTextEditor, /replaceImageSource\(previewUrl, uploadedUrl\)/);
  assert.match(richTextEditor, /if \(disableImageUpload\) return/);

  assert.match(contentWorkspace, /Ctrl\+V 貼上截圖/);
  assert.equal((contentWorkspace.match(/<RichTextEditor/g) || []).length, 3);
  assert.match(contentWorkspace, /onImageUpload=\{onImageUpload\}/);

  assert.match(inlineImages, /\.from\(["']issue-attachments["']\)/);
  assert.match(inlineImages, /\.from\(["']issue_attachments["']\)/);
  assert.match(inlineImages, /\/inline\//);
  assert.match(inlineImages, /export function hasMeaningfulIssueContent/);
  assert.match(inlineImages, /<img\b/i);

  for (const dialog of [createDialog, editDialog]) {
    assert.match(dialog, /<IssueContentWorkspace/);
    assert.match(dialog, /uploadInlineImage/);
    assert.match(dialog, /附件與截圖/);
  }

  assert.match(createDialog, /crypto\.randomUUID\(\)/);
  assert.match(createDialog, /id:\s*draftIssueId/);
  assert.match(createDialog, /hasMeaningfulIssueContent\(newIssue\.description\)/);
  assert.match(editDialog, /hasMeaningfulIssueContent\(formData\.description\)/);
  assert.match(editDialog, /cleanupPendingInlineImages/);
  assert.match(editDialog, /activeInlineUploadsRef/);
  assert.match(editDialog, /persistInlineImageAttachments/);
});
