import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SystemProgressData, ProgressCalculator } from "./ProgressCalculator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TestProgressTableProps {
  data: SystemProgressData[];
  showExcluded?: boolean;
}

export function TestProgressTable({ data, showExcluded = false }: TestProgressTableProps) {
  const filteredData = showExcluded 
    ? data 
    : data.filter(item => !item.excludeFromDashboard);

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>測試進度明細表</span>
          <Badge variant="outline">
            {filteredData.length} 台系統
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">系統編號</TableHead>
                <TableHead className="w-[100px]">負責工程師</TableHead>
                <TableHead className="w-[80px]">整體狀態</TableHead>
                <TableHead className="w-[100px]">Station 0<br/>工廠組裝</TableHead>
                <TableHead className="w-[100px]">Station 1<br/>開機</TableHead>
                <TableHead className="w-[100px]">Station 2<br/>FW & SFT</TableHead>
                <TableHead className="w-[100px]">Station 3<br/>NV diag</TableHead>
                <TableHead className="w-[80px]">整體進度</TableHead>
                <TableHead className="w-[140px]">開始時間</TableHead>
                <TableHead className="w-[140px]">完成時間</TableHead>
                <TableHead className="w-[80px]">列入統計</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    沒有找到相關數據
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((item) => (
                  <TableRow key={item.systemId}>
                    <TableCell className="font-medium">
                      {item.systemName}
                    </TableCell>
                    <TableCell>{item.assignedEngineer}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={ProgressCalculator.getStatusColor(item.status)}
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={ProgressCalculator.getProgressColor(item.station0Progress)}>
                        {item.station0Progress}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={ProgressCalculator.getProgressColor(item.station1Progress)}>
                        {item.station1Progress}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={ProgressCalculator.getProgressColor(item.station2Progress)}>
                        {item.station2Progress}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={ProgressCalculator.getProgressColor(item.station3Progress)}>
                        {item.station3Progress}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={ProgressCalculator.getProgressColor(item.overallProgress)}>
                        {item.overallProgress}%
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(item.actualStartedAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(item.actualCompletedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.excludeFromDashboard ? "destructive" : "default"}>
                        {item.excludeFromDashboard ? "否" : "是"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}