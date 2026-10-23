-- backend/db/migrations/012_deduplication_and_jit_credentials.sql
-- Idempotent deduplication, unique constraints, and ephemeral JIT credential storage

USE `itds_db`;

-- 1. Deduplicate existing sql_events on source_log_id
DELETE se1 FROM `sql_events` se1
INNER JOIN `sql_events` se2 
WHERE se1.id > se2.id 
  AND se1.source_log_id IS NOT NULL 
  AND se1.source_log_id != '' 
  AND se1.source_log_id = se2.source_log_id;

-- 2. Deduplicate existing policy_violations on (event_id, rule)
DELETE pv1 FROM `policy_violations` pv1
INNER JOIN `policy_violations` pv2
WHERE pv1.id > pv2.id 
  AND pv1.event_id IS NOT NULL 
  AND pv1.event_id = pv2.event_id 
  AND pv1.rule = pv2.rule;

-- 3. Deduplicate existing alerts on (session_id, status) where status IN ('open', 'investigating')
DELETE a1 FROM `alerts` a1
INNER JOIN `alerts` a2
WHERE a1.id > a2.id
  AND a1.session_id IS NOT NULL
  AND a1.session_id = a2.session_id
  AND a1.status IN ('open', 'investigating')
  AND a2.status IN ('open', 'investigating');
