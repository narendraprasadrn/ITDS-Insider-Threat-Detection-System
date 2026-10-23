# Insider Threat Detection System - Evaluation Results

**Evaluation Date:** 2026-10-23T04:57:24.312Z
**Total Execution Time:** 22.91 seconds
**Target System:** MySQL 8 with Server-Side `general_log` Auditing & Open Policy Agent (OPA)

## 1. Scenario Detection Evaluation Summary

| ID | Scenario | Description | Queries | Violations | Risk Score | Risk Level | Alert Raised? | Time-to-Detect | Status |
|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **A** | **Normal Analyst Day** | Compliant SELECTs with WHERE and LIMIT filters | 3 | 0 | **0/100** | `LOW` | ✅ NO | 4282ms | ✅ **PASS** |
| **B** | **Data Exfiltration Attack** | Mass SELECT * dumps without LIMIT/WHERE and velocity spike | 7 | 8 | **80/100** | `CRITICAL` | 🚨 **YES** | 4891ms | ✅ **PASS** |
| **C** | **Privilege Probing & Reconnaissance** | Unauthorized DELETE/DDL attempts and cross-schema metadata enumeration | 6 | 11 | **100/100** | `CRITICAL` | 🚨 **YES** | 4788ms | ✅ **PASS** |
| **D** | **Off-Hours Payroll Access** | Bulk dump of sensitive salaries table executed outside authorized work hours | 5 | 2 | **100/100** | `CRITICAL` | 🚨 **YES** | 4698ms | ✅ **PASS** |
| **E** | **Credential Sharing / Unattributed Use** | Direct SQL execution bypassing JIT governance and session attribution | 4 | 8 | **60/100** | `HIGH` | 🚨 **YES** | 4155ms | ✅ **PASS** |

## 2. Detection Rule Trigger Breakdown

### Scenario A: Normal Analyst Day
- **Primary Objective:** Compliant SELECTs with WHERE and LIMIT filters
- **Queries Executed:** 3
- **Policy Violations Flagged:** 0
- **Risk Score Assigned:** 0/100 (LOW)
- **Fired Threat Detectors:** `None (Compliant)`
- **Detection Latency:** 4282ms from query execution to risk assessment

### Scenario B: Data Exfiltration Attack
- **Primary Objective:** Mass SELECT * dumps without LIMIT/WHERE and velocity spike
- **Queries Executed:** 7
- **Policy Violations Flagged:** 8
- **Risk Score Assigned:** 80/100 (CRITICAL)
- **Fired Threat Detectors:** `high_query_velocity, bulk_export, out_of_profile_table`
- **Detection Latency:** 4891ms from query execution to risk assessment

### Scenario C: Privilege Probing & Reconnaissance
- **Primary Objective:** Unauthorized DELETE/DDL attempts and cross-schema metadata enumeration
- **Queries Executed:** 6
- **Policy Violations Flagged:** 11
- **Risk Score Assigned:** 100/100 (CRITICAL)
- **Fired Threat Detectors:** `high_query_velocity, bulk_export, out_of_profile_table, rapid_failed_queries, cross_schema_read`
- **Detection Latency:** 4788ms from query execution to risk assessment

### Scenario D: Off-Hours Payroll Access
- **Primary Objective:** Bulk dump of sensitive salaries table executed outside authorized work hours
- **Queries Executed:** 5
- **Policy Violations Flagged:** 2
- **Risk Score Assigned:** 100/100 (CRITICAL)
- **Fired Threat Detectors:** `high_query_velocity, bulk_export, off_hours_activity, out_of_profile_table`
- **Detection Latency:** 4698ms from query execution to risk assessment

### Scenario E: Credential Sharing / Unattributed Use
- **Primary Objective:** Direct SQL execution bypassing JIT governance and session attribution
- **Queries Executed:** 4
- **Policy Violations Flagged:** 8
- **Risk Score Assigned:** 60/100 (HIGH)
- **Fired Threat Detectors:** `unattributed_account_use, unauthorized_ddl`
- **Detection Latency:** 4155ms from query execution to risk assessment

## 3. Analysis & Key Findings

1. **Zero False Positives in Normal Usage (Scenario A)**:
   Compliant developers executing bounded queries within their authorized profile and business hours produced a risk score of 0/100 with zero policy violations and zero false alerts.

2. **Sub-5-Second Detection Latency Across All Attacks**:
   Despite relying on asynchronous server-side logging (`mysql.general_log` with a 1.5s polling loop), detection, AST parsing, Rego policy evaluation, and alert generation completed in under 5 seconds (mean detection latency: ~4.5s).

3. **Multi-Vector Explainable Scoring**:
   Privilege probing (Scenario C) correctly aggregated multiple orthogonal threat indicators (`cross_schema_read`, `rapid_failed_queries`, `out_of_profile_table`, `bulk_export`) to reach the maximum 100/100 risk score with full audit evidence links.

4. **Unattributed Access Isolation (Scenario E)**:
   Direct client queries that bypassed the JIT ephemeral account mechanism were immediately isolated as `unattributed` and evaluated for critical violations (e.g. `UNAUTHORIZED_DDL`), ensuring zero audit blindspots.
