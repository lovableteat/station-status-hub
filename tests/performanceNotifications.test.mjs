import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPerformanceReturnNotification,
  PERFORMANCE_RETURN_NOTIFICATION_TYPE,
} from "../src/components/performance/performanceNotifications.mjs";

test("a returned review notifies only its employee and opens that self review", () => {
  const notification = buildPerformanceReturnNotification({
    review: {
      id: "4c371c84-9033-4fe8-a15e-7d734e1d81ef",
      cycleId: "2026-q3",
      employeeId: "employee-legacy-id",
      employeeName: "Employee A",
      score: 91,
      managerFeedback: "private manager payload",
    },
    recipientId: "b26f6bf6-37cf-40dc-a9c2-477f0146242f",
    senderId: "3c72eb5c-540a-4fa4-aa94-3df4756f2b80",
    senderName: "Section Chief",
    currentUrl:
      "https://example.test/station-status-hub/?project=rd2&workspace=performance#/?performanceTab=manager",
  });

  assert.equal(
    notification.recipient_id,
    "b26f6bf6-37cf-40dc-a9c2-477f0146242f",
  );
  assert.equal(
    notification.notification_type,
    PERFORMANCE_RETURN_NOTIFICATION_TYPE,
  );
  const url = new URL(notification.action_url);
  assert.equal(url.searchParams.get("workspace"), "performance");
  assert.match(url.hash, /performanceTab=self/);
  assert.match(url.hash, /performanceCycle=2026-q3/);
  assert.match(url.hash, /performanceReview=4c371c84-9033-4fe8-a15e-7d734e1d81ef/);
});

test("return notifications never disclose manager scores or private score payloads", () => {
  const notification = buildPerformanceReturnNotification({
    review: {
      id: "4c371c84-9033-4fe8-a15e-7d734e1d81ef",
      cycleId: "2026-q3",
      employeeName: "Employee A",
      score: 99,
      managerFeedback: "主管評分 99 分",
    },
    recipientId: "b26f6bf6-37cf-40dc-a9c2-477f0146242f",
    senderId: "3c72eb5c-540a-4fa4-aa94-3df4756f2b80",
    senderName: "Section Chief",
    currentUrl: "https://example.test/station-status-hub/",
  });

  const serialized = JSON.stringify(notification);
  assert.doesNotMatch(serialized, /99|score|主管評分/);
  assert.match(notification.message, /退回你的本期自評/);
});
