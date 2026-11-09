BEGIN;
CREATE TABLE moa_app.ai_usage_event (
  id text PRIMARY KEY,
  "workspaceId" text NOT NULL REFERENCES moa_app.workspace(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "requestId" text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai','gemini')),
  operation text NOT NULL CHECK (operation IN ('chat','grounded','organize')),
  status text NOT NULL CHECK (status IN ('reserved','completed','unknown')),
  model text,
  "inputTokens" integer CHECK ("inputTokens" >= 0),
  "outputTokens" integer CHECK ("outputTokens" >= 0),
  "totalTokens" integer CHECK ("totalTokens" >= 0),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" timestamp(3),
  UNIQUE ("workspaceId", "requestId")
);
CREATE INDEX ai_usage_event_workspace_created_idx ON moa_app.ai_usage_event("workspaceId", "createdAt");
REVOKE ALL ON moa_app.ai_usage_event FROM PUBLIC;
DO $api_roles$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON moa_app.ai_usage_event FROM %I', api_role);
    END IF;
  END LOOP;
END
$api_roles$;
GRANT SELECT, INSERT, UPDATE, DELETE ON moa_app.ai_usage_event TO moa_runtime;
ALTER TABLE moa_app.ai_usage_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE moa_app.ai_usage_event FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_workspace ON moa_app.ai_usage_event FOR ALL TO moa_runtime
USING (EXISTS (SELECT 1 FROM moa_app.workspace w WHERE w.id = "workspaceId"))
WITH CHECK (EXISTS (SELECT 1 FROM moa_app.workspace w WHERE w.id = "workspaceId"));
COMMIT;
