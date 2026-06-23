import { useState } from 'react'
import { Globe2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLanguage } from '@/i18n/language'
import { cn } from '@/lib/utils'

export default function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, label, options } = useLanguage()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative" data-i18n-skip>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'h-9 rounded-xl border border-vrborder-subtle bg-vrbg-card text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors flex items-center justify-center gap-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]',
          compact ? 'w-9 px-0' : 'px-2.5'
        )}
        title={label.label}
        aria-label={label.label}
      >
        <Globe2 className="w-4 h-4" />
        {!compact && <span className="text-xs font-semibold">{label.short}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-full mt-2 w-36 rounded-2xl border border-vrborder-subtle bg-vrbg-card p-1.5 shadow-[0_24px_60px_rgba(15,23,42,0.18)] z-50"
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
                    'w-full rounded-xl px-3 py-2 text-left text-vr-body-sm transition-colors',
                    language === option.value
                      ? 'bg-vrbg-active text-vraccent-primary font-semibold'
                      : 'text-vrtext-secondary hover:bg-vrbg-surface hover:text-vrtext-primary'
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
