import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useState, useEffect } from 'react';

export function StationTimeComparison() {
  const { stations } = useUnifiedData();
  const [timeData, setTimeData] = useState<any[]>([]);

  useEffect(() => {
    // Mock data with estimated vs actual time comparison
    const mockData = stations.map((station, index) => ({
      station: station.station_name,
      estimated: station.estimated_hours,
      actual: station.estimated_hours * (0.8 + Math.random() * 0.6), // Simulate variance
      efficiency: Math.round((station.estimated_hours / (station.estimated_hours * (0.8 + Math.random() * 0.6))) * 100)
    }));
    setTimeData(mockData);
  }, [stations]);

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={timeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis 
            dataKey="station" 
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
            label={{ value: '工時 (小時)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip 
            formatter={(value, name) => [
              `${value} 小時`, 
              name === 'estimated' ? '預計工時' : '實際工時'
            ]}
            labelFormatter={(label) => `站點: ${label}`}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px'
            }}
          />
          <Legend />
          <Bar 
            dataKey="estimated" 
            name="預計工時"
            fill="hsl(var(--info))"
            radius={[4, 4, 0, 0]}
          />
          <Bar 
            dataKey="actual" 
            name="實際工時"
            fill="hsl(var(--warning))"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}