BEGIN;

CREATE TABLE "moa_auth"."login_connection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "primaryOwnerUserId" TEXT NOT NULL REFERENCES "moa_auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "moa_auth"."login_connection_member" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "moa_auth"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "connectionId" TEXT NOT NULL REFERENCES "moa_auth"."login_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "slot" INTEGER NOT NULL CHECK ("slot" IN (1, 2)),
  UNIQUE ("connectionId", "slot")
);
CREATE INDEX "login_connection_member_connectionId_idx" ON "moa_auth"."login_connection_member"("connectionId");

REVOKE ALL ON "moa_auth"."login_connection", "moa_auth"."login_connection_member" FROM PUBLIC, moa_runtime;
DO $api_roles$
DECLARE api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON moa_auth.login_connection, moa_auth.login_connection_member FROM %I', api_role);
    END IF;
  END LOOP;
END
$api_roles$;
GRANT SELECT ON "moa_auth"."login_connection", "moa_auth"."login_connection_member" TO moa_runtime;

CREATE FUNCTION "moa_auth"."connect_login_accounts"(current_session TEXT, proof_token TEXT, expected_password TEXT, use_current_workspace BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE
  caller TEXT := nullif(current_setting('moa.user_id', true), '');
  peer TEXT; member_id TEXT; actual_password TEXT; connection_id TEXT;
BEGIN
  SELECT s."userId" INTO peer FROM "moa_auth"."session" s WHERE s.token = proof_token
    AND s."expiresAt" > CURRENT_TIMESTAMP AND s."createdAt" > CURRENT_TIMESTAMP - interval '5 minutes';
  IF caller IS NULL OR peer IS NULL OR caller = peer THEN RETURN false; END IF;
  FOR member_id IN SELECT unnest(ARRAY[caller, peer]) ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('moa-auth-methods:' || member_id, 0));
  END LOOP;
  -- SDK reset deletes sessions before updating the credential; avoid the opposite account/session lock order.
  PERFORM s.id FROM "moa_auth"."session" s WHERE s.id = current_session OR s.token = proof_token ORDER BY s.id FOR UPDATE;
  SELECT a.password INTO actual_password FROM "moa_auth"."account" a
    WHERE a."userId" = peer AND a."accountId" = peer AND a."providerId" = 'credential';
  IF actual_password IS NULL OR actual_password IS DISTINCT FROM expected_password THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM "moa_auth"."session" s WHERE s.id = current_session AND s."userId" = caller
      AND s."expiresAt" > CURRENT_TIMESTAMP AND s."createdAt" > CURRENT_TIMESTAMP - interval '24 hours')
    OR NOT EXISTS (SELECT 1 FROM "moa_auth"."session" s WHERE s.token = proof_token AND s."userId" = peer
      AND s."expiresAt" > CURRENT_TIMESTAMP AND s."createdAt" > CURRENT_TIMESTAMP - interval '5 minutes')
    OR NOT EXISTS (SELECT 1 FROM "moa_auth"."user" u WHERE u.id = peer AND u."emailVerified")
    OR NOT EXISTS (SELECT 1 FROM "moa_auth"."account" a WHERE a."userId" = caller)
    OR EXISTS (SELECT 1 FROM "moa_auth"."account" a WHERE a."userId" = caller AND a."providerId" NOT IN ('google', 'naver', 'kakao'))
    OR EXISTS (SELECT 1 FROM "moa_auth"."login_connection_member" m WHERE m."userId" IN (caller, peer))
    THEN RETURN false;
  END IF;
  connection_id := gen_random_uuid()::TEXT;
  INSERT INTO "moa_auth"."login_connection" (id, "primaryOwnerUserId")
    VALUES (connection_id, CASE WHEN use_current_workspace THEN caller ELSE peer END);
  INSERT INTO "moa_auth"."login_connection_member" ("userId", "connectionId", slot)
    VALUES (caller, connection_id, 1), (peer, connection_id, 2);
  DELETE FROM "moa_auth"."session" s WHERE s."userId" IN (caller, peer);
  RETURN true;
END
$function$;

