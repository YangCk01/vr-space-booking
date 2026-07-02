CREATE TABLE "JobExecutionLog" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobExecutionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobExecutionLog_jobName_startedAt_idx" ON "JobExecutionLog"("jobName", "startedAt");
CREATE INDEX "JobExecutionLog_status_idx" ON "JobExecutionLog"("status");
CREATE INDEX "JobExecutionLog_createdAt_idx" ON "JobExecutionLog"("createdAt");
