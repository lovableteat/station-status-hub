import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

const data = [
  { date: '06/27', completed: 28, target: 35, efficiency: 80 },
  { date: '06/28', completed: 32, target: 35, efficiency: 91 },
  { date: '06/29', completed: 29, target: 35, efficiency: 83 },
  { date: '06/30', completed: 35, target: 35, efficiency: 100 },
  { date: '07/01', completed: 33, target: 35, efficiency: 94 },
  { date: '07/02', completed: 31, target: 35, efficiency: 89 },
  { date: '07/03', completed: 23, target: 35, efficiency: 66 },
];

export function ProductionTrendChart() {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
            label={{ value: '台數', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip 
            formatter={(value, name) => [
              `${value}${name === 'efficiency' ? '%' : '台'}`, 
              name === 'completed' ? '完成數量' : name === 'target' ? '目標數量' : '效率'
            ]}
            labelFormatter={(label) => `日期: ${label}`}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px'
            }}
          />
          <Area
            type="monotone"
            dataKey="target"
            stackId="1"
            stroke="hsl(var(--muted-foreground))"
            fill="hsl(var(--muted))"
            fillOpacity={0.3}
          />
          <Area
            type="monotone"
            dataKey="completed"
            stackId="2"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.8}
          />
          <Line
            type="monotone"
            dataKey="efficiency"
            stroke="hsl(var(--success))"
            strokeWidth={2}
            dot={{ fill: 'hsl(var(--success))', strokeWidth: 2, r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}