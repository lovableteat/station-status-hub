const REPLY_PREFIX = "↪ 回覆 ";
const REPLY_SEPARATOR = "：「";
const REPLY_SUFFIX = "」";

function cleanInlineText(value, maximumLength) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

export function formatDirectMessageReply(body, reply) {
  const messageBody = String(body ?? "").trim();
  if (!reply) return messageBody;
  const author = cleanInlineText(reply.author, 40).replaceAll(REPLY_SEPARATOR, "：");
  const excerpt = cleanInlineText(reply.excerpt, 96).replaceAll(REPLY_SUFFIX, "》");
  if (!author || !excerpt) return messageBody;
  return `${REPLY_PREFIX}${author}${REPLY_SEPARATOR}${excerpt}${REPLY_SUFFIX}\n${messageBody}`;
}

export function parseDirectMessageBody(rawBody) {
  const value = String(rawBody ?? "");
  if (!value.startsWith(REPLY_PREFIX)) return { body: value, reply: null };
  const firstLineEnd = value.indexOf("\n");
  const firstLine = firstLineEnd >= 0 ? value.slice(0, firstLineEnd) : value;
  const separatorIndex = firstLine.indexOf(REPLY_SEPARATOR, REPLY_PREFIX.length);
  if (separatorIndex < 0 || !firstLine.endsWith(REPLY_SUFFIX)) {
    return { body: value, reply: null };
  }
  const author = firstLine.slice(REPLY_PREFIX.length, separatorIndex).trim();
  const excerpt = firstLine.slice(separatorIndex + REPLY_SEPARATOR.length, -REPLY_SUFFIX.length).trim();
  if (!author || !excerpt) return { body: value, reply: null };
  return {
    body: firstLineEnd >= 0 ? value.slice(firstLineEnd + 1) : "",
    reply: { author, excerpt },
  };
}

export function getDirectMessageDisplayPreview(rawBody, fallback = "開始一段新對話") {
  const parsed = parseDirectMessageBody(rawBody);
  return cleanInlineText(parsed.body || parsed.reply?.excerpt || fallback, 90) || fallback;
}

export function directMessageMatchesQuery(message, query) {
  const normalizedQuery = cleanInlineText(query, 200).toLocaleLowerCase("zh-TW");
  if (!normalizedQuery) return true;
  const parsed = parseDirectMessageBody(message.body);
  const searchable = [
    parsed.body,
    parsed.reply?.author,
    parsed.reply?.excerpt,
    ...(message.attachments ?? []).map((attachment) => attachment.fileName),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("zh-TW");
  return searchable.includes(normalizedQuery);
}

export function sortDirectThreads(threads, pinnedThreadIds) {
  const pinned = pinnedThreadIds instanceof Set ? pinnedThreadIds : new Set(pinnedThreadIds ?? []);
  return [...threads].sort((left, right) => {
    const pinnedDifference = Number(pinned.has(right.threadId)) - Number(pinned.has(left.threadId));
    if (pinnedDifference) return pinnedDifference;
    const unreadDifference = Number(right.unreadCount > 0) - Number(left.unreadCount > 0);
    if (unreadDifference) return unreadDifference;
    const rightTime = right.lastMessageAt ? Date.parse(right.lastMessageAt) : 0;
    const leftTime = left.lastMessageAt ? Date.parse(left.lastMessageAt) : 0;
    return rightTime - leftTime || left.threadId.localeCompare(right.threadId);
  });
}

export function formatDirectMessageDay(value, now = new Date()) {
  const date = new Date(value);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  return date.toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" });
}
