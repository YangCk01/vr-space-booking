ALTER TABLE "Order" ADD COLUMN "disruptionStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Order" ADD COLUMN "disruptionReason" TEXT;
ALTER TABLE "Order" ADD COLUMN "disruptionSource" TEXT;
ALTER TABLE "Order" ADD COLUMN "disruptionAt" TIMESTAMP(3);

CREATE INDEX "Order_disruptionStatus_idx" ON "Order"("disruptionStatus");
