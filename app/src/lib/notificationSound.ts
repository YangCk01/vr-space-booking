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

export type NotificationAudioResult = {
  ok: boolean
  error?: string
}

export async function playNotificationSound(type: string = 'default', customUrl?: string): Promise<NotificationAudioResult> {
  try {
    if (type === 'custom' && !customUrl?.trim()) {
      return { ok: false, error: '请先填写自定义音频 URL' }
    }

    if (type === 'custom' && customUrl) {
      const audio = new Audio(customUrl)
      audio.volume = 0.4
      await audio.play()
      return { ok: true }
    }

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) {
      return { ok: false, error: '当前浏览器不支持音频播放' }
    }
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    const now = ctx.currentTime
    const duration = type === 'crisp' ? 0.12 : type === 'soft' ? 0.2 : 0.18

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

    await new Promise<void>((resolve) => {
      oscillator.onended = () => resolve()
      window.setTimeout(resolve, Math.ceil(duration * 1000) + 80)
    })
    await ctx.close()
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '音频播放失败，请确认浏览器允许页面播放声音',
    }
  }
}

export async function speakNotification(text: string): Promise<NotificationAudioResult> {
  try {
    if (!window.speechSynthesis) {
      return { ok: false, error: '当前浏览器不支持语音播报' }
    }
    const content = text.trim()
    if (!content) {
      return { ok: false, error: '请先填写语音播报内容' }
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(content)
    const voices = window.speechSynthesis.getVoices()
    const zhVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith('zh'))
    if (zhVoice) {
      utterance.voice = zhVoice
    }
    utterance.lang = 'zh-CN'
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('语音播报超时，请确认浏览器没有静音或拦截声音')), 8000)
      utterance.onend = () => {
        window.clearTimeout(timer)
        resolve()
      }
      utterance.onerror = (event) => {
        window.clearTimeout(timer)
        reject(new Error(event.error || '语音播报失败'))
      }
      window.speechSynthesis.speak(utterance)
    })
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '语音播报失败，请确认浏览器允许页面播放声音',
    }
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
