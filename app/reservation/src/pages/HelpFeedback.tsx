import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, HelpCircle, MessageCircle, Phone, MessageSquare } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getPagePublicSettings } from '@/api/settings'

export default function HelpFeedback() {
  const navigate = useNavigate()
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const { data: pageSettings } = useQuery({
    queryKey: ['page-public-settings'],
    queryFn: getPagePublicSettings,
    staleTime: 60000,
  })

  const faqs = pageSettings?.cProfileHelpFaqs || []
  const contactPhone = pageSettings?.cProfileHelpContactPhone || '400-XXX-XXXX'
  const contactWechat = pageSettings?.cProfileHelpContactWechat || ''
  const contactHours = pageSettings?.cProfileHelpContactHours || ''

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
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">帮助与反馈</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* FAQ */}
        {faqs.length > 0 && (
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[var(--accent-primary)]" />
              常见问题
            </h3>
            <div className="space-y-2">
              {faqs.map((faq, idx) => (
                <div key={idx} className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
                  <button
                    onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--bg-surface)] transition-colors"
                  >
                    <HelpCircle className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                    <span className="text-sm text-[var(--text-primary)] flex-1">{faq.question}</span>
                    <ChevronLeft className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${openIndex === idx ? '-rotate-90' : '-rotate-180'}`} />
                  </button>
                  {openIndex === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="px-3 pb-3"
                    >
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed pl-7">{faq.answer}</p>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contact */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-[var(--accent-primary)]" />
            联系我们
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-3">遇到问题或有建议？请通过以下方式联系我们</p>
          <div className="space-y-2">
            {contactPhone && (
              <div className="flex items-center gap-3 p-3 bg-[var(--bg-surface)] rounded-lg">
                <Phone className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <span className="text-sm text-[var(--text-primary)]">客服电话：{contactPhone}</span>
              </div>
            )}
            {contactWechat && (
              <div className="flex items-center gap-3 p-3 bg-[var(--bg-surface)] rounded-lg">
                <MessageSquare className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <span className="text-sm text-[var(--text-primary)]">客服微信：{contactWechat}</span>
              </div>
            )}
            {contactHours && (
              <div className="flex items-center gap-3 p-3 bg-[var(--bg-surface)] rounded-lg">
                <span className="text-xs text-[var(--text-muted)]">工作时间：{contactHours}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
