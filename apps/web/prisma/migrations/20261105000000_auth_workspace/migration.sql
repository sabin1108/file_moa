BEGIN;

-- setup-runtime-role.sql is a reviewed cluster prerequisite, not a shadow-DB migration.
DO $runtime_precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'moa_runtime' AND rolcanlogin
      AND NOT (rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) OR EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.member OR r.oid = m.roleid
    WHERE r.rolname = 'moa_runtime'
      AND (m.member = r.oid OR m.member <> (SELECT oid FROM pg_roles WHERE rolname = current_user))
  ) OR EXISTS (
    SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner WHERE r.rolname = 'moa_runtime'
  ) OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE r.rolname = 'moa_runtime'
  ) OR EXISTS (
    SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE r.rolname = 'moa_runtime'
  ) THEN
    RAISE EXCEPTION 'Run and review setup-runtime-role.sql before applying this migration';
  END IF;
END
$runtime_precondition$;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "moa_app";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "moa_auth";

-- CreateTable
CREATE TABLE "moa_auth"."user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moa_auth"."session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moa_auth"."account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moa_auth"."verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moa_app"."workspace" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "moa_auth"."user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "moa_auth"."session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "moa_auth"."session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "moa_auth"."account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "moa_auth"."account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "moa_auth"."verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_ownerUserId_key" ON "moa_app"."workspace"("ownerUserId");

-- AddForeignKey
ALTER TABLE "moa_auth"."session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "moa_auth"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moa_auth"."account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "moa_auth"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moa_app"."workspace" ADD CONSTRAINT "workspace_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "moa_auth"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Authentication happens before a user context exists. Only the server role may access these tables.
REVOKE ALL PRIVILEGES ON SCHEMA "moa_auth", "moa_app" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "moa_auth", "moa_app" FROM PUBLIC;

-- Supabase installations may have default grants. Revoke only our app schemas, if those roles exist.
DO $api_roles$
DECLARE
  api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA moa_auth, moa_app FROM %I', api_role);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA moa_auth, moa_app FROM %I', api_role);
    END IF;
  END LOOP;
END
$api_roles$;

GRANT USAGE ON SCHEMA "moa_auth", "moa_app" TO moa_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "moa_auth"."user", "moa_auth"."session", "moa_auth"."account", "moa_auth"."verification" TO moa_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "moa_app"."workspace" TO moa_runtime;

ALTER TABLE "moa_app"."workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "moa_app"."workspace" FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_owner ON "moa_app"."workspace"
  FOR ALL TO moa_runtime
  USING ("ownerUserId" = nullif(current_setting('moa.user_id', true), ''))
  WITH CHECK ("ownerUserId" = nullif(current_setting('moa.user_id', true), ''));

COMMIT;
