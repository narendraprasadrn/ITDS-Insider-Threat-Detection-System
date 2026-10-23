-- scripts/seed_financecorp_db.sql
-- Synthetic sample data for FinanceCorpDB across all 10 business tables

USE `FinanceCorpDB`;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE `SecurityAuditLogs`;
TRUNCATE TABLE `TaxRecords`;
TRUNCATE TABLE `BudgetReports`;
TRUNCATE TABLE `VendorContracts`;
TRUNCATE TABLE `Payroll`;
TRUNCATE TABLE `Orders`;
TRUNCATE TABLE `Transactions`;
TRUNCATE TABLE `Products`;
TRUNCATE TABLE `Customers`;
TRUNCATE TABLE `Employees`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Employees (20 records across 5 departments)
INSERT INTO `Employees` (`id`, `employee_code`, `name`, `department`, `job_title`, `email`, `status`, `hire_date`) VALUES
(1, 'EMP-1001', 'Alexander Wright', 'Executive', 'Chief Technology Officer', 'alex.wright@financecorp.internal', 'active', '2021-03-15'),
(2, 'EMP-1002', 'Elena Rostova', 'Engineering', 'Lead Security Architect', 'elena.rostova@financecorp.internal', 'active', '2021-06-01'),
(3, 'EMP-1003', 'Marcus Brody', 'Engineering', 'Senior Database Administrator', 'marcus.brody@financecorp.internal', 'active', '2022-01-10'),
(4, 'EMP-1004', 'Sarah Chen', 'Engineering', 'Senior Backend Engineer', 'sarah.chen@financecorp.internal', 'active', '2022-04-18'),
(5, 'EMP-1005', 'David Kim', 'Engineering', 'Full Stack Developer', 'david.kim@financecorp.internal', 'active', '2023-02-01'),
(6, 'EMP-1006', 'Rachel Green', 'Finance', 'Director of Financial Operations', 'rachel.green@financecorp.internal', 'active', '2020-11-05'),
(7, 'EMP-1007', 'Michael Vance', 'Finance', 'Senior Financial Analyst', 'michael.vance@financecorp.internal', 'active', '2022-08-20'),
(8, 'EMP-1008', 'Olivia Diaz', 'Finance', 'Staff Accountant & Tax Officer', 'olivia.diaz@financecorp.internal', 'active', '2023-01-15'),
(9, 'EMP-1009', 'Jonathan Price', 'Operations', 'VP of Enterprise Operations', 'jonathan.price@financecorp.internal', 'active', '2021-09-01'),
(10, 'EMP-1010', 'Kelly Kapoor', 'Operations', 'Procurement & Vendor Manager', 'kelly.kapoor@financecorp.internal', 'active', '2022-05-12'),
(11, 'EMP-1011', 'Brian O\'Connor', 'Sales', 'Global Sales Director', 'brian.oconnor@financecorp.internal', 'active', '2021-07-22'),
(12, 'EMP-1012', 'Jessica Pearson', 'Sales', 'Enterprise Account Executive', 'jessica.pearson@financecorp.internal', 'active', '2022-09-15'),
(13, 'EMP-1013', 'Harvey Specter', 'Legal', 'General Counsel', 'harvey.specter@financecorp.internal', 'active', '2020-04-01'),
(14, 'EMP-1014', 'Donna Paulsen', 'Operations', 'Executive Operations Coordinator', 'donna.paulsen@financecorp.internal', 'active', '2021-01-15'),
(15, 'EMP-1015', 'Louis Litt', 'Finance', 'Senior Financial Compliance Auditor', 'louis.litt@financecorp.internal', 'active', '2021-05-20'),
(16, 'EMP-1016', 'Toby Flenderson', 'HR', 'HR Compliance Specialist', 'toby.flenderson@financecorp.internal', 'active', '2022-02-14'),
(17, 'EMP-1017', 'Angela Martin', 'Finance', 'Senior Payroll Accountant', 'angela.martin@financecorp.internal', 'active', '2021-10-01'),
(18, 'EMP-1018', 'Oscar Martinez', 'Finance', 'Senior Budget Analyst', 'oscar.martinez@financecorp.internal', 'active', '2022-03-30'),
(19, 'EMP-1019', 'Kevin Malone', 'Operations', 'Inventory & Logistics Associate', 'kevin.malone@financecorp.internal', 'on_leave', '2023-06-10'),
(20, 'EMP-1020', 'Ryan Howard', 'Sales', 'Business Development Representative', 'ryan.howard@financecorp.internal', 'active', '2024-01-08');

