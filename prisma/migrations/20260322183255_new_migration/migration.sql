-- DropIndex
DROP INDEX "Payment_transactionId_key";

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "year" SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
