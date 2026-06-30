import { useState } from 'react'
import { Globe2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/i18n/language'
import { cn } from '@/lib/utils'

export default function LanguageSelect({ compact = false, className, buttonClassName }: { compact?: boolean; className?: string; buttonClassName?: string }) {
  const { language, setLanguage, label, options } = useLanguage()
  const [open, setOpen] = useState(false)

  return (
    <div className={cn("relative", className)} data-i18n-skip>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'rounded-xl text-vrtext-secondary hover:bg-vrbg-elevated hover:text-vrtext-primary transition-colors',
          compact ? 'w-8 h-8' : 'h-9 px-2.5',
          buttonClassName
        )}
        title={label.label}
        aria-label={label.label}
      >
        <Globe2 className="w-4 h-4" />
        {!compact && <span className="text-xs font-semibold">{label.short}</span>}
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, x: 10, y: -10, filter: 'blur(10px)' }}
              animate={{ opacity: 1, x: 0, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 10, y: -10, filter: 'blur(10px)' }}
              transition={{
                duration: 0.3,
                type: 'spring',
                stiffness: 300,
                damping: 20,
              }}
              className="absolute right-0 top-full mt-2 z-50"
            >
              <div className="flex flex-col items-end gap-2">
                {options.map((option, index) => (
                  <motion.div
                    key={option.value}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.05,
                    }}
                  >
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setLanguage(option.value)
                        setOpen(false)
                      }}
                      className={cn(
                        'flex items-center gap-2 bg-[#11111198] hover:bg-[#111111d1] text-white shadow-[0_0_20px_rgba(0,0,0,0.2)] border-none rounded-xl backdrop-blur-sm',
                        language === option.value && 'bg-vraccent-primary hover:bg-vraccent-primary'
                      )}
                    >
                      <span>{option.label}</span>
                    </Button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
