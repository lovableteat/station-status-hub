import assert from "node:assert/strict";
import test from "node:test";

import {
  directMessageMatchesQuery,
  formatDirectMessageDay,
  formatDirectMessageReply,
  getDirectMessageDisplayPreview,
  parseDirectMessageBody,
  sortDirectThreads,
} from "../src/components/collaboration/directMessageExperience.mjs";

test("direct message replies round-trip as readable fallback text", () => {
  const stored = formatDirectMessageReply("收到，我來處理", {
    author: "Ben",
    excerpt: "請確認 U1 的座標",
  });
  assert.equal(stored, "↪ 回覆 Ben：「請確認 U1 的座標」\n收到，我來處理");
  assert.deepEqual(parseDirectMessageBody(stored), {
    body: "收到，我來處理",
    reply: { author: "Ben", excerpt: "請確認 U1 的座標" },
  });
  assert.equal(getDirectMessageDisplayPreview(stored), "收到，我來處理");
});

test("message search includes reply excerpts and attachment names", () => {
  const message = {
    body: formatDirectMessageReply("已更新", { author: "Mistin", excerpt: "PCB 尺寸" }),
    attachments: [{ fileName: "board-final.png" }],
  };
  assert.equal(directMessageMatchesQuery(message, "尺寸"), true);
  assert.equal(directMessageMatchesQuery(message, "final"), true);
  assert.equal(directMessageMatchesQuery(message, "不存在"), false);
});

test("thread sorting keeps pinned and unread conversations ahead of recent read conversations", () => {
  const threads = [
    { threadId: "read", unreadCount: 0, lastMessageAt: "2026-08-13T09:00:00Z" },
    { threadId: "unread", unreadCount: 2, lastMessageAt: "2026-08-12T09:00:00Z" },
    { threadId: "pinned", unreadCount: 0, lastMessageAt: "2026-08-11T09:00:00Z" },
  ];
  assert.deepEqual(
    sortDirectThreads(threads, new Set(["pinned"])).map((thread) => thread.threadId),
    ["pinned", "unread", "read"],
  );
});

test("message day labels distinguish today, yesterday and older dates", () => {
  const now = new Date("2026-08-13T12:00:00+08:00");
  assert.equal(formatDirectMessageDay("2026-08-13T08:00:00+08:00", now), "今天");
  assert.equal(formatDirectMessageDay("2026-08-12T08:00:00+08:00", now), "昨天");
  assert.match(formatDirectMessageDay("2026-08-10T08:00:00+08:00", now), /8月10日/);
});
