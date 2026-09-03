// Keep the existing text summary for older readers and CSV exports while
// preserving each achievement as an independently editable entry.
export function getAssessmentEntries(section) {
  if (!Array.isArray(section?.entries)) {
    return typeof section?.text === "string" && section.text.trim()
      ? [{ id: "legacy-entry", text: section.text }]
      : [];
  }
  const ids = new Set();
  return section.entries
    .filter((entry) => entry && typeof entry.text === "string")
    .map((entry, index) => {
      let id =
        typeof entry.id === "string" && entry.id ? entry.id : `entry-${index}`;
      while (ids.has(id)) id += `-${index}`;
      ids.add(id);
      return { id, text: entry.text };
    });
}

export function withAssessmentEntries(section, entries) {
  return {
    ...section,
    entries,
    text: entries
      .map((entry, index) => `${index + 1}. ${entry.text}`)
      .join("\n\n"),
  };
}

export function appendAssessmentEntry(section) {
  const text = section.draftText?.trim();
  if (!text) return section;
  return {
    ...withAssessmentEntries(section, [
      ...getAssessmentEntries(section),
      { id: crypto.randomUUID(), text },
    ]),
    draftText: "",
  };
}

// Saving/submitting also includes a last typed entry even if Add was not
// pressed. Local drafts retain the composer text in its original position.
export function commitAssessmentEntries(form) {
  return {
    ...form,
    self: {
      ...form.self,
      sections: Object.fromEntries(
        Object.entries(form.self.sections).map(([category, section]) => [
          category,
          appendAssessmentEntry(section),
        ]),
      ),
    },
  };
}
