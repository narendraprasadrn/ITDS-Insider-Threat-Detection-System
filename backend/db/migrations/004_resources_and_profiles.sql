-- 004_resources_and_profiles.sql
-- Phase 3: Resources and Reusable Access Profiles schema & initial seeds

USE `itds_app`;

DROP TABLE IF EXISTS `role_profiles`;
DROP TABLE IF EXISTS `profile_resources`;
DROP TABLE IF EXISTS `access_profiles`;
DROP TABLE IF EXISTS `resources`;

-- 1. Resources table (database tables protected by ITDS)
CREATE TABLE `resources` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `db_name` VARCHAR(60) NOT NULL,
  `table_name` VARCHAR(60) NOT NULL,
  `sensitivity` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_db_table` (`db_name`, `table_name`)
) ENGINE=InnoDB;

-- 2. Access Profiles table
CREATE TABLE `access_profiles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT NOT NULL,
  `allowed_operations` JSON NOT NULL, -- e.g. ["SELECT"], ["SELECT", "INSERT"]
  `max_duration_minutes` INT NOT NULL DEFAULT 60,
  `max_rows_hint` INT DEFAULT 1000,
  `risk_level` ENUM('low', 'medium', 'high', 'critical') DEFAULT 'low',
  `requires_approval` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Mapping: Profile to Resources
CREATE TABLE `profile_resources` (
  `profile_id` INT NOT NULL,
  `resource_id` INT NOT NULL,
  PRIMARY KEY (`profile_id`, `resource_id`),
  CONSTRAINT `fk_pr_profile` FOREIGN KEY (`profile_id`) REFERENCES `access_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pr_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Mapping: Role to Profiles (which roles may request which profiles)
CREATE TABLE `role_profiles` (
  `role_id` INT NOT NULL,
  `profile_id` INT NOT NULL,
  PRIMARY KEY (`role_id`, `profile_id`),
  CONSTRAINT `fk_rp2_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp2_profile` FOREIGN KEY (`profile_id`) REFERENCES `access_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================================
-- SEED DATA
-- ==========================================

-- Seed Resources from FinanceCorpDB (10 Business Tables)
INSERT INTO `resources` (`id`, `db_name`, `table_name`, `sensitivity`, `description`) VALUES
(1, 'FinanceCorpDB', 'Employees', 'medium', 'Enterprise personnel roster, organizational hierarchy, and job titles'),
(2, 'FinanceCorpDB', 'Customers', 'medium', 'Customer contact records, categorization, and commercial credit limits'),
(3, 'FinanceCorpDB', 'Transactions', 'high', 'Customer financial payments, wire transfers, ACH settlements, and transaction ledgers'),
(4, 'FinanceCorpDB', 'Products', 'low', 'Catalog of security software products, hardware appliances, and pricing'),
(5, 'FinanceCorpDB', 'Orders', 'medium', 'Customer sales orders, fulfillment tracking, and total invoice amounts'),
(6, 'FinanceCorpDB', 'Payroll', 'critical', 'Confidential employee salaries, bonuses, and banking payment disbursement details'),
(7, 'FinanceCorpDB', 'VendorContracts', 'medium', 'Third-party vendor service agreements, procurement scopes, and contract values'),
(8, 'FinanceCorpDB', 'BudgetReports', 'high', 'Departmental budget allocations, actual expenditures, and quarterly variances'),
(9, 'FinanceCorpDB', 'TaxRecords', 'critical', 'Corporate and individual tax filings, taxable income, and regulatory tax assessments'),
(10, 'FinanceCorpDB', 'SecurityAuditLogs', 'critical', 'Internal security audit events, authorization decisions, and access telemetry');

-- Seed Reusable Access Profiles
INSERT INTO `access_profiles` (`id`, `name`, `description`, `allowed_operations`, `max_duration_minutes`, `max_rows_hint`, `risk_level`, `requires_approval`) VALUES
(1, 'Developer Read Profile', 'Approved read-only access to products, customers, and orders for routine application development', '["SELECT"]', 120, 500, 'low', FALSE),
(2, 'Developer Work Profile', 'Approved read and write operations on designated application development tables', '["SELECT", "INSERT", "UPDATE"]', 60, 200, 'medium', FALSE),
(3, 'DBA Operations Profile', 'Operational database monitoring and routine data maintenance across operational tables', '["SELECT", "INSERT", "UPDATE"]', 120, 2000, 'high', FALSE),
(4, 'DBA Maintenance Profile', 'Full administrative database access including DDL schema alterations and table maintenance', '["SELECT", "INSERT", "UPDATE", "DELETE", "DDL"]', 60, 5000, 'high', TRUE),
(5, 'Executive Payroll & Compensation', 'Highly sensitive read access to employee records, compensation ledgers, and tax filings', '["SELECT"]', 45, 100, 'critical', TRUE),
(6, 'Financial Audit & Tax Reporting', 'Financial reconciliation of corporate transactions, orders, vendor contracts, and tax filings', '["SELECT"]', 90, 1000, 'high', TRUE),
(7, 'Admin Security Administration', 'Complete authorized security administration across all ten business tables and audit logs', '["SELECT", "INSERT", "UPDATE", "DELETE"]', 60, 5000, 'critical', FALSE);

-- Profile Resources Mapping
INSERT INTO `profile_resources` (`profile_id`, `resource_id`) VALUES
-- 1. Developer Read: Products (4), Customers (2), Orders (5)
(1, 4), (1, 2), (1, 5),
-- 2. Developer Work: Products (4), Orders (5)
(2, 4), (2, 5),
-- 3. DBA Operations: Employees (1), Customers (2), Transactions (3), Products (4), Orders (5), VendorContracts (7), BudgetReports (8)
(3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 7), (3, 8),
-- 4. DBA Maintenance: All 10 tables
(4, 1), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (4, 7), (4, 8), (4, 9), (4, 10),
-- 5. Executive Payroll: Employees (1), Payroll (6), TaxRecords (9)
(5, 1), (5, 6), (5, 9),
-- 6. Financial Audit: Transactions (3), Orders (5), VendorContracts (7), BudgetReports (8), TaxRecords (9)
(6, 3), (6, 5), (6, 7), (6, 8), (6, 9),
-- 7. Admin Security Administration: All 10 tables
(7, 1), (7, 2), (7, 3), (7, 4), (7, 5), (7, 6), (7, 7), (7, 8), (7, 9), (7, 10);

-- Role-Profiles Mapping (Roles: 1:admin, 2:dba, 3:developer)
INSERT INTO `role_profiles` (`role_id`, `profile_id`) VALUES
-- Admin may request any profile
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7),
-- DBA: Developer Read (1), DBA Operations (3), DBA Maintenance (4), Financial Audit (6)
(2, 1), (2, 3), (2, 4), (2, 6),
-- Developer: Developer Read (1), Developer Work (2), Executive Payroll (5)
(3, 1), (3, 2), (3, 5);
