BEGIN;
ALTER TABLE moa_app.ai_usage_event DROP CONSTRAINT ai_usage_event_operation_check;
ALTER TABLE moa_app.ai_usage_event ADD CONSTRAINT ai_usage_event_operation_check
  CHECK (operation IN ('chat','grounded','organize','query'));
COMMIT;
