import { cn } from '@/lib/utils'
import { Minus, Plus } from 'lucide-react'

interface StepperProps {
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

export default function Stepper({ value, min = 1, max = 99, onChange }: StepperProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center transition-all',
          value <= min
            ? 'bg-[var(--bg-elevated)] text-[var(--text-disabled)] cursor-not-allowed'
            : 'bg-[var(--bg-elevated)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-white active:scale-90',
        )}
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="text-lg font-semibold text-[var(--text-primary)] w-6 text-center">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center transition-all',
          value >= max
            ? 'bg-[var(--bg-elevated)] text-[var(--text-disabled)] cursor-not-allowed'
            : 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)] active:scale-90',
        )}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}
