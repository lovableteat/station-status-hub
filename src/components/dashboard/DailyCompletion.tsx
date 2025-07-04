import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useUnifiedData } from '@/hooks/useUnifiedData';

const mockDailyData = [
  { date: '12/28', planned: 8, actual: 6 },
  { date: '12/29', planned: 10, actual: 12 },
  { date: '12/30', planned: 12, actual: 9 },
  { date: '12/31', planned: 15, actual: 13 },
  { date: '01/01', planned: 8, actual: 0 },
  { date: '01/02', planned: 12, actual: 8 },
  { date: '01/03', planned: 14, actual: 11 },
  { date: '今天', planned: 16, actual: 14 },
];

export function DailyCompletion() {
  const { systems } = useUnifiedData();
  
  const completedToday = systems.filter(s => s.status === 'Done').length;
  const totalSystems = systems.length;
  const plannedToday = 16; // This could be dynamic based on your planning system

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">每日完成狀況</h3>
        <div className="text-sm text-muted-foreground">
          今日: {completedToday}/{plannedToday} 台
        </div>
      </div>
      
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mockDailyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              label={{ 
                value: '完成台數', 
                angle: -90, 
                position: 'insideLeft',
                style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' }
              }}
            />
            <Tooltip 
              formatter={(value, name) => [
                `${value} 台`, 
                name === 'planned' ? '預計完成' : '實際完成'
              ]}
              labelFormatter={(label) => `日期: ${label}`}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: 'hsl(var(--card-foreground))'
              }}
            />
            <Area 
              type="monotone"
              dataKey="planned" 
              name="預計完成"
              stroke="hsl(var(--chart-1))"
              fill="hsl(var(--chart-1) / 0.2)"
              strokeWidth={2}
            />
            <Area 
              type="monotone"
              dataKey="actual" 
              name="實際完成"
              stroke="hsl(var(--chart-2))"
              fill="hsl(var(--chart-2) / 0.2)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}