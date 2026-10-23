-- 014_single_active_session_constraint.sql
-- Enforce at most one active JIT session per user at database level

USE `itds_db`;

-- 1. Clean up any expired or duplicate active sessions so each user has at most one active session
UPDATE `db_sessions`
SET `status` = 'expired', `mysql_password` = NULL
WHERE `status` = 'active' AND `end_time` <= NOW();

-- If a user still has more than one active session, retain only the newest one
UPDATE `db_sessions` s1
JOIN (
  SELECT user_id, MAX(id) as max_id
  FROM `db_sessions`
  WHERE `status` = 'active'
  GROUP BY user_id
  HAVING COUNT(*) > 1
) s2 ON s1.user_id = s2.user_id AND s1.id < s2.max_id
SET s1.status = 'revoked', s1.mysql_password = NULL
WHERE s1.status = 'active';

-- 2. Add virtual generated column and unique index
-- In MySQL 8, virtual columns can be indexed with UNIQUE.
-- active_user_id will be user_id when status='active', or NULL otherwise.
-- Since NULL != NULL in unique indexes, multiple expired/revoked sessions are allowed,
-- but strictly at most ONE active session per user is permitted.

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'itds_db' AND TABLE_NAME = 'db_sessions' AND COLUMN_NAME = 'active_user_id'
);

SET @sql_col = IF(@col_exists = 0,
  'ALTER TABLE `db_sessions` ADD COLUMN `active_user_id` INT GENERATED ALWAYS AS (CASE WHEN `status` = \'active\' THEN `user_id` ELSE NULL END) VIRTUAL',
  'SELECT "Column active_user_id already exists"'
);
PREPARE stmt_col FROM @sql_col;
EXECUTE stmt_col;
DEALLOCATE PREPARE stmt_col;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'itds_db' AND TABLE_NAME = 'db_sessions' AND INDEX_NAME = 'uk_user_single_active_session'
);

SET @sql_idx = IF(@idx_exists = 0,
  'ALTER TABLE `db_sessions` ADD UNIQUE KEY `uk_user_single_active_session` (`active_user_id`)',
  'SELECT "Index uk_user_single_active_session already exists"'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;
