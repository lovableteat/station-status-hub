import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useState, useEffect } from 'react';

export function StationTimeComparison() {
  const { stations, testItems, progress } = useUnifiedData();
  const [timeData, setTimeData] = useState<any[]>([]);

  useEffect(() => {
    // Calculate real station time data from test items
    const chartData = stations
      .filter(station => station.station_order >= 0 && station.station_order <= 3)
      .map((station) => {
        // Get actual test items for this station and sum their estimated minutes
        const stationItems = testItems.filter(item => item.station_id === station.id);
        const totalMinutes = stationItems.reduce((sum, item) => sum + (item.estimated_minutes || 30), 0);
        const estimatedHours = Number((totalMinutes / 60).toFixed(1));
        
        // Calculate actual hours from test progress records
        const stationProgress = progress.filter(p => p.station_id === station.id);
        const totalActualHours = stationProgress.reduce((sum, p) => sum + (p.actual_hours || 0), 0);
        const actualHours = Number(totalActualHours.toFixed(1));
        
        return {
          station: station.station_name,
          estimated: estimatedHours,
          actual: actualHours > 0 ? actualHours : estimatedHours // Use actual if available, otherwise use estimated
        };
      });
    setTimeData(chartData);
  }, [stations, testItems, progress]);

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={timeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="station" 
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            height={60}
          />
          <YAxis 
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            label={{ 
              value: '工時 (小時)', 
              angle: -90, 
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' }
            }}
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
              borderRadius: '8px',
              color: 'hsl(var(--card-foreground))'
            }}
          />
          <Legend />
          <Line 
            type="monotone"
            dataKey="estimated" 
            name="預計工時"
            stroke="hsl(var(--chart-1))"
            strokeWidth={3}
            dot={{ fill: 'hsl(var(--chart-1))', strokeWidth: 2, r: 6 }}
          />
          <Line 
            type="monotone"
            dataKey="actual" 
            name="實際工時"
            stroke="hsl(var(--chart-3))"
            strokeWidth={3}
            dot={{ fill: 'hsl(var(--chart-3))', strokeWidth: 2, r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}