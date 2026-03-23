-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('ONLINE', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentCaptureSource" AS ENUM ('WEBSITE', 'ON_SPOT');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "captureSource" "PaymentCaptureSource" NOT NULL DEFAULT 'WEBSITE',
ADD COLUMN     "paymentChannel" "PaymentChannel" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "verificationDeviceId" TEXT,
ADD COLUMN     "verificationNote" TEXT;

-- CreateTable
CREATE TABLE "OnSpotProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "stationId" TEXT,
    "deviceId" TEXT,
    "referralSource" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnSpotProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnSpotProfile_userId_key" ON "OnSpotProfile"("userId");

-- CreateIndex
CREATE INDEX "OnSpotProfile_createdByUserId_createdAt_idx" ON "OnSpotProfile"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "OnSpotProfile_stationId_createdAt_idx" ON "OnSpotProfile"("stationId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_captureSource_status_createdAt_idx" ON "Payment"("captureSource", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_paymentChannel_status_createdAt_idx" ON "Payment"("paymentChannel", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "OnSpotProfile" ADD CONSTRAINT "OnSpotProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnSpotProfile" ADD CONSTRAINT "OnSpotProfile_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
