import { cn } from '@/lib/utils'

interface TagProps {
  children: React.ReactNode
  active?: boolean
  className?: string
  onClick?: () => void
}

export default function Tag({ children, active, className, onClick }: TagProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap',
        active
          ? 'bg-gradient-accent text-white shadow-glow-sm'
          : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]',
        className,
      )}
    >
      {children}
    </button>
  )
}