-- 2. Customers (15 records)
INSERT INTO `Customers` (`id`, `customer_code`, `name`, `contact_email`, `phone`, `customer_category`, `credit_limit`, `status`) VALUES
(1, 'CUST-001', 'Apex Global Logistics', 'ops@apexlogistics.com', '+1-555-0101', 'enterprise', 500000.00, 'active'),
(2, 'CUST-002', 'Beacon Financial Advisors', 'billing@beaconfin.com', '+1-555-0102', 'vip', 750000.00, 'active'),
(3, 'CUST-003', 'Cascade Health Systems', 'procure@cascadehealth.org', '+1-555-0103', 'enterprise', 600000.00, 'active'),
(4, 'CUST-004', 'Delta Dynamics Robotics', 'contact@deltarobotics.io', '+1-555-0104', 'commercial', 250000.00, 'active'),
(5, 'CUST-005', 'Echelon Energy Partners', 'treasury@echelonenergy.com', '+1-555-0105', 'enterprise', 1000000.00, 'active'),
(6, 'CUST-006', 'Frontier Digital Media', 'accounts@frontiermedia.com', '+1-555-0106', 'commercial', 150000.00, 'active'),
(7, 'CUST-007', 'Guardian Biometrics', 'security@guardianbio.com', '+1-555-0107', 'commercial', 200000.00, 'active'),
(8, 'CUST-008', 'Horizon Capital Holdings', 'ir@horizoncap.com', '+1-555-0108', 'vip', 1250000.00, 'active'),
(9, 'CUST-009', 'Infinity Cloud Networks', 'billing@infinitycloud.net', '+1-555-0109', 'enterprise', 450000.00, 'active'),
(10, 'CUST-010', 'Jupiter Retail Brands', 'finance@jupiterretail.com', '+1-555-0110', 'commercial', 180000.00, 'active'),
(11, 'CUST-011', 'Keystone Municipal Water', 'treasury@keystonewater.gov', '+1-555-0111', 'commercial', 300000.00, 'active'),
(12, 'CUST-012', 'Lighthouse Maritime Shipping', 'accounts@lighthousemarine.com', '+1-555-0112', 'enterprise', 850000.00, 'active'),
(13, 'CUST-013', 'Monarch Aviation Services', 'charter@monarchaviation.com', '+1-555-0113', 'vip', 900000.00, 'active'),
(14, 'CUST-014', 'Nexus Bio-Pharmaceuticals', 'payments@nexusbiopharm.com', '+1-555-0114', 'enterprise', 700000.00, 'active'),
(15, 'CUST-015', 'Orion Spacecraft Technologies', 'contracts@orionspace.io', '+1-555-0115', 'vip', 1500000.00, 'active');

-- 3. Products (15 records)
INSERT INTO `Products` (`id`, `product_code`, `product_name`, `category`, `price`, `stock_quantity`, `status`) VALUES
(1, 'PRD-01', 'Cloud Database Shield Pro', 'Cybersecurity', 12500.00, 100, 'available'),
(2, 'PRD-02', 'Zero-Trust API Gateway v4', 'Cybersecurity', 18900.00, 85, 'available'),
(3, 'PRD-03', 'Enterprise Threat Intelligence Feed', 'Data Services', 7500.00, 500, 'available'),
(4, 'PRD-04', 'Automated Compliance Auditor 2026', 'Compliance', 9200.00, 60, 'available'),
(5, 'PRD-05', 'Secure Enclave Storage (100TB)', 'Infrastructure', 24000.00, 40, 'available'),
(6, 'PRD-06', 'High-Speed Packet Inspection Appliance', 'Hardware', 35000.00, 25, 'available'),
(7, 'PRD-07', 'Immutable Audit Ledger Appliance', 'Hardware', 42000.00, 15, 'available'),
(8, 'PRD-08', 'Identity & Access Broker Engine', 'Identity', 14500.00, 90, 'available'),
(9, 'PRD-09', 'Continuous Policy Enforcement Agent', 'Software', 6800.00, 300, 'available'),
(10, 'PRD-10', 'Database Forensic Analyzer Enterprise', 'Analytics', 16500.00, 45, 'available'),
(11, 'PRD-11', 'Distributed Vault Key Manager', 'Cryptography', 21000.00, 35, 'available'),
(12, 'PRD-12', 'SIEM Correlation Pipeline Connector', 'Integration', 5400.00, 120, 'available'),
(13, 'PRD-13', 'Real-time Risk Scoring Dashboard Addon', 'Software', 8800.00, 75, 'available'),
(14, 'PRD-14', 'Legacy Mainframe Audit Relay', 'Integration', 11200.00, 20, 'available'),
(15, 'PRD-15', 'Disaster Recovery Warm Sync Engine', 'Infrastructure', 28500.00, 30, 'available');

