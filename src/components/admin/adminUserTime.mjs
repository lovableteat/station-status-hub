export function formatAdminUserTimestamp(value, fallback) {
  if (typeof value !== "string" || !value) return fallback;

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})(?:T|\s)/.exec(value);
  if (!isoDate) return fallback;

  const [, yearText, monthText, dayText] = isoDate;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue]),
  );

  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}`;
}
