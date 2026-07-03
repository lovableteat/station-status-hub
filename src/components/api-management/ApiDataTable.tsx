import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportToCsv, exportToExcel } from "@/utils/apiExportUtils";

interface ApiDataTableProps {
  apiKey: string;
  requestUrl: string;
  title: string;
}

type DataRow = Record<string, unknown>;

interface WrappedApiResponse {
  success?: boolean;
  data?: unknown;
  total?: number;
  message?: string;
  error?: string;
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDateMaybe(value: unknown) {
  if (typeof value !== "string") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("zh-TW");
}

function renderStatusBadge(value: string) {
  const normalized = value.toLowerCase();

  if (
    normalized.includes("complete") ||
    normalized.includes("closed") ||
    normalized.includes("done") ||
    normalized.includes("resolved")
  ) {
    return <Badge className="bg-violet-500/15 text-violet-100">{value}</Badge>;
  }

  if (
    normalized.includes("progress") ||
    normalized.includes("active") ||
    normalized.includes("running")
  ) {
    return <Badge className="bg-amber-500/15 text-amber-100">{value}</Badge>;
  }

  if (normalized.includes("open") || normalized.includes("new")) {
    return <Badge className="bg-sky-500/15 text-sky-100">{value}</Badge>;
  }

  return <Badge className="bg-slate-500/20 text-slate-200">{value}</Badge>;
}

function formatCellValue(value: unknown, key: string) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-500">-</span>;
  }

  if (typeof value === "boolean") {
    return (
      <Badge
        className={
          value ? "bg-emerald-500/15 text-emerald-100" : "bg-slate-500/20 text-slate-200"
        }
      >
        {value ? "是" : "否"}
      </Badge>
    );
  }

  if (typeof value === "string" && key.toLowerCase().includes("status")) {
    return renderStatusBadge(value);
  }

  if (
    key.toLowerCase().includes("date") ||
    key.toLowerCase().includes("time") ||
    key.toLowerCase().endsWith("_at")
  ) {
    const formattedDate = formatDateMaybe(value);
    if (formattedDate) return formattedDate;
  }

  if (typeof value === "object") {
    return (
      <code className="rounded bg-slate-900/60 px-1.5 py-0.5 text-xs text-cyan-100">
        {JSON.stringify(value)}
      </code>
    );
  }

  return String(value);
}

function isWrappedApiResponse(value: unknown): value is WrappedApiResponse {
  return typeof value === "object" && value !== null && ("data" in value || "success" in value);
}

