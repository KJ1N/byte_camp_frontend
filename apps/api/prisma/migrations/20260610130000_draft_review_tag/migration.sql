CREATE TYPE "DraftReviewStatus" AS ENUM ('NEEDS_REVIEW', 'REVIEWED');

ALTER TABLE "drafts"
ADD COLUMN "reviewStatus" "DraftReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
ADD COLUMN "reviewedVersion" INTEGER,
ADD COLUMN "reviewAuditRecordId" TEXT,
ADD COLUMN "reviewScoreId" TEXT;
