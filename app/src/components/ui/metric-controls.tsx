import { cn } from '@/lib/utils';
import type { ChartView } from './metric-chart';

export interface PeriodOption {
  label: string;
  points?: number;
}

interface PeriodSelectProps {
  value: string;
  options: PeriodOption[];
  onChange: (option: PeriodOption) => void;
  accentText?: string;
}

export function PeriodSelect({ value, options, onChange, accentText }: PeriodSelectProps) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-muted/60 p-0.5">
      {options.map((option) => (
        <button
          key={option.label}
          onClick={() => onChange(option)}
          className={cn(
            'px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors',
            value === option.label
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          style={value === option.label && accentText ? { color: accentText } : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface ViewToggleProps {
  value: ChartView;
  onChange: (view: ChartView) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center rounded-full border border-border/60 p-0.5">
      <button
        onClick={() => onChange('curve')}
        className={cn(
          'px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors',
          value === 'curve' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        aria-label="曲线图"
      >
        曲线
      </button>
      <button
        onClick={() => onChange('bar')}
        className={cn(
          'px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors',
          value === 'bar' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        aria-label="柱状图"
      >
        柱状
      </button>
    </div>
  );
}
