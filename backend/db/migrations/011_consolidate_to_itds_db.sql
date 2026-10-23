-- Migration 011: Consolidate ITDS into dedicated database `itds_db`
-- Creates dedicated database itds_db and ensures all ITDS tables and business tables exist in itds_db

CREATE DATABASE IF NOT EXISTS `itds_db`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `itds_db`.* TO 'itds_admin'@'%' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON `itds_db`.* TO 'itds_admin'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;

USE `itds_db`;

-- Update resources catalog to point to itds_db
UPDATE `itds_db`.`resources` SET `db_name` = 'itds_db' WHERE `db_name` = 'FinanceCorpDB';

-- Update active session resource grants to itds_db
UPDATE `itds_db`.`db_sessions` SET `granted_resources` = REPLACE(`granted_resources`, 'FinanceCorpDB.', 'itds_db.');