CREATE FUNCTION "moa_auth"."select_connected_workspace"(current_session TEXT, selected_owner TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE
  caller TEXT := nullif(current_setting('moa.user_id', true), '');
  connection_id TEXT; member_id TEXT;
BEGIN
  SELECT m."connectionId" INTO connection_id FROM "moa_auth"."login_connection_member" m WHERE m."userId" = caller;
  IF connection_id IS NULL THEN RETURN false; END IF;
  FOR member_id IN SELECT m."userId" FROM "moa_auth"."login_connection_member" m WHERE m."connectionId" = connection_id ORDER BY m."userId" LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('moa-auth-methods:' || member_id, 0));
  END LOOP;
  PERFORM s.id FROM "moa_auth"."session" s WHERE s.id = current_session FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM "moa_auth"."session" s WHERE s.id = current_session AND s."userId" = caller
      AND s."expiresAt" > CURRENT_TIMESTAMP AND s."createdAt" > CURRENT_TIMESTAMP - interval '24 hours')
    OR NOT EXISTS (SELECT 1 FROM "moa_auth"."login_connection_member" m WHERE m."connectionId" = connection_id AND m."userId" = selected_owner)
    THEN RETURN false;
  END IF;
  UPDATE "moa_auth"."login_connection" SET "primaryOwnerUserId" = selected_owner WHERE id = connection_id;
  DELETE FROM "moa_auth"."session" s USING "moa_auth"."login_connection_member" m
    WHERE m."connectionId" = connection_id AND s."userId" = m."userId";
  RETURN true;
END
$function$;
CREATE FUNCTION "moa_auth"."disconnect_login_accounts"(current_session TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE
  caller TEXT := nullif(current_setting('moa.user_id', true), '');
  connection_id TEXT; member_id TEXT; member_ids TEXT[];
BEGIN
  SELECT m."connectionId" INTO connection_id FROM "moa_auth"."login_connection_member" m WHERE m."userId" = caller;
  IF connection_id IS NULL THEN RETURN false; END IF;
  SELECT array_agg(m."userId" ORDER BY m."userId") INTO member_ids
    FROM "moa_auth"."login_connection_member" m WHERE m."connectionId" = connection_id;
  FOREACH member_id IN ARRAY member_ids LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('moa-auth-methods:' || member_id, 0));
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM "moa_auth"."session" s WHERE s.id = current_session AND s."userId" = caller
      AND s."expiresAt" > CURRENT_TIMESTAMP AND s."createdAt" > CURRENT_TIMESTAMP - interval '24 hours')
    THEN RETURN false;
  END IF;
  DELETE FROM "moa_auth"."login_connection" WHERE id = connection_id;
  DELETE FROM "moa_auth"."session" s WHERE s."userId" = ANY(member_ids);
  RETURN true;
END
$function$;
REVOKE ALL ON FUNCTION "moa_auth"."connect_login_accounts"(TEXT, TEXT, TEXT, BOOLEAN), "moa_auth"."select_connected_workspace"(TEXT, TEXT), "moa_auth"."disconnect_login_accounts"(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "moa_auth"."connect_login_accounts"(TEXT, TEXT, TEXT, BOOLEAN), "moa_auth"."select_connected_workspace"(TEXT, TEXT), "moa_auth"."disconnect_login_accounts"(TEXT) TO moa_runtime;

-- Keep the authenticated caller in moa.user_id; membership grants read access, never ownership changes.
CREATE POLICY workspace_connected_read ON "moa_app"."workspace"
  FOR SELECT TO moa_runtime
  USING (EXISTS (
    SELECT 1 FROM "moa_auth"."login_connection_member" caller
    JOIN "moa_auth"."login_connection_member" owner ON owner."connectionId" = caller."connectionId"
    WHERE caller."userId" = nullif(current_setting('moa.user_id', true), '')
      AND owner."userId" = "workspace"."ownerUserId"
  ));

-- Password recovery must also invalidate sessions of the other connected identity atomically.
CREATE FUNCTION "moa_auth"."revoke_connected_password_sessions"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  IF NEW."providerId" = 'credential' AND NEW."password" IS DISTINCT FROM OLD."password" THEN
    DELETE FROM "moa_auth"."session" s USING "moa_auth"."login_connection_member" changed,
      "moa_auth"."login_connection_member" peer
    WHERE changed."userId" = NEW."userId" AND peer."connectionId" = changed."connectionId"
      AND s."userId" = peer."userId";
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION "moa_auth"."revoke_connected_password_sessions"() FROM PUBLIC;
CREATE TRIGGER revoke_connected_password_sessions AFTER UPDATE OF "password" ON "moa_auth"."account"
FOR EACH ROW EXECUTE FUNCTION "moa_auth"."revoke_connected_password_sessions"();

DO $function_roles$
DECLARE api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION moa_auth.connect_login_accounts(TEXT,TEXT,TEXT,BOOLEAN), moa_auth.select_connected_workspace(TEXT,TEXT), moa_auth.disconnect_login_accounts(TEXT), moa_auth.revoke_connected_password_sessions() FROM %I', api_role);
    END IF;
  END LOOP;
END
$function_roles$;

COMMIT;
