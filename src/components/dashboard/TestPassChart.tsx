import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const data = [
  { name: '通過', value: 78, color: 'hsl(var(--success))' },
  { name: '失敗', value: 15, color: 'hsl(var(--danger))' },
  { name: '返工', value: 7, color: 'hsl(var(--warning))' },
];

export function TestPassChart() {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [`${value}台`, '數量']} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}