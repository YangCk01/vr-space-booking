import { useState } from 'react'
import { Globe2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLanguage } from '@/i18n/language'
import { cn } from '@/lib/utils'

export default function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, label, options } = useLanguage()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'h-9 rounded-lg border border-vrborder-subtle bg-vrbg-surface text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors flex items-center justify-center gap-1.5',
          compact ? 'w-9 px-0' : 'px-2.5'
        )}
        title="语言"
        aria-label="语言"
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
              className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-vrborder-hover bg-vrbg-elevated p-1 shadow-vr-lg z-50"
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
                    'w-full rounded-lg px-3 py-2 text-left text-vr-body-sm transition-colors',
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