-- 4. Transactions (20 financial ledger transactions)
INSERT INTO `Transactions` (`id`, `transaction_code`, `customer_id`, `amount`, `transaction_type`, `transaction_date`, `status`, `reference_note`) VALUES
(1, 'TXN-9001', 1, 125000.00, 'wire_transfer', '2026-10-01 09:15:00', 'settled', 'Invoice #INV-2026-081 settlement'),
(2, 'TXN-9002', 2, 75400.00, 'ach', '2026-10-02 11:30:00', 'settled', 'Monthly subscription retainer'),
(3, 'TXN-9003', 3, 210000.00, 'wire_transfer', '2026-10-03 14:45:00', 'settled', 'Healthcare HIPAA security suite order'),
(4, 'TXN-9004', 4, 38500.00, 'card_payment', '2026-10-04 10:20:00', 'settled', 'Robotics gateway initial licensing'),
(5, 'TXN-9005', 5, 450000.00, 'wire_transfer', '2026-10-05 16:10:00', 'settled', 'Energy grid telemetry monitoring'),
(6, 'TXN-9006', 6, 18900.00, 'ach', '2026-10-06 13:05:00', 'settled', 'Digital media streaming license renewal'),
(7, 'TXN-9007', 7, 62000.00, 'wire_transfer', '2026-10-07 09:40:00', 'settled', 'Biometric scanner gateway integration'),
(8, 'TXN-9008', 8, 890000.00, 'wire_transfer', '2026-10-08 15:55:00', 'settled', 'Capital holding multi-tenant security vault'),
(9, 'TXN-9009', 9, 142000.00, 'ach', '2026-10-09 11:15:00', 'settled', 'Infinity cloud gateway cluster'),
(10, 'TXN-9010', 10, 48000.00, 'card_payment', '2026-10-10 14:00:00', 'settled', 'Retail point-of-sale audit telemetry'),
(11, 'TXN-9011', 11, 95000.00, 'wire_transfer', '2026-10-11 10:50:00', 'settled', 'Municipal water SCADA database hardening'),
(12, 'TXN-9012', 12, 310000.00, 'wire_transfer', '2026-10-12 16:30:00', 'settled', 'Maritime fleet encryption appliances'),
(13, 'TXN-9013', 13, 275000.00, 'wire_transfer', '2026-10-13 12:10:00', 'settled', 'Aviation flight record audit logger'),
(14, 'TXN-9014', 14, 520000.00, 'wire_transfer', '2026-10-14 17:20:00', 'settled', 'Bio-pharm clinical trial secure database enclave'),
(15, 'TXN-9015', 15, 780000.00, 'wire_transfer', '2026-10-15 15:00:00', 'settled', 'Orbital satellite telemetry security array'),
(16, 'TXN-9016', 1, 15000.00, 'card_payment', '2026-10-16 11:45:00', 'settled', 'Emergency support add-on'),
(17, 'TXN-9017', 2, 4500.00, 'deposit', '2026-10-17 14:15:00', 'settled', 'Refund deposit adjustment'),
(18, 'TXN-9018', 4, 125000.00, 'wire_transfer', '2026-10-18 16:00:00', 'pending', 'Annual platform upgrade order pending clearing'),
(19, 'TXN-9019', 7, 98000.00, 'wire_transfer', '2026-10-19 13:30:00', 'flagged', 'Velocity check flagged for secondary review'),
(20, 'TXN-9020', 10, 5200.00, 'card_payment', '2026-10-20 10:00:00', 'reversed', 'Duplicate transaction reversal');

