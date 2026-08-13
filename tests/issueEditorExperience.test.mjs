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

test("all issue detail surfaces always show the shared process history", async () => {
  const tracker = await read("../src/components/issues/IssueTracker.tsx");
  const detailDialog = await read("../src/components/issues/IssueDetailDialog.tsx");
  const processHistory = await read("../src/components/issues/IssueProcessHistory.tsx");

  assert.match(tracker, /<IssueProcessHistory/);
  assert.match(detailDialog, /<IssueProcessHistory/);
  assert.match(processHistory, /data-ui="issue-process-history"/);
  assert.match(processHistory, /目前尚未填寫處理紀錄/);
  assert.match(processHistory, /DOMPurify\.sanitize\(processNotes/);
  assert.match(processHistory, /最後更新/);
  assert.match(tracker, /setSelectedIssue\(\(current\) =>/);
  assert.match(tracker, /normalizedIssues\.find\(\(issue\) => issue\.id === current\.id\)/);
});

test("issue editing stays flat and every destructive or upload action cleans up storage", async () => {
  const editDialog = await read("../src/components/issues/IssueEditDialog.tsx");
  const contentWorkspace = await read("../src/components/issues/IssueContentWorkspace.tsx");
  const attachments = await read("../src/components/issues/AttachmentManager.tsx");
  const table = await read("../src/components/issues/IssueTableView.tsx");

  assert.match(contentWorkspace, /data-ui="issue-content-workspace"/);
  assert.doesNotMatch(contentWorkspace, /rounded-2xl border border-\[#315b78\]/);
  assert.match(contentWorkspace, /rounded-none border-b-2 border-transparent/);
  assert.match(editDialog, /<div className="divide-y divide-\[#294c66\]">/);
  assert.match(editDialog, /value === "unassigned" \? "" : value/);
  assert.match(table, /newAssignee === 'unassigned' \? null : newAssignee/);
  assert.match(table, /onAttachmentUpdate=\{\(\) => setHasAttachmentChanges\(true\)\}/);
  assert.match(table, /if \(hasAttachmentChanges\)[\s\S]*?onUpdate\(\)/);
  assert.match(editDialog, /\.select\('file_path'\)/);
  assert.match(editDialog, /\.remove\(storedPaths\)/);
  assert.match(editDialog, /if \(uploadedPath\)[\s\S]*?\.remove\(\[uploadedPath\]\)/);
  assert.match(editDialog, /attachmentInputRef\.current\?\.click\(\)/);
  assert.match(editDialog, /ref=\{attachmentInputRef\}/);
  assert.match(attachments, /\.remove\(\[attachment\.file_path\]\)[\s\S]*?\.from\('issue_attachments'\)[\s\S]*?\.delete\(\)/);
});

test("rich text controls are named, non-submitting, and reusable", async () => {
  const editor = await read("../src/components/ui/rich-text-editor.tsx");

  assert.match(editor, /role="toolbar" aria-label="內容格式工具列"/);
  for (const label of [
    "粗體",
    "斜體",
    "底線",
    "項目符號",
    "編號清單",
    "插入表格",
    "插入連結",
    "上傳圖片",
    "插入圖片 URL",
    "復原",
    "重做",
    "清除格式",
  ]) {
    assert.match(editor, new RegExp(`aria-label=["']${label}["']`));
  }
  assert.match(editor, /finally \{\s*input\.value = ''/);
  assert.match(editor, /disabled=\{!linkUrl\.trim\(\) \|\| !linkText\.trim\(\)\}/);
  assert.match(editor, /disabled=\{!imageUrl\.trim\(\)\}/);
  assert.match(editor, /onPointerDown=\{rememberColorSelection\}/);
  assert.match(editor, /setTextSelection\(selection\)[\s\S]*?setColor\(color\)/);
  assert.match(editor, /TEXT_COLOR_OPTIONS\.map/);
  assert.match(editor, /文字顏色：\$\{color\.label\}/);
  assert.match(editor, /StarterKit\.configure\(\{[\s\S]*?link: false/);
  assert.match(editor, /aria-label="關閉圖片預覽"/);
});
