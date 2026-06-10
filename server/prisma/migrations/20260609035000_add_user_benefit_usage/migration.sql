CREATE TABLE IF NOT EXISTS "UserBenefitUsage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "benefitType" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "totalQuota" INTEGER NOT NULL DEFAULT 0,
  "usedQuota" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserBenefitUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserBenefitUsage_userId_benefitType_periodStart_key"
ON "UserBenefitUsage" ("userId", "benefitType", "periodStart");

CREATE INDEX IF NOT EXISTS "UserBenefitUsage_userId_idx"
ON "UserBenefitUsage" ("userId");
