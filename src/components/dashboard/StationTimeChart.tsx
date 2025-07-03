import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const data = [
  { station: 'Station 0', avgTime: 1.5, maxTime: 2.1, minTime: 1.2, status: 'normal' },
  { station: 'Station 1', avgTime: 1.3, maxTime: 1.8, minTime: 1.0, status: 'normal' },
  { station: 'Station 2', avgTime: 1.8, maxTime: 2.5, minTime: 1.4, status: 'warning' },
  { station: 'Station 3', avgTime: 2.8, maxTime: 4.2, minTime: 2.1, status: 'danger' },
  { station: 'Station 4', avgTime: 3.2, maxTime: 4.0, minTime: 2.8, status: 'normal' },
];

const getBarColor = (status: string) => {
  switch (status) {
    case 'danger': return 'hsl(var(--danger))';
    case 'warning': return 'hsl(var(--warning))';
    default: return 'hsl(var(--primary))';
  }
};

export function StationTimeChart() {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis 
            dataKey="station" 
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
            label={{ value: '工時 (小時)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip 
            formatter={(value, name) => [`${value}h`, name === 'avgTime' ? '平均工時' : '工時']}
            labelFormatter={(label) => `站點: ${label}`}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px'
            }}
          />
          <Bar dataKey="avgTime" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.status)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}