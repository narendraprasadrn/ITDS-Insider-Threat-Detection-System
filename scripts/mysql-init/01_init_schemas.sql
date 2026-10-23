-- 01_init_schemas.sql
-- Create core schemas and privileged itds_admin user

CREATE DATABASE IF NOT EXISTS `itds_app`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `FinanceCorpDB`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `target_db`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Ensure general log is configured to write to TABLE
SET GLOBAL log_output = 'TABLE';
SET GLOBAL general_log = 'ON';

-- Create itds_admin user with privileges needed for:
-- 1. App database management (itds_app)
-- 2. Monitoring server general_log
-- 3. Dynamic JIT MySQL user provisioning (CREATE USER, GRANT OPTION on target_db)
-- 4. Session revocation / connection termination (PROCESS privilege for KILL command)
CREATE USER IF NOT EXISTS 'itds_admin'@'%' IDENTIFIED BY 'ItdsAdminPass123!';
CREATE USER IF NOT EXISTS 'itds_admin'@'localhost' IDENTIFIED BY 'ItdsAdminPass123!';

ALTER USER 'itds_admin'@'%' IDENTIFIED BY 'ItdsAdminPass123!';
ALTER USER 'itds_admin'@'localhost' IDENTIFIED BY 'ItdsAdminPass123!';

-- Target DB privileges (with grant option so it can grant table-level access to JIT users)
GRANT ALL PRIVILEGES ON `FinanceCorpDB`.* TO 'itds_admin'@'%' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON `FinanceCorpDB`.* TO 'itds_admin'@'localhost' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON `target_db`.* TO 'itds_admin'@'%' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON `target_db`.* TO 'itds_admin'@'localhost' WITH GRANT OPTION;

-- App DB privileges
GRANT ALL PRIVILEGES ON `itds_app`.* TO 'itds_admin'@'%' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON `itds_app`.* TO 'itds_admin'@'localhost' WITH GRANT OPTION;

-- Server-level administrative privileges for JIT user management & monitoring
GRANT CREATE USER, PROCESS, RELOAD ON *.* TO 'itds_admin'@'%' WITH GRANT OPTION;
GRANT CREATE USER, PROCESS, RELOAD ON *.* TO 'itds_admin'@'localhost' WITH GRANT OPTION;

-- Direct read access to general_log table
GRANT SELECT ON mysql.general_log TO 'itds_admin'@'%';
GRANT SELECT ON mysql.general_log TO 'itds_admin'@'localhost';

FLUSH PRIVILEGES;
