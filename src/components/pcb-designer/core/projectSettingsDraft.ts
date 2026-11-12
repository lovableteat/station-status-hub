import {
  clearDocumentDraft, documentDraftScope, isDocumentDraftScopeCurrent,
  readDocumentDraft, writeDocumentDraft, type DocumentDraftScope,
} from '../../../lib/documentDrafts.ts';
import type { PcbProject } from '../types.ts';
import { resizeBoard } from './resizeBoard.ts';

export interface ProjectSettingsDraft {
  kind: 'project-settings';
  projectId: string;
  baselineRevision: string;
  values: Record<string, string>;
  error: string;
}
export type ProjectSettings = Pick<PcbProject, 'name' | 'description' | 'projectGroup' | 'revision' | 'status'> & { width: number; height: number };
// Exact content revision also detects same-timestamp changes; no project snapshot is applied back.
export function projectSettingsRevision(project: PcbProject): string {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
  return JSON.stringify(stable(project));
}
export function initialProjectSettings(project: PcbProject): ProjectSettingsDraft {
  return { kind: 'project-settings', projectId: project.id, baselineRevision: projectSettingsRevision(project), error: '', values: {
    name: project.name, description: project.description, projectGroup: project.projectGroup ?? '',
    revision: project.revision ?? '1', width: String(project.board.width), height: String(project.board.height), status: project.status,
  } };
}
export function projectSettingsConflict(draft: Pick<ProjectSettingsDraft, 'projectId' | 'baselineRevision'>, project: PcbProject | undefined): string {
  if (!project || project.id !== draft.projectId) return '專案已不存在；未套用輸入仍保留，請先確認專案。';
  return draft.baselineRevision === projectSettingsRevision(project) ? '' : '專案內容已變更；未套用輸入仍保留。請先複製需要的內容，再取消並重新開啟設定。';
}
export function parseProjectSettings(values: Record<string, string>): ProjectSettings | string {
  const name = values.name?.trim();
  if (!name) return '名稱為必填欄位。';
  const width = Number(values.width), height = Number(values.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 20 || width > 1000 || height < 20 || height > 1000) return '板框尺寸必須介於 20 到 1000 mm。';
  if (!['draft', 'review', 'approved'].includes(values.status)) return '請選擇有效的專案狀態。';
  return { name, description: values.description ?? '', projectGroup: values.projectGroup?.trim(), revision: values.revision?.trim() || '1',
    status: values.status as PcbProject['status'], width, height };
}
export function applyProjectSettings(project: PcbProject, baselineRevision: string, settings: ProjectSettings): PcbProject | null {
  if (projectSettingsRevision(project) !== baselineRevision) return null;
  const { width, height, ...fields } = settings;
  return { ...project, ...fields, board: resizeBoard(project, { width, height }, 'top-left').board };
}

/** Synchronous event-handler writes survive an immediately following gate unmount. */
export class ProjectSettingsSession {
  readonly scope: DocumentDraftScope | null;
  private cancelled = false;
  generation: number | null;
  draft: ProjectSettingsDraft;
  constructor(actorId: string | null | undefined, project: PcbProject) {
    this.scope = documentDraftScope(actorId, 'pcb-project-settings', project.id, 'pcb-dialog');
    const entry = readDocumentDraft<ProjectSettingsDraft>(this.scope);
    this.draft = entry?.value ?? initialProjectSettings(project);
    this.generation = entry?.generation ?? null;
  }
  get current(): boolean { return !this.cancelled && isDocumentDraftScopeCurrent(this.scope); }
  write(values: Record<string, string>, error = this.draft.error): boolean {
    if (!this.current || (readDocumentDraft(this.scope)?.generation ?? null) !== this.generation) return false;
    this.draft = { ...this.draft, values: { ...values }, error };
    this.generation = writeDocumentDraft(this.scope, this.draft);
    return this.generation !== null;
  }
  cancel(): void { this.clear(); this.cancelled = true; }
  clear(generation = this.generation): boolean {
    return generation !== null && clearDocumentDraft(this.scope, generation);
  }
}
