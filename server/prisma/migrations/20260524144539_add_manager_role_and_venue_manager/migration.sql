-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'MANAGER';

-- CreateTable
CREATE TABLE "VenueManager" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueManager_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenueManager_userId_idx" ON "VenueManager"("userId");

-- CreateIndex
CREATE INDEX "VenueManager_venueId_idx" ON "VenueManager"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueManager_userId_venueId_key" ON "VenueManager"("userId", "venueId");

-- AddForeignKey
ALTER TABLE "VenueManager" ADD CONSTRAINT "VenueManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueManager" ADD CONSTRAINT "VenueManager_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
