ALTER TABLE "DailyFinancialReport"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "generatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "generatedById" TEXT,
  ADD COLUMN IF NOT EXISTS "generatedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmedById" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reopenedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reopenedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reopenedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "reopenReason" TEXT;

UPDATE "DailyFinancialReport"
SET "status" = 'GENERATED',
    "generatedAt" = COALESCE("generatedAt", "updatedAt")
WHERE "status" = 'DRAFT';

CREATE INDEX IF NOT EXISTS "DailyFinancialReport_status_idx" ON "DailyFinancialReport"("status");
CREATE INDEX IF NOT EXISTS "DailyFinancialReport_generatedAt_idx" ON "DailyFinancialReport"("generatedAt");
CREATE INDEX IF NOT EXISTS "DailyFinancialReport_confirmedAt_idx" ON "DailyFinancialReport"("confirmedAt");

CREATE TABLE IF NOT EXISTS "FinanceAdjustment" (
  "id" TEXT NOT NULL,
  "adjustmentNo" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'EXECUTED',
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetDesc" TEXT,
  "amount" INTEGER NOT NULL DEFAULT 0,
  "pointsAmount" INTEGER NOT NULL DEFAULT 0,
  "beforeValue" JSONB,
  "afterValue" JSONB,
  "reason" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "operatorName" TEXT NOT NULL,
  "operatorRole" TEXT NOT NULL,
  "auditLogId" TEXT,
  "approvalId" TEXT,
  "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceAdjustment_adjustmentNo_key" ON "FinanceAdjustment"("adjustmentNo");
CREATE INDEX IF NOT EXISTS "FinanceAdjustment_source_idx" ON "FinanceAdjustment"("source");
CREATE INDEX IF NOT EXISTS "FinanceAdjustment_type_idx" ON "FinanceAdjustment"("type");
CREATE INDEX IF NOT EXISTS "FinanceAdjustment_status_idx" ON "FinanceAdjustment"("status");
CREATE INDEX IF NOT EXISTS "FinanceAdjustment_targetType_targetId_idx" ON "FinanceAdjustment"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "FinanceAdjustment_operatorId_idx" ON "FinanceAdjustment"("operatorId");
CREATE INDEX IF NOT EXISTS "FinanceAdjustment_createdAt_idx" ON "FinanceAdjustment"("createdAt");
