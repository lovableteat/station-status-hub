import { useEffect, useRef, useState } from "react";
import { Link2, Plus, Save, Send, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ACCOUNTABILITY_QUESTIONS,
  CATEGORIES,
  CATEGORY_GUIDANCE,
  LEVELS,
  MAX_EVIDENCE_CHARACTERS,
  MAX_IMAGES_PER_CATEGORY,
  TEAMS,
  getKpiReference,
  getLevelWeights,
  readAssessmentDraft,
  safeEvidenceUrl,
  saveAssessmentDraft,
  validateAssessment,
} from "./rd2Assessment.mjs";
import type {
  AssessmentAction,
  AssessmentForm,
  AssessmentMode,
  AssessmentSection,
  Category,
  EmployeeOption,
  EvidenceImage,
} from "./assessmentTypes";

async function prepareImage(file: File): Promise<EvidenceImage> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )
    throw new Error("請選擇 8 MB 以下的 JPG、PNG 或 WebP 圖片。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(
      1,
      1200 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("此瀏覽器無法處理圖片，請改用內部連結。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/webp", 0.78);
    if (dataUrl.length > MAX_EVIDENCE_CHARACTERS / 2)
      throw new Error("圖片仍太大，請縮小圖片或改用內部連結。");
    const extension = dataUrl.startsWith("data:image/webp;") ? "webp" : "png";
    return {
      id: crypto.randomUUID(),
      name: `${file.name.replace(/\.[^.]+$/, "")}.${extension}`,
      dataUrl,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Evidence({
  category,
  section,
  readonly,
  onChange,
  onBusy,
  onError,
}: {
  category: Category;
  section: AssessmentSection;
  readonly: boolean;
  onChange: (update: (value: AssessmentSection) => AssessmentSection) => void;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addLink = () => {
    const url = safeEvidenceUrl(link);
    if (!url) {
      onError("請輸入有效的 HTTPS 證明連結。");
      return;
    }
    onChange((previous) => ({
      ...previous,
      links: [...new Set([...previous.links, url])],
    }));
    setLink("");
    onError("");
  };
  return (
    <div className="rd2-evidence">
      {!readonly && (
        <>
          <div className="rd2-evidence-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                busy || section.images.length >= MAX_IMAGES_PER_CATEGORY
              }
              onClick={() => inputRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              {busy ? "處理圖片中…" : "附上證明圖片"}
            </Button>
            <span className="rd2-hint">
              每項最多 2 張，圖片會縮小並隨考核儲存。
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            aria-label={`${category} 證明圖片`}
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              onBusy(true);
              try {
                const image = await prepareImage(file);
                onChange((previous) => ({
                  ...previous,
                  images: [...previous.images, image].slice(
                    0,
                    MAX_IMAGES_PER_CATEGORY,
                  ),
                }));
                onError("");
              } catch (error) {
                onError(
                  error instanceof Error
                    ? error.message
                    : "圖片處理失敗，請重試。",
                );
              } finally {
                setBusy(false);
                onBusy(false);
              }
            }}
          />
          <Field>
            <FieldLabel htmlFor={`link-${category}`}>
              證明連結（選填）
            </FieldLabel>
            <div className="rd2-link-input">
              <Input
                id={`link-${category}`}
                type="url"
                value={link}
                placeholder="https://… 內部文件或雲端資料夾"
                onChange={(event) => setLink(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addLink();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addLink}
                aria-label={`加入 ${category} 證明連結`}
              >
                <Link2 data-icon="inline-start" />
                加入
              </Button>
            </div>
          </Field>
        </>
      )}
      {!!section.images.length && (
        <div className="rd2-images">
          {section.images.map((image) => (
            <figure key={image.id}>
              <a href={image.dataUrl} download={image.name}>
                <img src={image.dataUrl} alt={image.name} loading="lazy" />
              </a>
              <figcaption>{image.name}</figcaption>
              {!readonly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`移除 ${image.name}`}
                  onClick={() =>
                    onChange((previous) => ({
                      ...previous,
                      images: previous.images.filter(
                        (item) => item.id !== image.id,
                      ),
                    }))
                  }
                >
                  <X data-icon="inline-start" />
                  移除
                </Button>
              )}
            </figure>
          ))}
        </div>
      )}
      {section.links.map((url) => (
        <div className="rd2-evidence-link" key={url}>
          <a href={url} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
          {!readonly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`移除連結 ${url}`}
              onClick={() =>
                onChange((previous) => ({
                  ...previous,
                  links: previous.links.filter((item) => item !== url),
                }))
              }
            >
              <X />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

interface Props {
  initial: AssessmentForm;
  mode: AssessmentMode;
  storageKey: string;
  readonly?: boolean;
  identityLocked?: boolean;
  canSubmit: boolean;
  employees: EmployeeOption[];
  demo: boolean;
  onSave: (
    form: AssessmentForm,
    action: AssessmentAction,
  ) => Promise<AssessmentForm>;
}

export function AssessmentEditor({
  initial,
  mode,
  storageKey,
  readonly = false,
  identityLocked = false,
  canSubmit,
  employees,
  demo,
  onSave,
}: Props) {
  const [restored] = useState(() =>
    readonly ? null : readAssessmentDraft(localStorage, storageKey, initial),
  );
  const [draftConflict, setDraftConflict] = useState(
    () =>
      !!restored &&
      !!initial.sourceUpdatedAt &&
      restored.form.sourceUpdatedAt !== initial.sourceUpdatedAt,
  );
  const [form, setForm] = useState<AssessmentForm>(restored?.form || initial);
  const [draftStatus, setDraftStatus] = useState(
    restored
      ? `已恢復本機草稿 · ${new Date(restored.savedAt).toLocaleString("zh-TW")}`
      : "尚無本機草稿",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageJobs, setImageJobs] = useState(0);
  const [clearOpen, setClearOpen] = useState(false);
  const latest = useRef(form);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const persistDraft = () => {
    try {
      const savedAt = saveAssessmentDraft(
        localStorage,
        storageKey,
        latest.current,
      );
      pending.current = false;
      setDraftStatus(
        `本機草稿已儲存 · ${new Date(savedAt).toLocaleTimeString("zh-TW")}`,
      );
    } catch {
      setDraftStatus(
        "本機空間不足，草稿尚未儲存；請減少圖片或先儲存到工作區。",
      );
    }
  };
  const change = (update: (previous: AssessmentForm) => AssessmentForm) => {
    if (readonly || saving) return;
    const next = update(latest.current);
    latest.current = next;
    pending.current = true;
    setForm(next);
    setError("");
    setDraftStatus("正在暫存…");
    clearTimeout(timer.current);
    timer.current = setTimeout(persistDraft, 500);
  };
  useEffect(() => {
    const flush = () => {
      if (!pending.current) return;
      try {
        saveAssessmentDraft(localStorage, storageKey, latest.current);
        pending.current = false;
      } catch {
        /* Keep the live form intact when storage is full. */
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (pending.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      clearTimeout(timer.current);
      flush();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [storageKey]);
  const updateSection = (
    category: Category,
    update: (section: AssessmentSection) => AssessmentSection,
  ) =>
    change((previous) => ({
      ...previous,
      self: {
        ...previous.self,
        sections: {
          ...previous.self.sections,
          [category]: update(previous.self.sections[category]),
        },
      },
    }));
  const reference = getKpiReference(form.self.team, form.self.level);
  const weights = getLevelWeights(form.self.level);
  const submit = async (action: AssessmentAction) => {
    const validation = validateAssessment(latest.current, mode, action);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (draftConflict)
        throw new Error(
          "工作區已有較新版本，請先複製要保留的草稿文字，再清除本機草稿以載入最新內容。",
        );
      const confirmed = await onSave(latest.current, action);
      latest.current = confirmed;
      setForm(confirmed);
      clearTimeout(timer.current);
      pending.current = false;
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* Cloud confirmation is independent of browser storage. */
      }
      setDraftStatus(demo ? "已儲存至本機示範紀錄" : "已儲存至工作區");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "儲存失敗，草稿仍保留，請稍後重試。",
      );
      persistDraft();
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      className="rd2-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !readonly && !saving && !imageJobs)
          void submit("submit");
      }}
    >
      <header className="rd2-section-heading">
        <h2>
          {readonly
            ? "考核內容"
            : mode === "self"
              ? "員工自評填寫區（STAR）"
              : "主管評分區（當責維度）"}
        </h2>
        <p>
          {mode === "self"
            ? "依 IDP、OKR、KPI 分別填寫實績，並附上證明。"
            : "針對當責維度題目評分，兩題皆須完成。"}
        </p>
      </header>
      {!readonly && (
        <footer className="rd2-form-footer">
          {draftConflict && (
            <p className="rd2-error" role="alert">
              工作區已有較新版本，目前顯示舊草稿供你核對。請先複製要保留的文字，再清除本機草稿以載入最新內容。
            </p>
          )}
          {error && (
            <p className="rd2-error" role="alert">
              {error}
            </p>
          )}
          {!canSubmit && (
            <p className="rd2-hint">
              目前為檢視權限，可暫存本機草稿；送出需要績效考核管理權限。
            </p>
          )}
          <p className="rd2-draft-status" role="status">
            {draftStatus}
          </p>
          <div className="rd2-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={saving || !!imageJobs}
              onClick={() => setClearOpen(true)}
            >
              <Trash2 data-icon="inline-start" />
              清除本機草稿
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving || !!imageJobs}
              onClick={persistDraft}
            >
              <Save data-icon="inline-start" />
              儲存本機草稿
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canSubmit || saving || !!imageJobs}
              onClick={() => void submit("draft")}
            >
              儲存至工作區
            </Button>
            {mode === "manager" && (
              <Button
                type="button"
                variant="outline"
                disabled={!canSubmit || saving || !!imageJobs}
                onClick={() => void submit("return")}
              >
                退回補充
              </Button>
            )}
            <Button
              type="submit"
              disabled={!canSubmit || saving || !!imageJobs}
            >
              <Send data-icon="inline-start" />
              {saving
                ? "儲存中…"
                : mode === "self"
                  ? "送出自評"
                  : "送出主管評分"}
            </Button>
          </div>
        </footer>
      )}
      <fieldset disabled={readonly || saving} className="rd2-card rd2-identity">
        <FieldGroup className="rd2-field-grid">
          {!identityLocked && !!employees.length && (
            <Field>
              <FieldLabel htmlFor="rd2-employee">
                選擇員工（或直接輸入姓名）
              </FieldLabel>
              <select
                id="rd2-employee"
                value={form.employeeId}
                onChange={(event) => {
                  const employee = employees.find(
                    (item) => item.id === event.target.value,
                  );
                  change((previous) => ({
                    ...previous,
                    employeeId: employee?.id || "",
                    employeeName: employee?.label || "",
                  }));
                }}
              >
                <option value="">直接填寫</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="rd2-name">員工姓名 *</FieldLabel>
            <Input
              id="rd2-name"
              value={form.employeeName}
              readOnly={identityLocked}
              onChange={(event) =>
                change((previous) => ({
                  ...previous,
                  employeeId: identityLocked ? previous.employeeId : "",
                  employeeName: event.target.value,
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rd2-number">員工工號 *</FieldLabel>
            <Input
              id="rd2-number"
              value={form.self.employeeNumber}
              onChange={(event) =>
                change((previous) => ({
                  ...previous,
                  self: {
                    ...previous.self,
                    employeeNumber: event.target.value,
                  },
                }))
              }
            />
          </Field>
          {mode === "self" && (
            <>
              <Field>
                <FieldLabel htmlFor="rd2-team">所屬團隊 *</FieldLabel>
                <select
                  id="rd2-team"
                  value={form.self.team}
                  onChange={(event) =>
                    change((previous) => ({
                      ...previous,
                      self: { ...previous.self, team: event.target.value },
                    }))
                  }
                >
                  <option value="">請選擇團隊</option>
                  {TEAMS.map((team) => (
                    <option key={team.value} value={team.value}>
                      {team.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="rd2-level">職級 *</FieldLabel>
                <select
                  id="rd2-level"
                  value={form.self.level}
                  onChange={(event) =>
                    change((previous) => ({
                      ...previous,
                      self: { ...previous.self, level: event.target.value },
                    }))
                  }
                >
                  <option value="">請選擇職級</option>
                  {LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field>
            <FieldLabel htmlFor="rd2-due">截止日期</FieldLabel>
            <Input
              id="rd2-due"
              type="date"
              value={form.dueDate}
              onChange={(event) =>
                change((previous) => ({
                  ...previous,
                  dueDate: event.target.value,
                }))
              }
            />
          </Field>
        </FieldGroup>
      </fieldset>
      {mode === "self" && (
        <>
          <div className="rd2-category-grid">
          {CATEGORIES.map((value) => {
            const category = value as Category;
            const guide = CATEGORY_GUIDANCE[category];
            return (
              <fieldset
                disabled={readonly || saving}
                key={category}
                data-category={category}
                className="rd2-card rd2-category"
              >
                <div className="rd2-category-heading">
                  <h3>
                    {category} — {guide.title}
                  </h3>
                  {form.self.level && (
                    <span>政策權重 {weights[category]}%</span>
                  )}
                </div>
                <details className="rd2-reference" open={category === "KPI"}>
                  <summary>
                    {category === "KPI"
                      ? `角色專屬標準${reference ? ` (${form.self.team} · ${form.self.level.toUpperCase()})` : ""}`
                      : "撰寫參考與範例"}
                  </summary>
                  {category === "KPI" ? (
                    reference ? (
                      <div className="rd2-reference-grid">
                        <div>
                          <h4>Base line</h4>
                          <ul>
                            {reference.baseline.map((line: string) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4>Outstanding</h4>
                          <ul>
                            {reference.outstanding.map((line: string) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <p>先選擇團隊與職級，即可查看對應標準。</p>
                    )
                  ) : (
                    <>
                      <p>{guide.focus}</p>
                      <p className="rd2-prewrap">{guide.example}</p>
                    </>
                  )}
                </details>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={`rd2-${category}`}>
                      {category} 實績 *
                    </FieldLabel>
                    <Textarea
                      id={`rd2-${category}`}
                      rows={6}
                      placeholder={
                        "S（情境）：…\nT（任務）：…\nA（行動）：…\nR（結果）：…"
                      }
                      value={form.self.sections[category].text}
                      onChange={(event) =>
                        updateSection(category, (previous) => ({
                          ...previous,
                          text: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Evidence
                    category={category}
                    section={form.self.sections[category]}
                    readonly={readonly}
                    onChange={(update) => updateSection(category, update)}
                    onBusy={(busy) =>
                      setImageJobs((count) => count + (busy ? 1 : -1))
                    }
                    onError={setError}
                  />
                </FieldGroup>
              </fieldset>
            );
          })}
          </div>
          {form.self.legacyText && (
            <section className="rd2-card">
              <Field>
                <FieldLabel htmlFor="rd2-legacy">
                  既有自評內容（保留）
                </FieldLabel>
                <Textarea
                  id="rd2-legacy"
                  readOnly={readonly}
                  disabled={saving}
                  rows={4}
                  value={form.self.legacyText}
                  onChange={(event) =>
                    change((previous) => ({
                      ...previous,
                      self: {
                        ...previous.self,
                        legacyText: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
            </section>
          )}
          <details className="rd2-card">
            <summary>既有目標與進度（{form.goals.length} 項）</summary>
            <fieldset disabled={readonly || saving}>
              <FieldGroup>
                {form.goals.map((goal, index) => (
                  <div className="rd2-goal" key={goal.id}>
                    <Field>
                      <FieldLabel htmlFor={`goal-title-${goal.id}`}>
                        目標 {index + 1}
                      </FieldLabel>
                      <Input
                        id={`goal-title-${goal.id}`}
                        value={goal.title}
                        onChange={(event) =>
                          change((previous) => ({
                            ...previous,
                            goals: previous.goals.map((item) =>
                              item.id === goal.id
                                ? { ...item, title: event.target.value }
                                : item,
                            ),
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`goal-category-${goal.id}`}>
                        分類
                      </FieldLabel>
                      <select
                        id={`goal-category-${goal.id}`}
                        value={goal.category}
                        onChange={(event) =>
                          change((previous) => ({
                            ...previous,
                            goals: previous.goals.map((item) =>
                              item.id === goal.id
                                ? {
                                    ...item,
                                    category: event.target.value as Category,
                                  }
                                : item,
                            ),
                          }))
                        }
                      >
                        {CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`goal-weight-${goal.id}`}>
                        權重 %
                      </FieldLabel>
                      <Input
                        id={`goal-weight-${goal.id}`}
                        type="number"
                        min={0}
                        max={100}
                        value={goal.weight}
                        onChange={(event) =>
                          change((previous) => ({
                            ...previous,
                            goals: previous.goals.map((item) =>
                              item.id === goal.id
                                ? {
                                    ...item,
                                    weight: Math.min(
                                      100,
                                      Math.max(
                                        0,
                                        Number(event.target.value) || 0,
                                      ),
                                    ),
                                  }
                                : item,
                            ),
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`goal-progress-${goal.id}`}>
                        進度 %
                      </FieldLabel>
                      <Input
                        id={`goal-progress-${goal.id}`}
                        type="number"
                        min={0}
                        max={100}
                        value={goal.progress}
                        onChange={(event) =>
                          change((previous) => ({
                            ...previous,
                            goals: previous.goals.map((item) =>
                              item.id === goal.id
                                ? {
                                    ...item,
                                    progress: Math.min(
                                      100,
                                      Math.max(
                                        0,
                                        Number(event.target.value) || 0,
                                      ),
                                    ),
                                  }
                                : item,
                            ),
                          }))
                        }
                      />
                    </Field>
                    {!readonly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`移除目標 ${index + 1}`}
                        onClick={() =>
                          change((previous) => ({
                            ...previous,
                            goals: previous.goals.filter(
                              (item) => item.id !== goal.id,
                            ),
                          }))
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                ))}
                {!readonly && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      change((previous) => ({
                        ...previous,
                        goals: [
                          ...previous.goals,
                          {
                            id: crypto.randomUUID(),
                            category: "KPI",
                            title: "",
                            progress: 0,
                            weight: 0,
                          },
                        ],
                      }))
                    }
                  >
                    <Plus data-icon="inline-start" />
                    新增目標
                  </Button>
                )}
              </FieldGroup>
            </fieldset>
          </details>
        </>
      )}
      {mode === "manager" && (
        <>
          <div className="rd2-question-grid">
          {ACCOUNTABILITY_QUESTIONS.map((question, index) => (
            <fieldset
              key={question.id}
              disabled={readonly || saving}
              data-question-index={index + 1}
              className="rd2-card rd2-question"
            >
              <legend>
                第 {index + 1} 題 · {question.dimension}
              </legend>
              <p className="rd2-hint">{question.role}</p>
              <h3 id={`question-${question.id}`}>{question.text}</h3>
              <RadioGroup
                className="rd2-rating"
                aria-labelledby={`question-${question.id}`}
                value={String(
                  form.manager.answers[question.id as "q1" | "q2"] || "",
                )}
                disabled={readonly || saving}
                onValueChange={(value) =>
                  change((previous) => ({
                    ...previous,
                    manager: {
                      ...previous.manager,
                      answers: {
                        ...previous.manager.answers,
                        [question.id]: Number(value),
                      },
                    },
                  }))
                }
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <Field key={value} orientation="horizontal">
                    <RadioGroupItem
                      id={`${question.id}-${value}`}
                      value={String(value)}
                    />
                    <FieldLabel htmlFor={`${question.id}-${value}`}>
                      {value} 分
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
              <p className="rd2-hint">1 分：低度符合 · 5 分：高度符合</p>
            </fieldset>
          ))}
          </div>
          <fieldset
            disabled={readonly || saving}
            className="rd2-card rd2-feedback-card"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="rd2-feedback">主管回饋</FieldLabel>
                <Textarea
                  id="rd2-feedback"
                  rows={5}
                  value={form.manager.feedback}
                  onChange={(event) =>
                    change((previous) => ({
                      ...previous,
                      manager: {
                        ...previous.manager,
                        feedback: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rd2-score">
                  綜合評分（0–100，選填）
                </FieldLabel>
                <Input
                  id="rd2-score"
                  type="number"
                  min={0}
                  max={100}
                  value={form.score}
                  placeholder="尚未評分"
                  onChange={(event) =>
                    change((previous) => ({
                      ...previous,
                      score: event.target.value,
                    }))
                  }
                />
                <p className="rd2-hint">
                  延續平台既有欄位，不以當責題目換算總分。
                </p>
              </Field>
            </FieldGroup>
          </fieldset>
        </>
      )}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清除目前的本機草稿？</AlertDialogTitle>
            <AlertDialogDescription>
              僅清除這份草稿並回復工作區已儲存的內容，不會刪除考核紀錄或其他人的草稿。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                try {
                  localStorage.removeItem(storageKey);
                  clearTimeout(timer.current);
                  pending.current = false;
                  latest.current = initial;
                  setForm(initial);
                  setDraftConflict(false);
                  setDraftStatus("本機草稿已清除");
                  setError("");
                } catch {
                  setError("無法清除本機草稿，請檢查瀏覽器儲存設定。");
                }
              }}
            >
              清除草稿
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
