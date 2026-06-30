import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';

export type ChartView = 'curve' | 'bar';

export type MetricAccent = 'emerald' | 'rose' | 'blue' | 'amber' | 'neutral';

export interface SeriesPoint {
  value: number;
  date: string;
}

export interface MetricSeries {
  name: string;
  data: SeriesPoint[];
  accent?: MetricAccent;
}

export interface ChartSeries {
  name: string;
  data: SeriesPoint[];
  color: string;
}

export const ACCENTS: Record<
  MetricAccent,
  { stroke: string; fill: string; text: string }
> = {
  emerald: { stroke: '#10B981', fill: '#10B98120', text: '#10B981' },
  rose: { stroke: '#EF4444', fill: '#EF444420', text: '#EF4444' },
  blue: { stroke: '#3B82F6', fill: '#3B82F620', text: '#3B82F6' },
  amber: { stroke: '#F59E0B', fill: '#F59E0B20', text: '#F59E0B' },
  neutral: { stroke: '#64748B', fill: '#64748B20', text: '#64748B' },
};

export const SERIES_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];

export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString();
}

interface MetricChartProps {
  series: ChartSeries[];
  view: ChartView;
  defaultIndex?: number;
  valueFormatter?: (value: number) => string;
  dateFormatter?: (date: string) => string;
}

export function MetricChart({
  series,
  view,
  defaultIndex,
  valueFormatter = (v) => v.toLocaleString(),
  dateFormatter = (d) => d,
}: MetricChartProps) {
  const rows = useMemo(() => {
    const dates = Array.from(new Set(series.flatMap((s) => s.data.map((d) => d.date))));
    return dates.map((date) => {
      const row: Record<string, number | string> = { date };
      series.forEach((s) => {
        const point = s.data.find((d) => d.date === date);
        row[s.name] = point?.value ?? 0;
      });
      return row;
    });
  }, [series]);

  const safeIndex = Math.min(
    Math.max(0, defaultIndex ?? rows.length - 1),
    rows.length - 1
  );

  if (rows.length === 0) return null;

  const renderReference = (
    <ReferenceLine
      x={rows[safeIndex]?.date}
      stroke="currentColor"
      strokeOpacity={0.2}
      strokeDasharray="4 4"
      ifOverflow="extendDomain"
    />
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      {view === 'curve' ? (
        <AreaChart data={rows} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient id={`area-fill-${i}`} key={s.name} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255,255,255,0.96)',
              border: '1px solid var(--vr-border-subtle)',
              borderRadius: '12px',
              boxShadow: '0 16px 35px rgba(15,23,42,0.08)',
              fontSize: 12,
              color: '#0f172a',
            }}
            labelStyle={{ color: '#0f172a', fontWeight: 600, marginBottom: 4 }}
            formatter={(value: number, name: string) => [valueFormatter(value), name]}
            labelFormatter={(label: string) => dateFormatter(label)}
          />
          {renderReference}
          {series.map((s, i) => (
            <Area
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#area-fill-${i})`}
              animationDuration={1000}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      ) : (
        <BarChart data={rows} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255,255,255,0.96)',
              border: '1px solid var(--vr-border-subtle)',
              borderRadius: '12px',
              boxShadow: '0 16px 35px rgba(15,23,42,0.08)',
              fontSize: 12,
              color: '#0f172a',
            }}
            labelStyle={{ color: '#0f172a', fontWeight: 600, marginBottom: 4 }}
            formatter={(value: number, name: string) => [valueFormatter(value), name]}
            labelFormatter={(label: string) => dateFormatter(label)}
          />
          {renderReference}
          {series.map((s) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              animationDuration={1000}
            />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