-- 5. Orders (15 records)
INSERT INTO `Orders` (`id`, `order_number`, `customer_id`, `order_date`, `order_status`, `total_amount`) VALUES
(1, 'ORD-2026-101', 1, '2026-10-01 08:30:00', 'delivered', 125000.00),
(2, 'ORD-2026-102', 2, '2026-10-02 10:15:00', 'delivered', 75400.00),
(3, 'ORD-2026-103', 3, '2026-10-03 13:40:00', 'shipped', 210000.00),
(4, 'ORD-2026-104', 4, '2026-10-04 09:50:00', 'shipped', 38500.00),
(5, 'ORD-2026-105', 5, '2026-10-05 15:20:00', 'delivered', 450000.00),
(6, 'ORD-2026-106', 6, '2026-10-06 11:00:00', 'processing', 18900.00),
(7, 'ORD-2026-107', 7, '2026-10-07 08:45:00', 'shipped', 62000.00),
(8, 'ORD-2026-108', 8, '2026-10-08 14:10:00', 'delivered', 890000.00),
(9, 'ORD-2026-109', 9, '2026-10-09 10:30:00', 'delivered', 142000.00),
(10, 'ORD-2026-110', 10, '2026-10-10 12:50:00', 'processing', 48000.00),
(11, 'ORD-2026-111', 11, '2026-10-11 09:20:00', 'shipped', 95000.00),
(12, 'ORD-2026-112', 12, '2026-10-12 15:00:00', 'processing', 310000.00),
(13, 'ORD-2026-113', 13, '2026-10-13 11:15:00', 'submitted', 275000.00),
(14, 'ORD-2026-114', 14, '2026-10-14 16:40:00', 'submitted', 520000.00),
(15, 'ORD-2026-115', 15, '2026-10-15 14:05:00', 'submitted', 780000.00);

-- 6. Payroll (Highly Sensitive - 20 records matching Employees)
INSERT INTO `Payroll` (`id`, `employee_id`, `salary_amount`, `bonus_amount`, `pay_period`, `bank_account_masked`, `payment_status`, `payment_date`) VALUES
(1, 1, 245000.00, 50000.00, '2026-10', '****-****-****-9481', 'processed', '2026-10-15'),
(2, 2, 195000.00, 25000.00, '2026-10', '****-****-****-1029', 'processed', '2026-10-15'),
(3, 3, 165000.00, 15000.00, '2026-10', '****-****-****-3341', 'processed', '2026-10-15'),
(4, 4, 155000.00, 12000.00, '2026-10', '****-****-****-8820', 'processed', '2026-10-15'),
(5, 5, 125000.00, 8000.00, '2026-10', '****-****-****-4592', 'processed', '2026-10-15'),
(6, 6, 215000.00, 40000.00, '2026-10', '****-****-****-7110', 'processed', '2026-10-15'),
(7, 7, 135000.00, 10000.00, '2026-10', '****-****-****-2934', 'processed', '2026-10-15'),
(8, 8, 115000.00, 7500.00, '2026-10', '****-****-****-6781', 'processed', '2026-10-15'),
(9, 9, 205000.00, 35000.00, '2026-10', '****-****-****-5519', 'processed', '2026-10-15'),
(10, 10, 110000.00, 6000.00, '2026-10', '****-****-****-8104', 'processed', '2026-10-15'),
(11, 11, 190000.00, 65000.00, '2026-10', '****-****-****-9023', 'processed', '2026-10-15'),
(12, 12, 140000.00, 45000.00, '2026-10', '****-****-****-1492', 'processed', '2026-10-15'),
(13, 13, 260000.00, 40000.00, '2026-10', '****-****-****-3004', 'processed', '2026-10-15'),
(14, 14, 115000.00, 8000.00, '2026-10', '****-****-****-4781', 'processed', '2026-10-15'),
(15, 15, 175000.00, 20000.00, '2026-10', '****-****-****-9921', 'processed', '2026-10-15'),
(16, 16, 105000.00, 5000.00, '2026-10', '****-****-****-6192', 'processed', '2026-10-15'),
(17, 17, 120000.00, 8500.00, '2026-10', '****-****-****-7832', 'processed', '2026-10-15'),
(18, 18, 130000.00, 11000.00, '2026-10', '****-****-****-2109', 'processed', '2026-10-15'),
(19, 19, 78000.00, 0.00, '2026-10', '****-****-****-4491', 'held', '2026-10-15'),
(20, 20, 85000.00, 5000.00, '2026-10', '****-****-****-1198', 'processed', '2026-10-15');

