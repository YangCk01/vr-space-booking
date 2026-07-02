-- AlterTable
ALTER TABLE "BalanceTransaction" ADD COLUMN     "sourceVenueId" TEXT,
ADD COLUMN     "venueId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "balanceDeductionSnapshot" JSONB;

-- AlterTable
ALTER TABLE "RechargeRecord" ADD COLUMN     "venueId" TEXT;

-- CreateTable
CREATE TABLE "UserStoreBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "principalBalance" INTEGER NOT NULL DEFAULT 0,
    "bonusBalance" INTEGER NOT NULL DEFAULT 0,
    "totalRecharged" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStoreBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserStoreBalance_userId_venueId_key" ON "UserStoreBalance"("userId", "venueId");

-- CreateIndex
CREATE INDEX "UserStoreBalance_userId_idx" ON "UserStoreBalance"("userId");

-- CreateIndex
CREATE INDEX "UserStoreBalance_venueId_idx" ON "UserStoreBalance"("venueId");

-- CreateIndex
CREATE INDEX "BalanceTransaction_venueId_idx" ON "BalanceTransaction"("venueId");

-- CreateIndex
CREATE INDEX "BalanceTransaction_sourceVenueId_idx" ON "BalanceTransaction"("sourceVenueId");

-- CreateIndex
CREATE INDEX "RechargeRecord_venueId_idx" ON "RechargeRecord"("venueId");

-- AddForeignKey
ALTER TABLE "RechargeRecord" ADD CONSTRAINT "RechargeRecord_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoreBalance" ADD CONSTRAINT "UserStoreBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoreBalance" ADD CONSTRAINT "UserStoreBalance_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
