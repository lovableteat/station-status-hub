import {
  type ChangeEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  AlertTriangle,
  Boxes,
  Database,
  Download,
  FileSpreadsheet,
  Search,
} from "lucide-react";

import seedPayload from "@/data/materialRequestSeed.json";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { exportToCsv } from "@/utils/apiExportUtils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  MaterialDataset,
  MaterialGroup,
  MaterialRecord,
  MaterialWorkbookPayload,
  buildMaterialDataset,
  getActionKind,
  getActionLabel,
  parseMaterialWorkbookFile,
} from "./materialRequestUtils";

type ViewMode = "queue" | "groups" | "raw";
type RemarkFilter = "all" | "pending" | "ok" | "unlock";

const seedDataset = buildMaterialDataset(seedPayload as MaterialWorkbookPayload);

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionBadgeClass(actionKind: ReturnType<typeof getActionKind>) {
  switch (actionKind) {
    case "pending-00-part-symbol":
      return "border-amber-300/35 bg-amber-400/12 text-amber-100";
    case "pending-part-symbol":
      return "border-orange-300/35 bg-orange-400/12 text-orange-100";
    case "pending-unlock":
      return "border-red-300/35 bg-red-400/12 text-red-100";
    case "pending-symbol":
      return "border-violet-300/35 bg-violet-400/12 text-violet-100";
    case "ok":
      return "border-emerald-300/35 bg-emerald-400/12 text-emerald-100";
    default:
      return "border-border/80 bg-secondary/70 text-muted-foreground";
  }
}

