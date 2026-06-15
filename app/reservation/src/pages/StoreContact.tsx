import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Phone, Clock, ExternalLink, QrCode } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getVenues } from '@/api/venues'
import { getImageUrl } from '@/lib/imageUrl'
import type { Venue } from '@/api/venues'

function VenueCard({ venue }: { venue: Venue }) {
  const mapLinks = (venue.mapLinks as { label: string; url: string }[] | undefined) || []

  const openLink = (url: string) => {
    if (url?.startsWith('http')) window.open(url, '_blank')
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden">
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--bg-active)] flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-[var(--accent-primary)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">{venue.name}</p>
            <p className="text-xs text-[var(--text-secondary)]">{venue.address || '暂无地址'}</p>
          </div>
        </div>

        {venue.phone && (
          <a
            href={`tel:${venue.phone}`}
            className="flex items-center gap-2 p-3 bg-[var(--bg-surface)] rounded-lg text-sm text-[var(--accent-primary)] font-medium hover:bg-[var(--bg-active)] transition-colors"
          >
            <Phone className="w-4 h-4" />
            {venue.phone}
          </a>
        )}

        {(venue.openTime || venue.closeTime) && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <Clock className="w-3.5 h-3.5" />
            <span>营业时间：{venue.openTime || '09:00'} - {venue.closeTime || '22:00'}</span>
          </div>
        )}

        {venue.qrCode && (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-active)] flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 text-[var(--accent-primary)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">门店微信</p>
              <img src={getImageUrl(venue.qrCode)} alt="门店二维码" className="mt-2 w-32 h-32 rounded-xl border border-[var(--border-subtle)]" />
            </div>
          </div>
        )}

        {venue.serviceQr && (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-active)] flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 text-[var(--accent-primary)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">客服微信</p>
              <img src={getImageUrl(venue.serviceQr)} alt="客服微信二维码" className="mt-2 w-32 h-32 rounded-xl border border-[var(--border-subtle)]" />
            </div>
          </div>
        )}

        {mapLinks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="w-4 h-4 text-[var(--accent-primary)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">地图导航</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {mapLinks.map((link, i) => (
                <button
                  key={i}
                  onClick={() => openLink(link.url)}
                  className="px-3 py-1.5 rounded-full bg-[var(--bg-active)] text-[var(--accent-primary)] text-xs font-medium hover:bg-[var(--bg-surface)] transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function StoreContact() {
  const navigate = useNavigate()

  const { data: venueData } = useQuery({
    queryKey: ['venues'],
    queryFn: () => getVenues({ status: 'all' }),
    staleTime: 60000,
  })

  const venues = (venueData?.data || []) as Venue[]

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
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">联系门店</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {venues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
            <MapPin className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">暂无门店信息</p>
          </div>
        ) : (
          venues.map((venue) => (
            <VenueCard key={venue.id} venue={venue} />
          ))
        )}
      </div>
    </motion.div>
  )
}