-- 7. VendorContracts (10 records)
INSERT INTO `VendorContracts` (`id`, `contract_code`, `vendor_name`, `service_scope`, `contract_value`, `start_date`, `end_date`, `status`) VALUES
(1, 'VND-2024-01', 'Amazon Web Services Inc.', 'Multi-Region Cloud Hosting & Dedicated Enclaves', 1200000.00, '2024-01-01', '2027-01-01', 'active'),
(2, 'VND-2024-02', 'CrowdStrike Holdings', 'Endpoint Detection & Response (EDR) Falcon Suite', 450000.00, '2024-06-01', '2026-06-01', 'active'),
(3, 'VND-2025-01', 'Oracle America Inc.', 'Exadata Cloud Database Maintenance & Licensing', 890000.00, '2025-01-01', '2028-01-01', 'active'),
(4, 'VND-2025-02', 'Cisco Systems Inc.', 'Core Switch Infrastructure & 400G Fiber Transit', 620000.00, '2025-03-15', '2027-03-15', 'active'),
(5, 'VND-2025-03', 'Palo Alto Networks', 'Strata Next-Gen Perimeter Firewall Cluster', 380000.00, '2025-05-01', '2027-05-01', 'active'),
(6, 'VND-2025-04', 'KPMG Advisory LLP', 'Independent SOC 2 Type II Annual Security Audit', 250000.00, '2025-07-01', '2026-07-01', 'active'),
(7, 'VND-2025-05', 'Equinix Data Centers', 'Ashburn & Frankfurt Colocation Space & Cross-Connects', 740000.00, '2025-08-01', '2028-08-01', 'active'),
(8, 'VND-2025-06', 'Splunk Inc.', 'SIEM Centralized Telemetry Aggregation Tier', 510000.00, '2025-09-01', '2026-09-01', 'pending_renewal'),
(9, 'VND-2026-01', 'HashiCorp Inc.', 'Enterprise Vault & Terraform Cloud Orchestration', 310000.00, '2026-01-01', '2027-01-01', 'active'),
(10, 'VND-2026-02', 'Mandiant Incident Response', '24/7 Retainer for Rapid Cyber Threat Containment', 180000.00, '2026-02-01', '2027-02-01', 'active');

-- 8. BudgetReports (8 departmental budget performance reports)
INSERT INTO `BudgetReports` (`id`, `report_code`, `department`, `reporting_period`, `allocated_budget`, `actual_expenditure`, `approval_status`) VALUES
(1, 'BUD-2026-ENG-Q1', 'Engineering', '2026-Q1', 2500000.00, 2410500.00, 'approved'),
(2, 'BUD-2026-ENG-Q2', 'Engineering', '2026-Q2', 2600000.00, 2580200.00, 'approved'),
(3, 'BUD-2026-ENG-Q3', 'Engineering', '2026-Q3', 2750000.00, 2810000.00, 'approved'),
(4, 'BUD-2026-FIN-Q1', 'Finance', '2026-Q1', 1200000.00, 1140000.00, 'approved'),
(5, 'BUD-2026-FIN-Q2', 'Finance', '2026-Q2', 1250000.00, 1220000.00, 'approved'),
(6, 'BUD-2026-OPS-Q1', 'Operations', '2026-Q1', 1800000.00, 1720000.00, 'approved'),
(7, 'BUD-2026-OPS-Q2', 'Operations', '2026-Q2', 1900000.00, 1950000.00, 'approved'),
(8, 'BUD-2026-SEC-Q1', 'Security', '2026-Q1', 1500000.00, 1430000.00, 'approved');

-- 9. TaxRecords (Highly Sensitive - 12 records)
INSERT INTO `TaxRecords` (`id`, `tax_record_code`, `employee_id`, `entity_type`, `tax_period`, `taxable_income`, `tax_amount`, `filing_status`, `filing_date`) VALUES
(1, 'TAX-2025-CORP-01', NULL, 'corporate', '2025-TY', 45000000.00, 9450000.00, 'filed', '2026-03-15'),
(2, 'TAX-2025-CORP-02', NULL, 'corporate', '2025-Q4', 12000000.00, 2520000.00, 'filed', '2026-01-15'),
(3, 'TAX-2025-IND-01', 1, 'individual', '2025-TY', 295000.00, 88500.00, 'filed', '2026-04-10'),
(4, 'TAX-2025-IND-02', 2, 'individual', '2025-TY', 220000.00, 66000.00, 'filed', '2026-04-11'),
(5, 'TAX-2025-IND-03', 3, 'individual', '2025-TY', 180000.00, 54000.00, 'filed', '2026-04-12'),
(6, 'TAX-2025-IND-04', 4, 'individual', '2025-TY', 167000.00, 50100.00, 'filed', '2026-04-12'),
(7, 'TAX-2025-IND-05', 5, 'individual', '2025-TY', 133000.00, 39900.00, 'filed', '2026-04-13'),
(8, 'TAX-2025-IND-06', 6, 'individual', '2025-TY', 255000.00, 76500.00, 'filed', '2026-04-09'),
(9, 'TAX-2025-IND-07', 7, 'individual', '2025-TY', 145000.00, 43500.00, 'filed', '2026-04-14'),
(10, 'TAX-2025-IND-08', 11, 'individual', '2025-TY', 255000.00, 76500.00, 'filed', '2026-04-10'),
(11, 'TAX-2025-IND-09', 13, 'individual', '2025-TY', 300000.00, 90000.00, 'filed', '2026-04-08'),
(12, 'TAX-2025-IND-10', 15, 'individual', '2025-TY', 195000.00, 58500.00, 'filed', '2026-04-11');

