import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAssessmentEntry,
  commitAssessmentEntries,
  getAssessmentEntries,
  withAssessmentEntries,
} from "../src/components/performance/assessmentEntries.mjs";
import {
  createAssessmentForm,
  readAssessmentDraft,
  saveAssessmentDraft,
  serializeSelfAssessment,
  readSelfAssessment,
} from "../src/components/performance/rd2Assessment.mjs";
import {
  organizationTreeMembers,
  validateOrganizationManager,
  availableOrganizationMembers,
} from "../src/components/performance/organizationData.mjs";

test("organization dropdown excludes every classified level and restores only removed active accounts", () => {
  const roster = [
    {
      employee_id: "director",
      account_status: "active",
      org_level: "director",
      manager_id: null,
      updated_at: "2026-09-03T08:00:00Z",
    },
    {
      employee_id: "chief",
      account_status: "active",
      org_level: "section_chief",
      updated_at: "2026-09-03T08:00:00Z",
    },
    {
      employee_id: "member",
      account_status: "active",
      org_level: "member",
      updated_at: "2026-09-03T08:00:00Z",
    },
    { employee_id: "new", account_status: "active", updated_at: null },
    { employee_id: "inactive", account_status: "inactive", updated_at: null },
  ];
  assert.deepEqual(
    availableOrganizationMembers(roster).map((m) => m.employee_id),
    ["new"],
  );
  roster[0].updated_at = null;
  assert.deepEqual(
    availableOrganizationMembers(roster).map((m) => m.employee_id),
    ["director", "new"],
  );
  roster[0].updated_at = "2026-09-03T09:00:00Z";
  assert.deepEqual(
    availableOrganizationMembers(roster).map((m) => m.employee_id),
    ["new"],
  );
});

test("legacy STAR text remains a single intact entry and supports continued additions", () => {
  const legacy = {
    text: "S: situation\nT: task\nA: action\nR: result",
    images: [{ id: "proof" }],
    links: ["https://example.com"],
  };
  let section = legacy;
  for (let i = 0; i < 40; i++)
    section = appendAssessmentEntry({
      ...section,
      draftText: `Achievement ${i}`,
    });
  assert.equal(getAssessmentEntries(section).length, 41);
  assert.equal(section.entries[0].text, legacy.text);
  assert.deepEqual(section.images, legacy.images);
  assert.deepEqual(section.links, legacy.links);
  assert.equal(section.draftText, "");
  const edited = withAssessmentEntries(
    section,
    section.entries
      .map((e, i) => (i === 1 ? { ...e, text: "Edited" } : e))
      .filter((_, i) => i !== 2),
  );
  assert.equal(edited.entries.length, 40);
  assert.match(edited.text, /2\. Edited/);
  assert.doesNotMatch(edited.text, /Achievement 1\n/);
});
test("local draft and cloud serialization preserve entries, composer text and evidence", () => {
  const form = createAssessmentForm(null, {
    userId: "employee",
    displayName: "Employee",
  });
  form.self.sections.IDP = appendAssessmentEntry({
    ...form.self.sections.IDP,
    draftText: "First",
  });
  form.self.sections.IDP.draftText = "Second, still composing";
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  };
  saveAssessmentDraft(storage, "draft", form);
  const restored = readAssessmentDraft(storage, "draft", form).form;
  assert.equal(restored.self.sections.IDP.entries.length, 1);
  assert.equal(restored.self.sections.IDP.draftText, "Second, still composing");
  const committed = commitAssessmentEntries(restored);
  assert.deepEqual(commitAssessmentEntries(committed), committed);
  const reopened = readSelfAssessment(serializeSelfAssessment(committed.self));
  assert.equal(reopened.sections.IDP.entries.length, 2);
  assert.match(reopened.sections.IDP.text, /Second, still composing/);
});
test("org filter keeps hierarchy ancestors and rejects cycles", () => {
  const members = [
    {
      employee_id: "director",
      manager_id: null,
      is_manager: true,
      account_status: "active",
    },
    {
      employee_id: "chief",
      manager_id: "director",
      is_manager: true,
      account_status: "active",
    },
    {
      employee_id: "member",
      manager_id: "chief",
      is_manager: false,
      account_status: "active",
    },
    {
      employee_id: "other",
      manager_id: "director",
      is_manager: true,
      account_status: "active",
    },
  ];
  assert.deepEqual(
    organizationTreeMembers(members, new Set(["member"])).map(
      (m) => m.employee_id,
    ),
    ["director", "chief", "member"],
  );
  assert.match(
    validateOrganizationManager(members, "director", "chief"),
    /循環/,
  );
  assert.match(
    validateOrganizationManager(members, "member", "member"),
    /主管/,
  );
  assert.equal(validateOrganizationManager(members, "member", "chief"), "");
});
