import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Download,
  RefreshCw,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { exportToCsv, exportToExcel } from "@/utils/apiExportUtils";

interface ApiDataTableProps {
  apiKey: string;
  endpoint: string;
  title: string;
}

interface ApiResponse {
  success: boolean;
  data: any[];
  message?: string;
}

export function ApiDataTable({ apiKey, endpoint, title }: ApiDataTableProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const baseUrl = window.location.origin;

  useEffect(() => {
    if (apiKey && endpoint) {
      fetchData();
    }
  }, [apiKey, endpoint]);

  const fetchData = async () => {
    if (!apiKey) {
      setError("請先輸入 API 金鑰");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${baseUrl}/api${endpoint}`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      const result: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `HTTP ${response.status}`);
      }

      if (result.success) {
        setData(result.data || []);
        toast.success("數據載入成功");
      } else {
        throw new Error(result.message || "API 返回錯誤");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      setError(errorMessage);
      toast.error(`載入失敗: ${errorMessage}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    let filtered = data;

    // 搜尋過濾
    if (searchTerm) {
      filtered = filtered.filter((item) =>
        Object.values(item).some((value) =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // 狀態過濾
    if (statusFilter !== "all") {
      filtered = filtered.filter((item) => {
        const status = item.status || item.debug_status || "";
        return status.toLowerCase() === statusFilter.toLowerCase();
      });
    }

    return filtered;
  }, [data, searchTerm, statusFilter]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  const getColumns = () => {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  };

  const formatCellValue = (value: any, key: string) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">-</span>;
    }

    if (typeof value === "boolean") {
      return <Badge variant={value ? "default" : "secondary"}>{value ? "是" : "否"}</Badge>;
    }

    if (key.includes("status") || key.includes("Status")) {
      const statusMap: Record<string, string> = {
        "open": "未解決",
        "closed": "已解決",
        "in_progress": "處理中",
        "Not Start": "未開始",
        "In Progress": "進行中",
        "Completed": "已完成",
        "active": "活躍",
        "inactive": "停用"
      };
      
      const displayValue = statusMap[value] || value;
      const variant = value === "open" || value === "Not Start" ? "secondary" : 
                    value === "closed" || value === "Completed" ? "default" : "outline";
      
      return <Badge variant={variant}>{displayValue}</Badge>;
    }

    if (key.includes("date") || key.includes("time") || key.includes("at")) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString("zh-TW");
        }
      } catch {
        // 如果不是日期格式，直接顯示原值
      }
    }

    if (typeof value === "object") {
      return <code className="text-xs bg-muted px-1 rounded">{JSON.stringify(value)}</code>;
    }

    return String(value);
  };

  const handleExportCsv = () => {
    exportToCsv(filteredData, `${title}_${new Date().toISOString().split('T')[0]}.csv`);
    toast.success("CSV 文件已下載");
  };

  const handleExportExcel = async () => {
    try {
      await exportToExcel(filteredData, `${title}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Excel 文件已下載");
    } catch (error) {
      toast.error("Excel 匯出失敗");
    }
  };

  const getStatusOptions = () => {
    const statuses = new Set<string>();
    data.forEach(item => {
      const status = item.status || item.debug_status;
      if (status) statuses.add(status);
    });
    return Array.from(statuses);
  };

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="text-center space-y-4">
            <div className="text-muted-foreground">載入數據時發生錯誤</div>
            <div className="text-sm text-destructive">{error}</div>
            <Button onClick={fetchData} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              重試
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TableIcon className="h-5 w-5" />
            {title} 數據表格
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExportCsv}
              variant="outline"
              size="sm"
              disabled={filteredData.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button
              onClick={handleExportExcel}
              variant="outline"
              size="sm"
              disabled={filteredData.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              重新載入
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 篩選控制 */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="搜尋數據..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="狀態篩選" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              {getStatusOptions().map(status => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(Number(value))}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 數據統計 */}
        <div className="text-sm text-muted-foreground">
          共 {filteredData.length} 筆數據 {data.length !== filteredData.length && `(從 ${data.length} 筆中篩選)`}
        </div>

        {/* 數據表格 */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            載入中...
          </div>
        ) : paginatedData.length > 0 ? (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    {getColumns().map((column) => (
                      <TableHead key={column} className="whitespace-nowrap">
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((row, index) => (
                    <TableRow key={index}>
                      {getColumns().map((column) => (
                        <TableCell key={column} className="max-w-xs truncate">
                          {formatCellValue(row[column], column)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* 分頁控制 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  第 {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredData.length)} 筆，
                  共 {filteredData.length} 筆
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一頁
                  </Button>
                  <span className="text-sm">
                    第 {currentPage} / {totalPages} 頁
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    下一頁
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {data.length === 0 ? "暫無數據" : "沒有符合篩選條件的數據"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}