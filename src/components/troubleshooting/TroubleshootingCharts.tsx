import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

interface TroubleshootingRecord {
  id: string;
  issue_type: string;
  issue_category: string;
  severity: string;
  status: string;
  occurred_at: string;
  time_to_resolve_hours: number | null;
}

interface Props {
  records: TroubleshootingRecord[];
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(217 91% 50%)',
  'hsl(142 76% 46%)',
  'hsl(45 93% 57%)',
];

export function TroubleshootingCharts({ records }: Props) {
  // Issue type distribution
  const typeData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach(r => {
      counts[r.issue_type] = (counts[r.issue_type] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: records.length > 0 ? ((count / records.length) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.count - a.count);
  }, [records]);

  // Severity distribution
  const severityData = useMemo(() => {
    const labels: Record<string, string> = {
      critical: '嚴重', high: '高', medium: '中', low: '低'
    };
    const colors: Record<string, string> = {
      critical: 'hsl(var(--chart-4))',
      high: 'hsl(0 84% 70%)',
      medium: 'hsl(var(--chart-3))',
      low: 'hsl(var(--chart-2))',
    };
    const counts: Record<string, number> = {};
    records.forEach(r => {
      counts[r.severity] = (counts[r.severity] || 0) + 1;
    });
    return Object.entries(counts).map(([key, value]) => ({
      name: labels[key] || key,
      value,
      color: colors[key] || 'hsl(var(--chart-1))',
    }));
  }, [records]);

  // Status distribution
  const statusData = useMemo(() => {
    const labels: Record<string, string> = {
      open: '待處理', investigating: '處理中', resolved: '已解決', closed: '已關閉'
    };
    const colors: Record<string, string> = {
      open: 'hsl(var(--danger))',
      investigating: 'hsl(var(--warning))',
      resolved: 'hsl(var(--success))',
      closed: 'hsl(var(--muted-foreground))',
    };
    const counts: Record<string, number> = {};
    records.forEach(r => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return Object.entries(counts).map(([key, value]) => ({
      name: labels[key] || key,
      value,
      color: colors[key] || 'hsl(var(--chart-1))',
    }));
  }, [records]);

  // Category distribution
  const categoryData = useMemo(() => {
    const labels: Record<string, string> = {
      hardware: '硬體', software: '軟體', network: '網路', power: '電源', other: '其他'
    };
    const counts: Record<string, number> = {};
    records.forEach(r => {
      const cat = r.issue_category || 'other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([key, value]) => ({
      name: labels[key] || key,
      count: value,
    }));
  }, [records]);

  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          尚無故障排除記錄，請新增第一筆記錄
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Issue Type Bar Chart */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">問題類型分佈</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 12 }} width={100} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} 次`, '發生次數']}
                  labelFormatter={(label) => `問題類型: ${label}`}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Severity Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">嚴重度分佈</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} 件`, '數量']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Status Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">處理狀態分佈</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} 件`, '數量']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Category Bar Chart */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">問題分類統計</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => [`${value} 次`, '數量']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
