import type { TestPlanFileRecord } from "../types";

const EDITABLE_SPREADSHEET_EXTENSIONS = new Set([
  "csv",
  "ods",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
]);

export function isEditableSpreadsheet(file: TestPlanFileRecord): boolean {
  return file.category === "spreadsheet"
    && EDITABLE_SPREADSHEET_EXTENSIONS.has(file.extension.toLowerCase());
}
