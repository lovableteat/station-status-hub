import * as XLSX from "xlsx";

type ExportRow = Record<string, unknown>;

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function exportToCsv(data: ExportRow[], filename: string) {
  if (!data || data.length === 0) {
    throw new Error("沒有可匯出的資料。");
  }

  const headers = Object.keys(data[0]);

  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = normalizeValue(row[header]);
          if (value.includes(",") || value.includes('"') || value.includes("\n")) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export async function exportToExcel(data: ExportRow[], filename: string) {
  if (!data || data.length === 0) {
    throw new Error("沒有可匯出的資料。");
  }

  try {
    const workbook = XLSX.utils.book_new();
    const processedRows = data.map((row) => {
      const normalizedRow: Record<string, string> = {};

      Object.entries(row).forEach(([key, value]) => {
        normalizedRow[key] = normalizeValue(value);
      });

      return normalizedRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(processedRows);
    const headers = Object.keys(processedRows[0]);

    worksheet["!cols"] = headers.map((header) => {
      const maxLength = Math.max(
        header.length,
        ...processedRows.map((row) => row[header]?.length ?? 0),
      );

      return {
        wch: Math.min(Math.max(maxLength + 2, 12), 48),
      };
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error("Excel export failed", error);
    throw new Error("Excel 匯出失敗。");
  }
}

export function formatDisplayValue(value: unknown, key: string) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  const loweredKey = key.toLowerCase();
  if (
    loweredKey.includes("date") ||
    loweredKey.includes("time") ||
    loweredKey.endsWith("_at")
  ) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("zh-TW");
    }
  }

  return normalizeValue(value);
}

export function getStatusDisplayText(status: string) {
  const statusMap: Record<string, string> = {
    open: "開啟",
    closed: "關閉",
    in_progress: "處理中",
    active: "啟用",
    inactive: "停用",
    completed: "已完成",
  };

  return statusMap[status] ?? status;
}
