-- CreateEnum
CREATE TYPE "Role" AS ENUM ('APPLICANT', 'PARTICIPANT', 'ADMIN', 'COORDINATOR');

-- CreateEnum
CREATE TYPE "RegistrationType" AS ENUM ('GENERAL', 'WORKSHOP', 'COMBO');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RegistrationSource" AS ENUM ('ONLINE', 'ON_SPOT', 'CSV_IMPORT');

-- CreateEnum
CREATE TYPE "RegistrationSyncStatus" AS ENUM ('PENDING', 'APPLIED', 'CONFLICT', 'FAILED');

-- CreateEnum
CREATE TYPE "RegistrationOperationType" AS ENUM ('KIT', 'ATTENDANCE', 'QUICK_REGISTER', 'TEAM_ADD', 'TEAM_COMPLETE');

-- CreateEnum
CREATE TYPE "KitStatus" AS ENUM ('PENDING', 'ISSUED');

-- CreateEnum
CREATE TYPE "EventParticipationMode" AS ENUM ('INDIVIDUAL', 'TEAM');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('DRAFT', 'COMPLETED', 'LOCKED');

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('LEADER', 'MEMBER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "collegeName" TEXT NOT NULL,
    "collegeLoc" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "yearOfStudy" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'APPLICANT',
    "registrationType" "RegistrationType" NOT NULL DEFAULT 'GENERAL',
    "shacklesId" TEXT,
    "qrToken" TEXT,
    "qrImageUrl" TEXT,
    "qrPath" TEXT,
    "qrTokenExpiry" TIMESTAMP(3),
    "lastQrScan" TIMESTAMP(3),
    "kitStatus" "KitStatus" NOT NULL DEFAULT 'PENDING',
    "kitIssuedAt" TIMESTAMP(3),
    "kitIssuedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "verificationToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "proofUrl" TEXT NOT NULL,
    "proofPath" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accommodation" (
    "id" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "days" TEXT[],
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "dayLabel" TEXT,
    "date" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "description" TEXT,
    "rulesUrl" TEXT,
    "coordinatorName" TEXT,
    "coordinatorPhone" TEXT,
    "trainerName" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "participationMode" "EventParticipationMode" NOT NULL DEFAULT 'INDIVIDUAL',
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "teamMinSize" INTEGER,
    "teamMaxSize" INTEGER,
    "maxTeams" INTEGER,
    "maxParticipants" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "teamCode" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "status" "TeamStatus" NOT NULL DEFAULT 'DRAFT',
    "leaderUserId" TEXT,
    "leaderContactPhoneSnapshot" TEXT,
    "leaderContactEmailSnapshot" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamInvite" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invitedEmail" TEXT,
    "invitedByUserId" TEXT NOT NULL,
    "usedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamId" TEXT,
    "memberRole" "TeamMemberRole",
    "teamName" TEXT,
    "teamSize" INTEGER NOT NULL DEFAULT 1,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "attendedAt" TIMESTAMP(3),
    "source" "RegistrationSource" NOT NULL DEFAULT 'ONLINE',
    "syncStatus" "RegistrationSyncStatus" NOT NULL DEFAULT 'APPLIED',
    "stationId" TEXT,
    "clientOperationId" TEXT,
    "syncError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationOperation" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "operationType" "RegistrationOperationType" NOT NULL,
    "actorUserId" TEXT,
    "participantId" TEXT,
    "eventName" TEXT,
    "teamName" TEXT,
    "teamLeaderUserId" TEXT,
    "payload" JSONB,
    "payloadHash" TEXT,
    "status" "RegistrationSyncStatus" NOT NULL DEFAULT 'PENDING',
    "conflictReason" TEXT,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_shacklesId_key" ON "User"("shacklesId");

-- CreateIndex
CREATE UNIQUE INDEX "User_qrToken_key" ON "User"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_verificationToken_key" ON "User"("verificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_userId_key" ON "Payment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Accommodation_userId_key" ON "Accommodation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_name_key" ON "Event"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_eventId_nameNormalized_key" ON "Team"("eventId", "nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Team_eventId_teamCode_key" ON "Team"("eventId", "teamCode");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvite_token_key" ON "TeamInvite"("token");

-- CreateIndex
CREATE INDEX "TeamInvite_teamId_idx" ON "TeamInvite"("teamId");

-- CreateIndex
CREATE INDEX "TeamInvite_invitedByUserId_idx" ON "TeamInvite"("invitedByUserId");

-- CreateIndex
CREATE INDEX "TeamInvite_invitedEmail_idx" ON "TeamInvite"("invitedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_clientOperationId_key" ON "EventRegistration"("clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_userId_eventId_key" ON "EventRegistration"("userId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationOperation_operationId_key" ON "RegistrationOperation"("operationId");

-- CreateIndex
CREATE INDEX "RegistrationOperation_stationId_createdAt_idx" ON "RegistrationOperation"("stationId", "createdAt");

-- CreateIndex
CREATE INDEX "RegistrationOperation_status_createdAt_idx" ON "RegistrationOperation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RegistrationOperation_participantId_idx" ON "RegistrationOperation"("participantId");

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leaderUserId_fkey" FOREIGN KEY ("leaderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

