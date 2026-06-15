import { useState } from 'react'
import { Globe2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLanguage } from '@/i18n/language'
import { cn } from '@/lib/utils'

export default function LanguageSelect() {
  const { language, setLanguage, label, options } = useLanguage()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full bg-[var(--bg-elevated)] text-[var(--accent-primary)] flex items-center justify-center gap-0.5 active:scale-95 transition-all"
        title="语言"
        aria-label="语言"
      >
        <Globe2 className="w-4 h-4" />
        <span className="text-[10px] font-bold">{label.short}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[110]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-32 rounded-2xl border border-[var(--border-subtle)] bg-white p-1.5 shadow-xl z-[120]"
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setLanguage(option.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full rounded-xl px-3 py-2 text-left text-sm transition-colors',
                    language === option.value
                      ? 'bg-[var(--bg-active)] text-[var(--accent-primary)] font-bold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