-- 10. SecurityAuditLogs (Sensitive Security Telemetry - 15 records)
INSERT INTO `SecurityAuditLogs` (`id`, `event_id`, `actor_id`, `event_type`, `resource`, `timestamp`, `outcome`, `metadata_safe`) VALUES
(1, 'SEC-AUD-0001', 'admin', 'POLICY_UPDATE', 'FinanceCorpDB.*', '2026-10-20 08:00:00', 'ALLOW', '{"action": "rotate_opa_rules", "version": "2.4.1"}'),
(2, 'SEC-AUD-0002', 'admin', 'JIT_APPROVE', 'FinanceCorpDB.Payroll', '2026-10-20 08:30:00', 'ALLOW', '{"requester": "developer", "duration_minutes": 30}'),
(3, 'SEC-AUD-0003', 'developer', 'JIT_REQUEST', 'FinanceCorpDB.Products', '2026-10-20 09:15:00', 'ALLOW', '{"profile": "Developer Read Profile", "auto_approved": true}'),
(4, 'SEC-AUD-0004', 'developer', 'UNAUTHORIZED_ACCESS_ATTEMPT', 'FinanceCorpDB.Payroll', '2026-10-20 10:10:00', 'DENY', '{"error": "ER_TABLEACCESS_DENIED_ERROR", "blocked_at": "mysql_grant"}'),
(5, 'SEC-AUD-0005', 'dba', 'JIT_REQUEST', 'FinanceCorpDB.Employees', '2026-10-20 11:00:00', 'ALLOW', '{"profile": "DBA Operations Profile"}'),
(6, 'SEC-AUD-0006', 'dba', 'DDL_SCHEMA_ALTERATION', 'FinanceCorpDB.Orders', '2026-10-20 11:45:00', 'REVIEW', '{"operation": "ALTER TABLE", "profile_requires_approval": true}'),
(7, 'SEC-AUD-0007', 'unattributed', 'DIRECT_ROOT_ACCESS', 'FinanceCorpDB.Transactions', '2026-10-20 14:20:00', 'ALERT', '{"client": "127.0.0.1", "bypassed_jit": true}'),
(8, 'SEC-AUD-0008', 'developer', 'QUERY_EXECUTE', 'FinanceCorpDB.Customers', '2026-10-21 09:00:00', 'ALLOW', '{"bounded": true, "limit": 10}'),
(9, 'SEC-AUD-0009', 'developer', 'BULK_READ_DETECTED', 'FinanceCorpDB.Orders', '2026-10-21 11:35:00', 'ALERT', '{"select_star": true, "limit": false}'),
(10, 'SEC-AUD-0010', 'admin', 'SESSION_REVOKE', 'jit_session_442', '2026-10-21 11:36:00', 'ALLOW', '{"reason": "Exfiltration risk score exceeded 80"}'),
(11, 'SEC-AUD-0011', 'developer', 'AUTHENTICATION_FAILURE', 'auth/login', '2026-10-22 08:45:00', 'DENY', '{"reason": "Invalid password hash"}'),
(12, 'SEC-AUD-0012', 'developer', 'AUTHENTICATION_SUCCESS', 'auth/login', '2026-10-22 08:46:00', 'ALLOW', '{"roles": ["developer"]}'),
(13, 'SEC-AUD-0013', 'dba', 'INDEX_REBUILD', 'FinanceCorpDB.Transactions', '2026-10-22 13:00:00', 'ALLOW', '{"status": "completed"}'),
(14, 'SEC-AUD-0014', 'admin', 'RBAC_ROLE_ASSIGNMENT', 'users/developer', '2026-10-22 15:30:00', 'ALLOW', '{"assigned_role": "developer"}'),
(15, 'SEC-AUD-0015', 'admin', 'THREAT_ALERT_TRIAGE', 'alerts/1', '2026-10-22 17:00:00', 'ALLOW', '{"new_status": "investigating"}');
