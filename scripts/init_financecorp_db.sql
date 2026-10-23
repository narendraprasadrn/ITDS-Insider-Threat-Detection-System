-- scripts/init_financecorp_db.sql
-- FinanceCorpDB 10 Business Tables Schema Definition

CREATE DATABASE IF NOT EXISTS `FinanceCorpDB`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `FinanceCorpDB`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `SecurityAuditLogs`;
DROP TABLE IF EXISTS `TaxRecords`;
DROP TABLE IF EXISTS `BudgetReports`;
DROP TABLE IF EXISTS `VendorContracts`;
DROP TABLE IF EXISTS `Payroll`;
DROP TABLE IF EXISTS `Orders`;
DROP TABLE IF EXISTS `Transactions`;
DROP TABLE IF EXISTS `Products`;
DROP TABLE IF EXISTS `Customers`;
DROP TABLE IF EXISTS `Employees`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Employees
CREATE TABLE `Employees` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_code` VARCHAR(20) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `department` VARCHAR(50) NOT NULL,
  `job_title` VARCHAR(80) NOT NULL,
  `email` VARCHAR(120) NOT NULL UNIQUE,
  `status` ENUM('active', 'on_leave', 'terminated') NOT NULL DEFAULT 'active',
  `hire_date` DATE NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_emp_dept` (`department`),
  INDEX `idx_emp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Customers
CREATE TABLE `Customers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_code` VARCHAR(20) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `contact_email` VARCHAR(120) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `customer_category` ENUM('retail', 'commercial', 'enterprise', 'vip') NOT NULL DEFAULT 'retail',
  `credit_limit` DECIMAL(12,2) NOT NULL DEFAULT 5000.00,
  `status` ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_cust_cat` (`customer_category`),
  INDEX `idx_cust_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Transactions
CREATE TABLE `Transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `transaction_code` VARCHAR(30) NOT NULL UNIQUE,
  `customer_id` INT NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `transaction_type` ENUM('deposit', 'withdrawal', 'wire_transfer', 'ach', 'card_payment') NOT NULL,
  `transaction_date` DATETIME NOT NULL,
  `status` ENUM('settled', 'pending', 'reversed', 'flagged') NOT NULL DEFAULT 'settled',
  `reference_note` VARCHAR(255) NULL,
  CONSTRAINT `fk_txn_customer` FOREIGN KEY (`customer_id`) REFERENCES `Customers` (`id`) ON DELETE CASCADE,
  INDEX `idx_txn_date` (`transaction_date`),
  INDEX `idx_txn_type` (`transaction_type`),
  INDEX `idx_txn_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Products
CREATE TABLE `Products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_code` VARCHAR(20) NOT NULL UNIQUE,
  `product_name` VARCHAR(100) NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `stock_quantity` INT NOT NULL DEFAULT 0,
  `status` ENUM('available', 'discontinued', 'backordered') NOT NULL DEFAULT 'available',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_prod_cat` (`category`),
  INDEX `idx_prod_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Orders
CREATE TABLE `Orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_number` VARCHAR(30) NOT NULL UNIQUE,
  `customer_id` INT NOT NULL,
  `order_date` DATETIME NOT NULL,
  `order_status` ENUM('submitted', 'processing', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'submitted',
  `total_amount` DECIMAL(12,2) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_ord_customer` FOREIGN KEY (`customer_id`) REFERENCES `Customers` (`id`) ON DELETE CASCADE,
  INDEX `idx_ord_date` (`order_date`),
  INDEX `idx_ord_status` (`order_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Payroll (Highly Sensitive - Critical)
CREATE TABLE `Payroll` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `salary_amount` DECIMAL(12,2) NOT NULL,
  `bonus_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `pay_period` VARCHAR(20) NOT NULL,
  `bank_account_masked` VARCHAR(30) NOT NULL,
  `payment_status` ENUM('processed', 'pending', 'held', 'rejected') NOT NULL DEFAULT 'processed',
  `payment_date` DATE NOT NULL,
  CONSTRAINT `fk_pay_employee` FOREIGN KEY (`employee_id`) REFERENCES `Employees` (`id`) ON DELETE CASCADE,
  INDEX `idx_pay_period` (`pay_period`),
  INDEX `idx_pay_status` (`payment_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. VendorContracts
CREATE TABLE `VendorContracts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `contract_code` VARCHAR(30) NOT NULL UNIQUE,
  `vendor_name` VARCHAR(120) NOT NULL,
  `service_scope` VARCHAR(150) NOT NULL,
  `contract_value` DECIMAL(14,2) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `status` ENUM('active', 'pending_renewal', 'expired', 'terminated') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_contract_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. BudgetReports
CREATE TABLE `BudgetReports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `report_code` VARCHAR(30) NOT NULL UNIQUE,
  `department` VARCHAR(50) NOT NULL,
  `reporting_period` VARCHAR(20) NOT NULL,
  `allocated_budget` DECIMAL(14,2) NOT NULL,
  `actual_expenditure` DECIMAL(14,2) NOT NULL,
  `variance_amount` DECIMAL(14,2) GENERATED ALWAYS AS (`allocated_budget` - `actual_expenditure`) STORED,
  `approval_status` ENUM('approved', 'draft', 'under_review') NOT NULL DEFAULT 'approved',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_budget_dept` (`department`),
  INDEX `idx_budget_period` (`reporting_period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. TaxRecords (Highly Sensitive - Critical)
CREATE TABLE `TaxRecords` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tax_record_code` VARCHAR(30) NOT NULL UNIQUE,
  `employee_id` INT NULL,
  `entity_type` ENUM('individual', 'corporate') NOT NULL DEFAULT 'individual',
  `tax_period` VARCHAR(20) NOT NULL,
  `taxable_income` DECIMAL(14,2) NOT NULL,
  `tax_amount` DECIMAL(14,2) NOT NULL,
  `filing_status` ENUM('filed', 'pending', 'audited', 'amended') NOT NULL DEFAULT 'filed',
  `filing_date` DATE NOT NULL,
  CONSTRAINT `fk_tax_employee` FOREIGN KEY (`employee_id`) REFERENCES `Employees` (`id`) ON DELETE SET NULL,
  INDEX `idx_tax_period` (`tax_period`),
  INDEX `idx_tax_status` (`filing_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. SecurityAuditLogs (Sensitive Security Telemetry - Critical)
CREATE TABLE `SecurityAuditLogs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `event_id` VARCHAR(50) NOT NULL UNIQUE,
  `actor_id` VARCHAR(80) NOT NULL,
  `event_type` VARCHAR(60) NOT NULL,
  `resource` VARCHAR(120) NOT NULL,
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `outcome` ENUM('ALLOW', 'DENY', 'REVIEW', 'ALERT') NOT NULL,
  `metadata_safe` JSON NULL,
  INDEX `idx_audit_actor` (`actor_id`),
  INDEX `idx_audit_event_type` (`event_type`),
  INDEX `idx_audit_outcome` (`outcome`),
  INDEX `idx_audit_time` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
