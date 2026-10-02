export function isValidDuration(value: number, minimum = 0): boolean {
  return Number.isFinite(value) && value >= minimum;
}

/** BOM Qty is usage per product, not a stock adjustment. Preserve legacy text
 * placeholders (AR, -, etc.) and fractional usage; reject negative numeric input. */
export function isValidBomUsage(value: string | number): boolean {
  const text = String(value).trim();
  if (!text) return true;
  const numeric = Number(text);
  return Number.isNaN(numeric) || (Number.isFinite(numeric) && numeric >= 0);
}
