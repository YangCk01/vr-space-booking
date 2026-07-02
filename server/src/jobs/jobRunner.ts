import { randomUUID } from 'crypto'
import { prisma } from '../utils/prisma'

export type JobExecutionStatus = 'SUCCESS' | 'FAILED'

export interface BuildJobExecutionRecordInput {
  id: string
  jobName: string
  startedAt: Date
  finishedAt: Date
  error: unknown | null
}

export interface JobExecutionRecord {
  id: string
  jobName: string
  status: JobExecutionStatus
  startedAt: Date
  finishedAt: Date
  durationMs: number
  errorMessage: string | null
}

export function serializeJobError(error: unknown): string {
  const text = error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack || ''}`.trim()
    : String(error)
  return text.slice(0, 2000)
}

export function buildJobExecutionRecord(input: BuildJobExecutionRecordInput): JobExecutionRecord {
  return {
    id: input.id,
    jobName: input.jobName,
    status: input.error ? 'FAILED' : 'SUCCESS',
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime()),
    errorMessage: input.error ? serializeJobError(input.error) : null,
  }
}

async function insertJobExecutionRecord(record: JobExecutionRecord) {
  await prisma.$executeRaw`
    INSERT INTO "JobExecutionLog"
      ("id", "jobName", "status", "startedAt", "finishedAt", "durationMs", "errorMessage")
    VALUES
      (${record.id}, ${record.jobName}, ${record.status}, ${record.startedAt}, ${record.finishedAt}, ${record.durationMs}, ${record.errorMessage})
  `
}

export async function runTrackedJob<T>(jobName: string, fn: () => Promise<T>): Promise<T> {
  const id = randomUUID()
  const startedAt = new Date()
  let error: unknown | null = null

  try {
    return await fn()
  } catch (err) {
    error = err
    throw err
  } finally {
    const record = buildJobExecutionRecord({
      id,
      jobName,
      startedAt,
      finishedAt: new Date(),
      error,
    })
    try {
      await insertJobExecutionRecord(record)
    } catch (logError) {
      console.error(`[JobRunner] 记录任务执行日志失败: ${jobName}`, logError)
    }
  }
}
