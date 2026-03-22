-- Add yearly segmentation and archival/template controls for events.
ALTER TABLE "Event"
  ADD COLUMN "year" INTEGER,
  ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "templateSourceId" TEXT;

UPDATE "Event"
SET "year" = COALESCE(
  EXTRACT(YEAR FROM "date")::INTEGER,
  EXTRACT(YEAR FROM "createdAt")::INTEGER,
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
WHERE "year" IS NULL;

ALTER TABLE "Event"
  ALTER COLUMN "year" SET NOT NULL,
  ALTER COLUMN "year" SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

-- Move global name uniqueness to yearly uniqueness.
DROP INDEX IF EXISTS "Event_name_key";
CREATE UNIQUE INDEX "Event_year_name_key" ON "Event"("year", "name");
CREATE INDEX "Event_year_isArchived_isActive_idx" ON "Event"("year", "isArchived", "isActive");
CREATE INDEX "Event_year_isTemplate_idx" ON "Event"("year", "isTemplate");

-- Link yearly event copies back to template (optional relation).
ALTER TABLE "Event"
  ADD CONSTRAINT "Event_templateSourceId_fkey"
  FOREIGN KEY ("templateSourceId") REFERENCES "Event"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Optional denormalized year for event registrations.
ALTER TABLE "EventRegistration"
  ADD COLUMN "year" INTEGER;

UPDATE "EventRegistration" er
SET "year" = e."year"
FROM "Event" e
WHERE er."eventId" = e."id"
  AND er."year" IS NULL;

CREATE INDEX "EventRegistration_year_eventId_idx" ON "EventRegistration"("year", "eventId");
CREATE INDEX "EventRegistration_eventId_source_idx" ON "EventRegistration"("eventId", "source");
