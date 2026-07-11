import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ExportSystem {
  current_station?: string | null;
  id: string;
  overall_progress?: number | null;
  system_name: string;
}

interface ExportStation {
  id: string;
  station_name: string;
  station_order: number;
}

interface ExportProgress {
  station_id: string;
  status: string;
  system_id: string;
}

interface ExportManagerProps {
  progress: ExportProgress[];
  stations: ExportStation[];
  systems: ExportSystem[];
}

interface ReportRow {
  [column: string]: string;
  機台編號: string;
  當前站點: string;
  狀態: string;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function ExportManager({ systems, stations, progress }: ExportManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("excel");
  const [exportScope, setExportScope] = useState("all");
  const { toast } = useToast();
  const orderedStations = [...stations].sort(
    (left, right) => left.station_order - right.station_order
  );
  const reportColumns = [
    "機台編號",
    "當前站點",
    "狀態",
    ...orderedStations.map((station) => station.station_name),
  ];

  const generateReportData = (): ReportRow[] => {
    let filteredSystems = systems;

    if (exportScope === "completed") {
      filteredSystems = systems.filter((system) => system.overall_progress === 100);
    } else if (exportScope === "ongoing") {
      filteredSystems = systems.filter(
        (system) => (system.overall_progress ?? 0) > 0 && (system.overall_progress ?? 0) < 100
      );
    } else if (exportScope === "pending") {
      filteredSystems = systems.filter((system) => (system.overall_progress ?? 0) === 0);
    }

    return filteredSystems.map((system) => {
      const row: ReportRow = {
        機台編號: system.system_name,
        當前站點: system.current_station || orderedStations[0]?.station_name || "未開始",
        狀態:
          system.overall_progress === 100
            ? "已完成"
            : (system.overall_progress ?? 0) > 0
              ? "進行中"
              : "未開始",
      };

      orderedStations.forEach((station) => {
        const stationProgress = progress.filter(
          (entry) => entry.system_id === system.id && entry.station_id === station.id
        );
        const completed = stationProgress.filter((entry) => entry.status === "Done").length;
        row[station.station_name] = stationProgress.length
          ? `${Math.round((completed / stationProgress.length) * 100)}%`
          : "0%";
      });
      return row;
    });
  };

  const downloadBlob = (content: string, type: string, fileName: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsExcel = (data: ReportRow[]) => {
    const csvRows = [
      reportColumns.map(csvCell).join(","),
      ...data.map((row) => reportColumns.map((column) => csvCell(row[column] || "")).join(",")),
    ];
    downloadBlob(
      `\uFEFF${csvRows.join("\n")}`,
      "text/csv;charset=utf-8;",
      `L10_測試追蹤報表_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const downloadAsText = (data: ReportRow[]) => {
    const lines = [
      "L10 測試追蹤報表",
      `匯出時間: ${new Date().toLocaleString("zh-TW")}`,
      "",
      reportColumns.join("\t"),
      ...data.map((row) => reportColumns.map((column) => row[column] || "").join("\t")),
    ];
    downloadBlob(
      lines.join("\n"),
      "text/plain;charset=utf-8;",
      `L10_測試追蹤報表_${new Date().toISOString().split("T")[0]}.txt`
    );
  };

  const generateReport = async () => {
    try {
      await supabase.from("test_export_logs").insert({
        export_type: exportFormat,
        file_name: `test_report_${new Date().toISOString().split("T")[0]}.${exportFormat}`,
        exported_by: "system_user",
        export_params: { scope: exportScope, total_systems: systems.length },
      });

      const reportData = generateReportData();
      if (exportFormat === "excel") downloadAsExcel(reportData);
      else downloadAsText(reportData);

      setIsDialogOpen(false);
      toast({
        title: "匯出成功",
        description: `已匯出 ${reportData.length} 台機台、${orderedStations.length} 個站點。`,
      });
    } catch (error) {
      console.error("Failed to export tracker report:", error);
      toast({
        title: "匯出失敗",
        description: "無法匯出報表，請稍後再試",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 rounded-lg">
          <Download className="mr-2 h-4 w-4" />匯出報表
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>匯出 L10 測試追蹤報表</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>匯出格式</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="excel"><span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Excel (CSV)</span></SelectItem>
                <SelectItem value="text"><span className="flex items-center gap-2"><FileText className="h-4 w-4" />文字報表</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>匯出範圍</Label>
            <Select value={exportScope} onValueChange={setExportScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部機台</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="ongoing">進行中</SelectItem>
                <SelectItem value="pending">未開始</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3 text-sm text-[#a9c0d1]">
            報表會依目前流程動態包含 {orderedStations.length} 個站點，不再限制 Station 0–3。
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
            <Button onClick={generateReport}><Download className="mr-2 h-4 w-4" />開始匯出</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
