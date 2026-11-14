BEGIN;

ALTER TABLE "moa_auth"."user" ADD COLUMN "workspaceGuideSeenAt" TIMESTAMP(3);

-- Existing members keep their current experience; new accounts start with NULL.
UPDATE "moa_auth"."user" SET "workspaceGuideSeenAt" = CURRENT_TIMESTAMP;

COMMIT;
