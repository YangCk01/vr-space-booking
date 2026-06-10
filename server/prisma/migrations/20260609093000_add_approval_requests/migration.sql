CREATE TYPE "ApprovalType" AS ENUM (
  'NO_SHOW_REFUND',
  'ORDER_REFUND',
  'BALANCE_ADJUST',
  'POINTS_ADJUST',
  'COUPON_GIFT',
  'ORDER_RESTORE',
  'ORDER_STATUS_CHANGE',
  'BATCH_REFUND',
  'BATCH_CANCEL',
  'BATCH_VERIFY'
);

CREATE TYPE "ApprovalStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXECUTION_FAILED'
);

CREATE TABLE "ApprovalRequest" (
  "id" TEXT NOT NULL,
  "type" "ApprovalType" NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "targetDesc" TEXT,
  "requesterId" TEXT NOT NULL,
  "requesterName" TEXT NOT NULL,
  "requesterRole" TEXT NOT NULL,
  "approverId" TEXT,
  "approverName" TEXT,
  "approverRole" TEXT,
  "requestPayload" JSONB NOT NULL,
  "beforeValue" JSONB,
  "afterValue" JSONB,
  "amount" INTEGER,
  "reason" TEXT NOT NULL,
  "approvalComment" TEXT,
  "executedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApprovalRequest_type_idx" ON "ApprovalRequest"("type");
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");
CREATE INDEX "ApprovalRequest_targetType_targetId_idx" ON "ApprovalRequest"("targetType", "targetId");
CREATE INDEX "ApprovalRequest_requesterId_idx" ON "ApprovalRequest"("requesterId");
CREATE INDEX "ApprovalRequest_approverId_idx" ON "ApprovalRequest"("approverId");
CREATE INDEX "ApprovalRequest_createdAt_idx" ON "ApprovalRequest"("createdAt");