function getSourcingBadgeClass(status: string) {
  switch (status) {
    case "Approved":
      return "border-emerald-300/35 bg-emerald-400/12 text-emerald-100";
    case "Obsolete":
      return "border-amber-300/35 bg-amber-400/12 text-amber-100";
    case "Disqualified":
      return "border-red-300/35 bg-red-400/12 text-red-100";
    case "Qualification Pending":
      return "border-sky-300/35 bg-sky-400/12 text-sky-100";
    case "NRND":
      return "border-fuchsia-300/35 bg-fuchsia-400/12 text-fuchsia-100";
    default:
      return "border-border/80 bg-secondary/70 text-muted-foreground";
  }
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof Database;
}) {
  return (
    <Card className="border-primary/10 bg-card/72">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/80">
            {label}
          </p>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function GroupListItem({
  group,
  selected,
  onClick,
}: {
  group: MaterialGroup;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition-all duration-200",
        selected
          ? "border-primary/40 bg-primary/12 shadow-[0_20px_45px_-34px_hsl(var(--primary)/0.75)]"
          : "border-primary/10 bg-background/35 hover:border-primary/30 hover:bg-primary/6"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-semibold text-primary">
              {group.displayRef}
            </p>
            {group.pendingCount > 0 ? (
              <Badge
                variant="outline"
                className="border-amber-300/35 bg-amber-400/12 text-amber-100"
              >
                待申請 {group.pendingCount}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-300/35 bg-emerald-400/12 text-emerald-100"
              >
                已建檔
              </Badge>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
            {group.name}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="outline" className="bg-secondary/60">
          替代料 {group.totalCount}
        </Badge>
        <Badge variant="outline" className="bg-secondary/60">
          Approved {group.approvedCount}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            "bg-secondary/60",
            group.riskCount > 0 && "border-amber-300/35 text-amber-100"
          )}
        >
          風險 {group.riskCount}
        </Badge>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        {group.assemblyName && <p>模組: {group.assemblyName}</p>}
        {group.footprint && <p>Footprint: {group.footprint}</p>}
      </div>
    </button>
  );
}

function MaterialRecordCard({ record }: { record: MaterialRecord }) {
  return (
    <div className="rounded-2xl border border-primary/10 bg-background/40 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("font-medium", getActionBadgeClass(record.actionKind))}
            >
              {getActionLabel(record.actionKind)}
            </Badge>
            <Badge
              variant="outline"
              className={cn("font-medium", getSourcingBadgeClass(record.sourcingStatus))}
            >
              {record.sourcingStatus || "未標記"}
            </Badge>
          </div>
          <p className="mt-3 font-mono text-sm font-semibold text-foreground">
            {record.mpnCandidates.join(" / ") || "-"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {record.manufacturer || "未填寫廠商"}
          </p>
        </div>

        <div className="rounded-2xl border border-primary/10 bg-card/55 px-4 py-3 text-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
            內部料號
          </p>
          <p className="mt-2 font-mono text-foreground">
            {record.partNumber || "尚未建立"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {record.partName || record.partSpec || "等待補齊料號資訊"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-primary/10 bg-card/45 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
            Ref Group
          </p>
          <p className="mt-1 font-mono text-foreground">{record.displayRef}</p>
        </div>
        <div className="rounded-xl border border-primary/10 bg-card/45 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
            模組
          </p>
          <p className="mt-1 text-foreground">{record.assemblyName || "-"}</p>
        </div>
        <div className="rounded-xl border border-primary/10 bg-card/45 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
            Symbol / Footprint
          </p>
          <p className="mt-1 text-foreground">
            {record.schematicPart || "-"} / {record.pcbFootprint || "-"}
          </p>
        </div>
        <div className="rounded-xl border border-primary/10 bg-card/45 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
            備註
          </p>
          <p className="mt-1 text-foreground">{record.remark || "-"}</p>
        </div>
      </div>
    </div>
  );
}

export function MaterialRequestPage() {
  const [dataset, setDataset] = useState<MaterialDataset>(seedDataset);
  const [viewMode, setViewMode] = useState<ViewMode>("queue");
  const [searchTerm, setSearchTerm] = useState("");
  const [remarkFilter, setRemarkFilter] = useState<RemarkFilter>("pending");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [isImporting, startImportTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const deferredSearchTerm = useDeferredValue(searchTerm);

  const filteredRecords = useMemo(() => {
    const keyword = deferredSearchTerm.trim().toLowerCase();

    return dataset.records.filter((record) => {
      const matchesSearch =
        keyword.length === 0 || record.searchText.includes(keyword);

      const matchesRemark =
        remarkFilter === "all"
          ? true
          : remarkFilter === "pending"
            ? record.isPending
            : remarkFilter === "ok"
              ? record.isReady
              : record.actionKind === "pending-unlock";

      const matchesStatus =
        statusFilter === "all" || record.sourcingStatus === statusFilter;

      return matchesSearch && matchesRemark && matchesStatus;
    });
  }, [dataset.records, deferredSearchTerm, remarkFilter, statusFilter]);

  const filteredGroups = useMemo(() => {
    const visibleKeys = new Set(filteredRecords.map((record) => record.groupKey));
    const visibleGroups = dataset.groups.filter((group) => visibleKeys.has(group.key));

    if (viewMode === "queue") {
      return visibleGroups.filter((group) => group.pendingCount > 0);
    }

    return visibleGroups;
  }, [dataset.groups, filteredRecords, viewMode]);

  useEffect(() => {
    if (!filteredGroups.length) {
      if (selectedGroupKey) {
        setSelectedGroupKey("");
      }
      return;
    }

    if (!filteredGroups.some((group) => group.key === selectedGroupKey)) {
      setSelectedGroupKey(filteredGroups[0].key);
    }
  }, [filteredGroups, selectedGroupKey]);

  const selectedGroup = useMemo(
    () => filteredGroups.find((group) => group.key === selectedGroupKey) ?? null,
    [filteredGroups, selectedGroupKey]
  );

  const selectedPendingRecords = selectedGroup?.records.filter((record) => record.isPending) ?? [];
  const selectedReadyRecords = selectedGroup?.records.filter((record) => record.isReady) ?? [];
  const selectedOtherRecords =
    selectedGroup?.records.filter((record) => !record.isPending && !record.isReady) ?? [];

  const visibleRawRecords = filteredRecords.slice(0, 250);

  const summaryCards = [
    {
      label: "Groups",
      value: `${dataset.stats.totalGroups}`,
      description: "以 Ref Group + 料件名稱為一組，先看整組再看替代料。",
      icon: Boxes,
    },
    {
      label: "Pending",
      value: `${dataset.stats.pendingRecords}`,
      description: "所有帶有「需申請」標記的替代料，集中進待處理佇列。",
      icon: AlertTriangle,
    },
    {
      label: "Ready",
      value: `${dataset.stats.readyRecords}`,
      description: "已經有內部料號或備註為 OK，可直接回頭比對。",
      icon: FileSpreadsheet,
    },
    {
      label: "Rows",
      value: `${dataset.stats.totalRecords}`,
      description: "保留原始明細，必要時可以切回表格直接查單筆資料。",
      icon: Database,
    },
  ] satisfies Array<{
    label: string;
    value: string;
    description: string;
    icon: typeof Database;
  }>;

  const handleWorkbookImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const payload = await parseMaterialWorkbookFile(file);
      startImportTransition(() => {
        setDataset(buildMaterialDataset(payload));
        setSelectedGroupKey("");
      });

      toast({
        title: "Excel 已匯入",
        description: `已從 ${file.name} 讀入 ${payload.recordCount} 筆料件明細。`,
      });
    } catch (error) {
      toast({
        title: "Excel 讀取失敗",
        description:
          error instanceof Error
            ? error.message
            : "請確認檔案欄位格式是否與原始 CARRIER 表一致。",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleExportPendingCsv = () => {
    const pendingRecords = filteredRecords
      .filter((record) => record.isPending)
      .map((record) => ({
        ref_group: record.displayRef,
        assembly_name: record.assemblyName,
        material_name: record.name,
        manufacturer: record.manufacturer,
        manufacturer_part_number: record.mpnCandidates.join(" / "),
        sourcing_status: record.sourcingStatus,
        request_action: getActionLabel(record.actionKind),
        internal_part_number: record.partNumber,
        internal_part_name: record.partName,
        footprint: record.pcbFootprint,
      }));

    if (!pendingRecords.length) {
      toast({
        title: "目前沒有可匯出的待申請資料",
        description: "調整篩選條件後再試一次。",
        variant: "destructive",
      });
      return;
    }

    exportToCsv(
      pendingRecords,
      `material-request-queue-${new Date().toISOString().slice(0, 10)}.csv`
    );

    toast({
      title: "CSV 已下載",
      description: `已匯出 ${pendingRecords.length} 筆待申請替代料。`,
    });
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="relative overflow-hidden rounded-[30px] border border-primary/15 bg-[radial-gradient(circle_at_top_right,hsl(221_95%_68%/0.18),transparent_32%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] p-6 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-primary/75">
              Material Request Center
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              料號申請頁面
            </h1>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              這個頁面把一顆料的多個替代料拆成三種看法:
              先看「待申請佇列」抓出真的要動作的項目，再看「料件家族」理解同組替代料全貌，最後保留「原始明細」回頭對 Excel。
            </p>
          </div>

          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="rounded-2xl border border-primary/10 bg-background/35 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground/70">
                資料來源
              </p>
              <p className="mt-2 font-medium text-foreground">
                {dataset.meta.sourceFile}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                工作表: {dataset.meta.sheetName}
              </p>
            </div>
            <div className="rounded-2xl border border-primary/10 bg-background/35 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground/70">
                載入時間
              </p>
              <p className="mt-2 font-medium text-foreground">
                {formatTimestamp(dataset.meta.generatedAt)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                目前共 {dataset.meta.recordCount} 筆明細
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleWorkbookImport}
          />
          <Button
            variant="default"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {isImporting ? "匯入中..." : "匯入新版 Excel"}
          </Button>
          <Button variant="secondary" onClick={handleExportPendingCsv}>
            <Download className="h-4 w-4" />
            下載待申請 CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setDataset(seedDataset);
              setSelectedGroupKey("");
              toast({
                title: "已還原內建快照",
                description: "頁面已切回目前這份申請 CARRIER 料的預載資料。",
              });
            }}
          >
            使用內建快照
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <CardTitle className="text-2xl">清楚看替代料</CardTitle>
              <CardDescription>
                待申請先看動作，料件家族看全貌，原始明細保留回 Excel 的對照能力。
              </CardDescription>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜尋 Ref、料名、MPN、廠商、內部料號"
                  className="pl-9"
                />
              </div>

              <Select
                value={remarkFilter}
                onValueChange={(value: RemarkFilter) => setRemarkFilter(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="備註條件" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">只看待申請</SelectItem>
                  <SelectItem value="all">全部備註</SelectItem>
                  <SelectItem value="ok">只看 OK</SelectItem>
                  <SelectItem value="unlock">只看需解除</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Sourcing Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部狀態</SelectItem>
                  {dataset.sourcingStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs
            value={viewMode}
            onValueChange={(value) => setViewMode(value as ViewMode)}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="queue">待申請佇列</TabsTrigger>
              <TabsTrigger value="groups">料件家族</TabsTrigger>
              <TabsTrigger value="raw">原始明細</TabsTrigger>
            </TabsList>

            <TabsContent value="queue" className="mt-6">
              <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                <Card className="border-primary/10 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-xl">待處理群組</CardTitle>
                    <CardDescription>
                      先以群組角度判斷哪一組料最需要動作，再展開看同組替代料。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-[70vh] space-y-3 overflow-y-auto">
                    {filteredGroups.length ? (
                      filteredGroups.map((group) => (
                        <GroupListItem
                          key={group.key}
                          group={group}
                          selected={group.key === selectedGroup?.key}
                          onClick={() => setSelectedGroupKey(group.key)}
                        />
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-primary/15 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                        目前沒有符合條件的待申請群組。
                      </div>
                    )}
                  </CardContent>
                </Card>

                {selectedGroup ? (
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary" className="font-mono">
                                {selectedGroup.displayRef}
                              </Badge>
                              {selectedGroup.pendingCount > 0 && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-300/35 bg-amber-400/12 text-amber-100"
                                >
                                  仍有 {selectedGroup.pendingCount} 筆待申請
                                </Badge>
                              )}
                            </div>
                            <CardTitle className="mt-3 text-2xl">
                              {selectedGroup.name}
                            </CardTitle>
                            <CardDescription className="mt-2">
                              {selectedGroup.assemblyName
                                ? `模組: ${selectedGroup.assemblyName}`
                                : "未標記模組"}
                              {selectedGroup.partSpec
                                ? ` · 規格: ${selectedGroup.partSpec}`
                                : ""}
                            </CardDescription>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[320px]">
                            <div className="rounded-2xl border border-primary/10 bg-background/40 px-4 py-3">
                              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
                                已有內部料號
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedGroup.internalPartNumbers.length ? (
                                  selectedGroup.internalPartNumbers.map((partNumber) => (
                                    <Badge
                                      key={partNumber}
                                      variant="outline"
                                      className="font-mono"
                                    >
                                      {partNumber}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    尚未建檔
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-primary/10 bg-background/40 px-4 py-3">
                              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
                                Footprint / Symbol
                              </p>
                              <p className="mt-2 text-sm text-foreground">
                                {selectedGroup.footprint || "-"} /{" "}
                                {selectedGroup.schematicPart || "-"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                廠商數: {selectedGroup.manufacturers.length}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-xl">待申請替代料</CardTitle>
                        <CardDescription>
                          把真正需要申請的行抽出來，避免你在所有替代料裡面找半天。
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {selectedPendingRecords.length ? (
                          selectedPendingRecords.map((record) => (
                            <MaterialRecordCard key={record.id} record={record} />
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-primary/15 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                            這一組目前沒有待申請項目。
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <div className="grid gap-6 xl:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-xl">已可直接用</CardTitle>
                          <CardDescription>
                            有 OK 標記、內部料號已存在的替代料，拿來做比對最快。
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {selectedReadyRecords.length ? (
                            selectedReadyRecords.map((record) => (
                              <MaterialRecordCard key={record.id} record={record} />
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-primary/15 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                              這一組沒有 OK 標記的替代料。
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-xl">其他替代料</CardTitle>
                          <CardDescription>
                            把沒有進待申請也不是 OK 的資料留在旁邊，避免遺漏。
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {selectedOtherRecords.length ? (
                            selectedOtherRecords.map((record) => (
                              <MaterialRecordCard key={record.id} record={record} />
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-primary/15 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                              沒有其他未分類替代料。
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                      先從左邊挑一組料件群組。
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="groups" className="mt-6">
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-xl">料件家族總覽</CardTitle>
                  <CardDescription>
                    用卡片一次掃過每一組料件，哪組有風險、哪組已經有可用料號，一眼就知道。
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {filteredGroups.length ? (
                    filteredGroups.map((group) => (
                      <div
                        key={group.key}
                        className="rounded-[26px] border border-primary/10 bg-background/35 p-5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="font-mono">
                            {group.displayRef}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              group.pendingCount > 0
                                ? "border-amber-300/35 bg-amber-400/12 text-amber-100"
                                : "border-emerald-300/35 bg-emerald-400/12 text-emerald-100"
                            )}
                          >
                            {group.pendingCount > 0
                              ? `待申請 ${group.pendingCount}`
                              : "已可直接使用"}
                          </Badge>
                        </div>

                        <h3 className="mt-4 text-lg font-semibold text-foreground">
                          {group.name}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {group.assemblyName || "未標記模組"}
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-2xl border border-primary/10 bg-card/45 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                              替代料數
                            </p>
                            <p className="mt-1 text-lg font-semibold text-foreground">
                              {group.totalCount}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-primary/10 bg-card/45 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                              已建檔
                            </p>
                            <p className="mt-1 text-lg font-semibold text-foreground">
                              {group.okCount}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {group.internalPartNumbers.slice(0, 4).map((partNumber) => (
                            <Badge key={partNumber} variant="outline" className="font-mono">
                              {partNumber}
                            </Badge>
                          ))}
                          {group.internalPartNumbers.length > 4 && (
                            <Badge variant="outline">
                              +{group.internalPartNumbers.length - 4}
                            </Badge>
                          )}
                        </div>

                        <p className="mt-4 text-xs leading-6 text-muted-foreground">
                          廠商涵蓋 {group.manufacturers.length} 家
                          {group.footprint ? ` · ${group.footprint}` : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full rounded-2xl border border-dashed border-primary/15 bg-background/35 px-4 py-10 text-center text-sm text-muted-foreground">
                      目前沒有符合條件的料件群組。
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="raw" className="mt-6">
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-xl">原始明細對照</CardTitle>
                  <CardDescription>
                    保留原始列資料，方便你直接對回 Excel。為了閱讀性，畫面先顯示前 250 筆符合條件的結果。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <div>
                      共符合 {filteredRecords.length} 筆，畫面目前顯示{" "}
                      {visibleRawRecords.length} 筆。
                    </div>
                    <div>
                      如果想聚焦待申請資料，建議把上方備註條件保持在「只看待申請」。
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ref Group</TableHead>
                        <TableHead>料件名稱</TableHead>
                        <TableHead>MPN</TableHead>
                        <TableHead>廠商</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>動作</TableHead>
                        <TableHead>內部料號</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRawRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-xs text-primary">
                            {record.displayRef}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{record.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {record.assemblyName || "-"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {record.mpnCandidates.join(" / ")}
                          </TableCell>
                          <TableCell>{record.manufacturer || "-"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={getSourcingBadgeClass(record.sourcingStatus)}
                            >
                              {record.sourcingStatus || "未標記"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={getActionBadgeClass(record.actionKind)}
                            >
                              {getActionLabel(record.actionKind)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {record.partNumber || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
