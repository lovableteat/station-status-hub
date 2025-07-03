import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { type: 'Diag Fail', count: 45, percentage: 35.2 },
  { type: 'BIOS Boot Fail', count: 12, percentage: 9.4 },
  { type: 'Power Cycle Timeout', count: 8, percentage: 6.3 },
  { type: 'USB Loopback', count: 6, percentage: 4.7 },
  { type: 'Thermal Sensor', count: 4, percentage: 3.1 },
];

export function IssueTypeChart() {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="horizontal" margin={{ top: 20, right: 30, left: 80, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis 
            type="number"
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis 
            type="category"
            dataKey="type"
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
            width={80}
          />
          <Tooltip 
            formatter={(value, name) => [`${value}次`, '發生次數']}
            labelFormatter={(label) => `問題類型: ${label}`}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px'
            }}
          />
          <Bar 
            dataKey="count" 
            fill="hsl(var(--danger))"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}