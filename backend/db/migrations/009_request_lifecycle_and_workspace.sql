-- backend/db/migrations/009_request_lifecycle_and_workspace.sql
-- Phase 11: Access Request Lifecycle, In-App Workspace & Reconciled Telemetry

USE `itds_app`;

-- 1. Enhance access_requests table to support full 6-state persistent lifecycle
ALTER TABLE `access_requests`
  MODIFY COLUMN `status` ENUM('pending', 'approved', 'denied', 'active', 'expired', 'revoked') NOT NULL DEFAULT 'pending',
  ADD COLUMN `session_id` INT NULL AFTER `profile_id`,
  ADD COLUMN `approved_by` INT NULL AFTER `session_id`,
  ADD COLUMN `approved_at` TIMESTAMP NULL AFTER `approved_by`,
  ADD COLUMN `activated_at` TIMESTAMP NULL AFTER `approved_at`,
  ADD COLUMN `expires_at` TIMESTAMP NULL AFTER `activated_at`,
  ADD COLUMN `revoked_at` TIMESTAMP NULL AFTER `expires_at`,
  ADD COLUMN `revoked_by` INT NULL AFTER `revoked_at`,
  ADD COLUMN `requested_operations` JSON NULL AFTER `decision_reasons`,
  ADD COLUMN `requested_resources` JSON NULL AFTER `requested_operations`,
  ADD INDEX `idx_ar_status` (`status`),
  ADD INDEX `idx_ar_session_id` (`session_id`),
  ADD CONSTRAINT `fk_ar_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ar_revoked_by` FOREIGN KEY (`revoked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- 2. Enhance sql_events to support pre-execution blocking and telemetry
ALTER TABLE `sql_events`
  MODIFY COLUMN `status` ENUM('attributed', 'unattributed', 'backend_internal', 'parse_error', 'blocked') NOT NULL DEFAULT 'attributed',
  ADD COLUMN `execution_time_ms` INT NULL AFTER `rows_hint`,
  ADD COLUMN `policy_decision` JSON NULL AFTER `flags`;

-- 3. Enhance policy_violations to support pre-execution blocking
ALTER TABLE `policy_violations`
  MODIFY COLUMN `enforcement_type` ENUM('blocked_by_db', 'detected_post_hoc', 'blocked_pre_execution') NOT NULL;
