-- Cluster-level prerequisite; deliberately outside replayable schema migrations.
-- This creates no password. Production credentials must be provisioned separately.
DO $runtime_role$
DECLARE
  target pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO target FROM pg_roles WHERE rolname = 'moa_runtime';

  IF NOT FOUND THEN
    CREATE ROLE moa_runtime LOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    IF target.rolsuper OR target.rolinherit OR target.rolcreatedb
      OR target.rolcreaterole OR target.rolreplication OR target.rolbypassrls
      OR NOT target.rolcanlogin THEN
      RAISE EXCEPTION 'Existing moa_runtime privileges require manual review';
    END IF;

    -- A non-superuser creator retains ADMIN membership. Only this trusted DDL caller is allowed.
    IF EXISTS (
      SELECT 1 FROM pg_auth_members
      WHERE member = target.oid
        OR (roleid = target.oid AND member <> (SELECT oid FROM pg_roles WHERE rolname = current_user))
    )
      OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = target.oid)
      OR EXISTS (SELECT 1 FROM pg_class WHERE relowner = target.oid)
      OR EXISTS (SELECT 1 FROM pg_database WHERE datdba = target.oid) THEN
      RAISE EXCEPTION 'Existing moa_runtime membership or ownership requires manual review';
    END IF;
  END IF;
END
$runtime_role$;
