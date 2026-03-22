CREATE TABLE "ShacklesIdSequence" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "registrationType" "RegistrationType" NOT NULL,
  "lastIssued" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShacklesIdSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShacklesIdSequence_year_registrationType_key"
  ON "ShacklesIdSequence"("year", "registrationType");
