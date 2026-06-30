export const SOUND_TYPE_LABELS: Record<string, string> = {
  default: '默认叮咚',
  crisp: '清脆提示',
  soft: '柔和提示',
}

export const SOUND_MODE_LABELS: Record<string, string> = {
  sound: '提示音',
  voice: '语音播报',
  custom: '自定义音频',
}

export function playNotificationSound(type: string = 'default', customUrl?: string) {
  try {
    if (type === 'custom' && customUrl) {
      const audio = new Audio(customUrl)
      audio.volume = 0.4
      audio.play().catch(() => {
        // ignore autoplay errors
      })
      return
    }

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    const now = ctx.currentTime

    if (type === 'crisp') {
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(1200, now)
      oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.08)
      gainNode.gain.setValueAtTime(0.25, now)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
      oscillator.start()
      oscillator.stop(now + 0.12)
    } else if (type === 'soft') {
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(600, now)
      oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.15)
      gainNode.gain.setValueAtTime(0.2, now)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
      oscillator.start()
      oscillator.stop(now + 0.2)
    } else {
      // default
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, now)
      oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.12)
      gainNode.gain.setValueAtTime(0.25, now)
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
      oscillator.start()
      oscillator.stop(now + 0.18)
    }
  } catch {
    // ignore audio errors
  }
}

export function speakNotification(text: string) {
  try {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    window.speechSynthesis.speak(utterance)
  } catch {
    // ignore speech errors
  }
}

export function getVoiceTextByType(type?: string, fallback = '您有新的通知，请及时查看') {
  const map: Record<string, string> = {
    ADMIN_NEW_ORDER: '您有新的订单，请及时查看',
    ADMIN_REFUND_REQUEST: '您有新的退款申请，请及时处理',
    ADMIN_PRODUCT_SOLD: '您有新的商品售出',
    ADMIN_LOW_STOCK: '库存不足提醒，请及时补货',
    SYSTEM_ALERT: '系统告警，请关注',
    RECON_ALERT: '对账异常告警，请关注',
    BOOKING_SUCCESS: '您有新的预约，请及时查看',
    PAY_SUCCESS: '订单支付成功',
    BOOKING_CANCEL: '预约取消提醒',
  }
  return map[type || ''] || fallback
}
