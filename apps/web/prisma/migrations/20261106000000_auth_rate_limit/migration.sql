BEGIN;

CREATE TABLE "moa_auth"."rate_limit" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL,
  CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rate_limit_key_key" ON "moa_auth"."rate_limit"("key");
CREATE INDEX "rate_limit_lastRequest_idx" ON "moa_auth"."rate_limit"("lastRequest");
REVOKE ALL PRIVILEGES ON "moa_auth"."rate_limit" FROM PUBLIC;
DO $api_roles$
DECLARE api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE moa_auth.rate_limit FROM %I', api_role);
    END IF;
  END LOOP;
END
$api_roles$;
GRANT SELECT, INSERT, UPDATE, DELETE ON "moa_auth"."rate_limit" TO moa_runtime;

COMMIT;
