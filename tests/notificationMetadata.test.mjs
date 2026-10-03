import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNotificationMetadata } from "../src/lib/notificationMetadata.ts";

test("notifications tolerate scalar, array and absent API metadata without dropping the notification", () => {
  for (const metadata of [null, undefined, "legacy", 3, true, ["invalid-object"]]) {
    const row = { id: "fixture", title: "Alert", metadata };
    const normalized = normalizeNotificationMetadata(row);
    assert.equal(normalized.id, row.id);
    assert.equal(normalized.title, row.title);
    assert.equal(normalized.metadata.issue_title, undefined);
    assert.deepEqual(Object.keys(normalized.metadata).filter(key => key !== "issue_title"), []);
  }
});

test("notification object metadata preserves references and only displays a textual issue title", () => {
  const metadata = { issue_title: "Power failure", systemId: "rack-1", nested: { keep: true } };
  const normalized = normalizeNotificationMetadata({ id: "fixture", metadata });
  assert.deepEqual(normalized.metadata, metadata);
  assert.deepEqual(metadata, { issue_title: "Power failure", systemId: "rack-1", nested: { keep: true } });
  assert.equal(normalizeNotificationMetadata({ metadata: { issue_title: { malformed: true }, systemId: "rack-1" } }).metadata.issue_title, undefined);
});
