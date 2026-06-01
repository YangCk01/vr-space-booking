import { prisma } from '../utils/prisma'

interface ConfigItem {
  value: any
  type: string
}

const configCache = new Map<string, ConfigItem>()

function parseValue(value: string, type: string): any {
  switch (type) {
    case 'NUMBER':
      return Number(value)
    case 'JSON':
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    case 'BOOLEAN':
      return value === 'true' || value === '1'
    case 'STRING':
    default:
      return value
  }
}

function stringifyValue(value: any, type: string): string {
  if (type === 'JSON') {
    return JSON.stringify(value)
  }
  return String(value)
}

export async function loadConfig() {
  const configs = await prisma.systemConfig.findMany()
  configCache.clear()
  for (const c of configs) {
    configCache.set(c.key, { value: parseValue(c.value, c.type), type: c.type })
  }
  console.log(`[Config] Loaded ${configs.length} system configs`)
}

export function getConfig<T = any>(key: string, defaultValue?: T): T | undefined {
  const item = configCache.get(key)
  if (item === undefined) {
    return defaultValue
  }
  return item.value as T
}

export async function updateConfig(key: string, value: any, operatorId?: string) {
  let type = 'STRING'
  if (typeof value === 'number') {
    type = 'NUMBER'
  } else if (typeof value === 'boolean') {
    type = 'BOOLEAN'
  } else if (typeof value === 'object') {
    type = 'JSON'
  }

  const strValue = stringifyValue(value, type)

  await prisma.systemConfig.upsert({
    where: { key },
    create: {
      key,
      value: strValue,
      type,
      updatedBy: operatorId,
    },
    update: {
      value: strValue,
      type,
      updatedBy: operatorId,
    },
  })

  configCache.set(key, { value: parseValue(strValue, type), type })
  return configCache.get(key)!.value
}

export function getAllConfigs() {
  return Array.from(configCache.entries()).map(([key, item]) => ({
    key,
    value: item.value,
    type: item.type,
  }))
}
