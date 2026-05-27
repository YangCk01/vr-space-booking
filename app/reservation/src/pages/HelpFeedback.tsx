import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, HelpCircle, MessageCircle, FileText, CreditCard, Coins, Phone } from 'lucide-react'

const faqs = [
  {
    icon: CreditCard,
    question: '如何充值会员？',
    answer: '进入「我的」→「会员储值」，选择充值档位，支持微信支付和支付宝。充值后本金和赠送金额即时到账。',
  },
  {
    icon: Coins,
    question: '积分如何获取和使用？',
    answer: '消费时按本金消耗金额返还积分（1元返1积分）。积分可在下单时抵扣，100积分抵1元，最高可抵扣订单金额的30%。',
  },
  {
    icon: FileText,
    question: '如何退款？',
    answer: '未核销的订单可在「我的订单」中申请退款。已核销订单不支持退款。退款金额按消费时的本金/赠送比例原路退回。',
  },
  {
    icon: CreditCard,
    question: '余额的有效期是多久？',
    answer: '充值本金无有效期限制。赠送金额无有效期限制，但退款时赠送部分不予退还。',
  },
]

export default function HelpFeedback() {
  const navigate = useNavigate()
  const [openIndex, setOpenIndex] = useState<number | null>(null)

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
                  <faq.icon className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
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

        {/* Contact */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-[var(--accent-primary)]" />
            意见反馈
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-3">遇到问题或有建议？请联系我们</p>
          <div className="flex items-center gap-3 p-3 bg-[var(--bg-surface)] rounded-lg">
            <Phone className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-sm text-[var(--text-primary)]">客服电话：400-XXX-XXXX</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
