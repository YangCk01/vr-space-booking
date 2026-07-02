import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getPagePublicSettings } from '@/api/settings'

function renderMarkdownLike(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let key = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) {
      elements.push(<div key={key++} className="h-2" />)
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key++} className="text-base font-bold text-[var(--text-primary)] mt-4 mb-2">
          {line.replace('## ', '')}
        </h2>
      )
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={key++} className="text-lg font-bold text-[var(--text-primary)] mt-4 mb-2">
          {line.replace('# ', '')}
        </h1>
      )
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(
        <p key={key++} className="text-sm text-[var(--text-secondary)] leading-relaxed py-1">
          {line}
        </p>
      )
    } else {
      elements.push(
        <p key={key++} className="text-sm text-[var(--text-secondary)] leading-relaxed py-1">
          {line}
        </p>
      )
    }
  }
  return elements
}

export default function GroupBookingRules() {
  const navigate = useNavigate()

  const { data: pageSettings } = useQuery({
    queryKey: ['page-public-settings'],
    queryFn: getPagePublicSettings,
    staleTime: 0,
    gcTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const rules = pageSettings?.cGroupBookingRules || ''

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="min-h-[100dvh] pb-24 bg-[var(--bg-primary)]"
    >
      <div className="sticky top-0 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">拼场规则</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-[var(--accent-primary)]" />
            </div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">拼场说明</h2>
          </div>
          <div className="space-y-1">
            {rules ? renderMarkdownLike(rules) : (
              <p className="text-sm text-[var(--text-secondary)]">暂无拼场规则</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