export function ApiDataTable({ apiKey, requestUrl, title }: ApiDataTableProps) {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [objectPayload, setObjectPayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = async () => {
    if (!apiKey.trim()) {
      setError("請先輸入 API 金鑰。");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(requestUrl, {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey.trim(),
        },
      });

      const result = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          isWrappedApiResponse(result) && (result.error || result.message)
            ? String(result.error || result.message)
            : `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const payload = isWrappedApiResponse(result) ? result.data ?? result : result;

      if (Array.isArray(payload)) {
        setRows(payload.filter((item): item is DataRow => typeof item === "object" && item !== null));
        setObjectPayload(null);
      } else {
        setRows([]);
        setObjectPayload(payload);
      }

      setCurrentPage(1);
      toast.success("API 資料讀取完成。");
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "資料讀取失敗";
      setRows([]);
      setObjectPayload(null);
      setError(message);
      toast.error(`讀取失敗：${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [requestUrl]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];

    const fieldSet = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row).forEach((field) => fieldSet.add(field));
    });

    return Array.from(fieldSet);
  }, [rows]);

  const statusField = useMemo(() => {
    return (
      columns.find((column) => column.toLowerCase() === "status") ??
      columns.find((column) => column.toLowerCase().includes("status")) ??
      null
    );
  }, [columns]);

  const filteredRows = useMemo(() => {
    let nextRows = rows;

    if (searchTerm.trim()) {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      nextRows = nextRows.filter((row) =>
        Object.values(row).some((value) =>
          stringifyValue(value).toLowerCase().includes(normalizedSearch),
        ),
      );
    }

    if (statusFilter !== "all" && statusField) {
      nextRows = nextRows.filter((row) => {
        const value = row[statusField];
        return stringifyValue(value).toLowerCase() === statusFilter.toLowerCase();
      });
    }

    return nextRows;
  }, [rows, searchTerm, statusField, statusFilter]);

  const pageSizeNumber = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSizeNumber));

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSizeNumber;
    return filteredRows.slice(startIndex, startIndex + pageSizeNumber);
  }, [currentPage, filteredRows, pageSizeNumber]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, pageSize, requestUrl]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const statusOptions = useMemo(() => {
    if (!statusField) return [];

    const values = new Set<string>();
    rows.forEach((row) => {
      const statusValue = row[statusField];
      if (statusValue !== null && statusValue !== undefined && statusValue !== "") {
        values.add(String(statusValue));
      }
    });

    return Array.from(values);
  }, [rows, statusField]);

  const handleExportCsv = () => {
    if (filteredRows.length === 0) return;
    exportToCsv(filteredRows, `${title}_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success("CSV 已匯出。");
  };

  const handleExportExcel = async () => {
    if (filteredRows.length === 0) return;

    try {
      await exportToExcel(filteredRows, `${title}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Excel 已匯出。");
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "Excel 匯出失敗");
    }
  };

  if (error) {
    return (
      <Card className="border-blue-400/15 bg-[#10192e]">
        <CardContent className="py-12 text-center">
          <p className="text-lg font-bold text-slate-100">API 讀取失敗</p>
          <p className="mt-2 text-sm text-rose-200">{error}</p>
          <Button
            type="button"
            onClick={() => void fetchData()}
            variant="outline"
            className="mt-5 border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            重新讀取
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-400/15 bg-[#10192e]">
      <CardHeader className="gap-4 border-b border-blue-400/10 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
              <Table2 className="h-6 w-6 text-cyan-300" />
              {title}
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              這裡顯示正式 API 的實際回傳內容，你可以直接搜尋、篩狀態、分頁或匯出目前結果。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleExportCsv}
              variant="outline"
              disabled={filteredRows.length === 0}
              className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button
              type="button"
              onClick={() => void handleExportExcel()}
              variant="outline"
              disabled={filteredRows.length === 0}
              className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
            >
              <Download className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button
              type="button"
              onClick={() => void fetchData()}
              disabled={loading}
              className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              重新讀取
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-blue-400/15 bg-[#0b1423] px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
              Request URL
            </p>
            <p className="mt-2 break-all text-sm text-cyan-100">{requestUrl}</p>
          </div>
          <div className="rounded-2xl border border-blue-400/15 bg-[#0b1423] px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Rows</p>
            <p className="mt-2 text-2xl font-black text-slate-50">{filteredRows.length}</p>
          </div>
          <div className="rounded-2xl border border-blue-400/15 bg-[#0b1423] px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Mode</p>
            <p className="mt-2 text-sm font-bold text-slate-50">
              {rows.length > 0 ? "表格模式" : objectPayload ? "JSON 模式" : "等待資料"}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        {rows.length > 0 && (
          <>
            <div className="flex flex-col gap-3 xl:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜尋任意欄位內容"
                  className="h-10 border-blue-400/20 bg-[#0b1423] pl-10 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-full border-blue-400/20 bg-[#0b1423] text-slate-100 xl:w-52">
                  <SelectValue placeholder="篩選狀態" />
                </SelectTrigger>
                <SelectContent className="border-blue-400/20 bg-[#10192e] text-slate-100">
                  <SelectItem value="all">全部狀態</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger className="h-10 w-full border-blue-400/20 bg-[#0b1423] text-slate-100 xl:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-blue-400/20 bg-[#10192e] text-slate-100">
                  <SelectItem value="10">10 筆 / 頁</SelectItem>
                  <SelectItem value="25">25 筆 / 頁</SelectItem>
                  <SelectItem value="50">50 筆 / 頁</SelectItem>
                  <SelectItem value="100">100 筆 / 頁</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-hidden rounded-3xl border border-blue-400/12">
              <div className="max-h-[560px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-[#162440]">
                    <TableRow className="border-blue-400/10 hover:bg-transparent">
                      {columns.map((column) => (
                        <TableHead
                          key={column}
                          className="whitespace-nowrap border-r border-blue-400/10 bg-[#284777]/95 text-xs font-black uppercase tracking-[0.14em] text-slate-200 last:border-r-0"
                        >
                          {column}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((row, rowIndex) => (
                      <TableRow
                        key={`row-${rowIndex}`}
                        className="border-blue-400/8 bg-[#0f2333] hover:bg-[#143048]"
                      >
                        {columns.map((column) => (
                          <TableCell
                            key={`${rowIndex}-${column}`}
                            className="min-w-[180px] border-r border-blue-400/8 align-top text-sm text-slate-100 last:border-r-0"
                          >
                            <div className="max-w-[360px] break-words leading-6">
                              {formatCellValue(row[column], column)}
                            </div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-slate-400">
                顯示第 {(currentPage - 1) * pageSizeNumber + 1} 到{" "}
                {Math.min(currentPage * pageSizeNumber, filteredRows.length)} 筆，共{" "}
                {filteredRows.length} 筆
              </p>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  上一頁
                </Button>
                <div className="rounded-xl border border-blue-400/15 bg-[#0b1423] px-3 py-2 text-sm font-bold text-slate-100">
                  {currentPage} / {totalPages}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
                >
                  下一頁
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        {rows.length === 0 && objectPayload && (
          <div className="overflow-hidden rounded-3xl border border-blue-400/12 bg-[#0b1423]">
            <div className="border-b border-blue-400/10 px-4 py-3 text-sm font-bold text-slate-200">
              JSON 回應
            </div>
            <pre className="max-h-[560px] overflow-auto p-4 text-sm leading-6 text-cyan-100">
              {JSON.stringify(objectPayload, null, 2)}
            </pre>
          </div>
        )}

        {rows.length === 0 && !objectPayload && !loading && !error && (
          <div className="rounded-3xl border border-blue-400/12 bg-[#0b1423] px-6 py-10 text-center">
            <p className="text-lg font-bold text-slate-100">目前沒有可顯示資料</p>
            <p className="mt-2 text-sm text-slate-400">請重新讀取或改用其他端點測試。</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
