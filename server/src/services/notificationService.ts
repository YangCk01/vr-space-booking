/**
 * 通知告警服务（Webhook 推送）
 *
 * 支持渠道：
 * - 企业微信 (wecom)
 * - 钉钉 (dingtalk)
 * - 飞书 (lark)
 * - 通用 Webhook (generic)
 */

import { prisma } from '../utils/prisma'

interface WebhookPayload {
  title: string
  content: string
  level: 'info' | 'warning' | 'error' | 'critical'
  timestamp: string
  metadata?: Record<string, any>
}

/**
 * 发送对账异常告警
 */
export async function sendReconAlert(payload: {
  reconDate: string
  exceptionCount: number
  matchedCount: number
  exceptionTypes: Record<string, number>
}) {
  const config = await getWebhookConfig()
  if (!config || !config.url) {
    console.log('[Notify] Webhook 未配置，跳过告警推送')
    return { success: false, message: 'Webhook 未配置' }
  }

  const typeSummary = Object.entries(payload.exceptionTypes)
    .map(([type, count]) => `${type}: ${count}笔`)
    .join('，')

  const webhookPayload: WebhookPayload = {
    title: `【对账异常告警】${payload.reconDate}`,
    content: `对账日期: ${payload.reconDate}\n异常笔数: ${payload.exceptionCount}\n匹配笔数: ${payload.matchedCount}\n异常类型: ${typeSummary || '无'}`,
    level: payload.exceptionCount > 0 ? 'warning' : 'info',
    timestamp: new Date().toISOString(),
    metadata: {
      reconDate: payload.reconDate,
      exceptionCount: payload.exceptionCount,
      matchedCount: payload.matchedCount,
      exceptionTypes: payload.exceptionTypes,
    },
  }

  return sendWebhook(config.url, config.type, webhookPayload)
}

/**
 * 发送高危异常即时告警（SHORT 等）
 */
export async function sendCriticalAlert(payload: {
  exceptionType: string
  bizOrderNo?: string
  diffAmount: number
  remark?: string
}) {
  const config = await getWebhookConfig()
  if (!config || !config.url) {
    console.log('[Notify] Webhook 未配置，跳过高危告警')
    return { success: false, message: 'Webhook 未配置' }
  }

  const webhookPayload: WebhookPayload = {
    title: `【高危异常】${payload.exceptionType}`,
    content: `异常类型: ${payload.exceptionType}\n业务单号: ${payload.bizOrderNo || '-'}\n差异金额: ¥${(payload.diffAmount / 100).toFixed(2)}\n备注: ${payload.remark || '-'}`,
    level: 'critical',
    timestamp: new Date().toISOString(),
    metadata: payload,
  }

  return sendWebhook(config.url, config.type, webhookPayload)
}

/**
 * 测试 Webhook 连通性
 */
export async function testWebhook(url: string, type: string) {
  const payload: WebhookPayload = {
    title: '【测试】对账系统 Webhook 连通性测试',
    content: '这是一条测试消息。如果您收到此消息，说明 Webhook 配置正确。',
    level: 'info',
    timestamp: new Date().toISOString(),
  }
  return sendWebhook(url, type, payload)
}

// ========== 内部实现 ==========

async function getWebhookConfig(): Promise<{ url: string; type: string } | null> {
  const [urlConfig, typeConfig] = await Promise.all([
    prisma.reconConfig.findUnique({ where: { key: 'WEBHOOK_URL' } }),
    prisma.reconConfig.findUnique({ where: { key: 'WEBHOOK_TYPE' } }),
  ])
  if (!urlConfig?.value) return null
  return {
    url: urlConfig.value,
    type: typeConfig?.value || 'generic',
  }
}

async function sendWebhook(
  url: string,
  type: string,
  payload: WebhookPayload
): Promise<{ success: boolean; message: string }> {
  try {
    const body = formatPayload(type, payload)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    console.log(`[Notify] Webhook 推送成功 (${type})`)
    return { success: true, message: '推送成功' }
  } catch (err) {
    const msg = (err as Error).message
    console.error(`[Notify] Webhook 推送失败: ${msg}`)
    return { success: false, message: msg }
  }
}

/**
 * 根据不同平台格式化消息体
 */
function formatPayload(type: string, payload: WebhookPayload): any {
  switch (type) {
    case 'wecom':
    case 'wechat_work':
      return {
        msgtype: 'markdown',
        markdown: {
          content: `**${payload.title}**\n>${payload.content.replace(/\n/g, '\n>')}\n>\n><font color="${payload.level === 'critical' ? 'red' : payload.level === 'warning' ? 'orange' : 'info'}">${payload.timestamp}</font>`,
        },
      }

    case 'dingtalk':
      return {
        msgtype: 'markdown',
        markdown: {
          title: payload.title,
          text: `### ${payload.title}\n${payload.content}\n\n---\n${payload.timestamp}`,
        },
      }

    case 'lark':
    case 'feishu':
      return {
        msg_type: 'text',
        content: {
          text: `${payload.title}\n${payload.content}\n\n${payload.timestamp}`,
        },
      }

    case 'generic':
    default:
      return payload
  }
}
