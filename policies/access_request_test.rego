package itds.access_test

import future.keywords.in
import future.keywords.if
import data.itds.access

# Test 1: Auto-approve (allow) for Sales read within business hours
test_allow_sales_read if {
    input_doc := {
        "user": {"username": "developer", "roles": ["developer"]},
        "profile": {"name": "Sales & Customer Read-Only", "requires_approval": false},
        "resources": [{"db_name": "target_db", "table_name": "customers", "sensitivity": "low"}],
        "operations": ["SELECT"],
        "requested_duration": 60,
        "time_of_day": "11:30",
        "sensitivity": "low"
    }
    decision := access.decision with input as input_doc
    decision.action == "allow"
    decision.allow == true
    decision.deny == false
}

# Test 2: Require approval for critical resources (salaries) when requested by Developer
test_require_approval_critical_salaries if {
    input_doc := {
        "user": {"username": "developer", "roles": ["developer"]},
        "profile": {"name": "HR Staff Payroll", "requires_approval": true},
        "resources": [
            {"db_name": "target_db", "table_name": "employees", "sensitivity": "medium"},
            {"db_name": "target_db", "table_name": "salaries", "sensitivity": "critical"}
        ],
        "operations": ["SELECT"],
        "requested_duration": 45,
        "time_of_day": "14:00",
        "sensitivity": "critical"
    }
    decision := access.decision with input as input_doc
    decision.action == "require_approval"
    decision.require_approval == true
    decision.deny == false
}

# Test 3: Require approval for DDL when requested by DBA (DBA Maintenance Profile)
test_require_approval_ddl_dba if {
    input_doc := {
        "user": {"username": "dba", "roles": ["dba"]},
        "profile": {"name": "DBA Maintenance", "requires_approval": true},
        "resources": [{"db_name": "target_db", "table_name": "orders", "sensitivity": "medium"}],
        "operations": ["SELECT", "DDL"],
        "requested_duration": 60,
        "time_of_day": "15:00",
        "sensitivity": "medium"
    }
    decision := access.decision with input as input_doc
    decision.action == "require_approval"
    decision.require_approval == true
}

# Test 4: Deny DDL when requested by non-DBA (e.g. developer)
test_deny_ddl_non_dba if {
    input_doc := {
        "user": {"username": "developer", "roles": ["developer"]},
        "profile": {"name": "Custom Profile", "requires_approval": false},
        "resources": [{"db_name": "target_db", "table_name": "customers", "sensitivity": "low"}],
        "operations": ["SELECT", "DDL"],
        "requested_duration": 30,
        "time_of_day": "12:00",
        "sensitivity": "low"
    }
    decision := access.decision with input as input_doc
    decision.action == "deny"
    decision.deny == true
}

# Test 5: Deny off-hours request for high-sensitivity resources by non-admin
test_deny_off_hours_high_sensitivity if {
    input_doc := {
        "user": {"username": "developer", "roles": ["developer"]},
        "profile": {"name": "Financial Audit", "requires_approval": true},
        "resources": [{"db_name": "target_db", "table_name": "payments", "sensitivity": "high"}],
        "operations": ["SELECT"],
        "requested_duration": 60,
        "time_of_day": "22:45",
        "sensitivity": "high"
    }
    decision := access.decision with input as input_doc
    decision.action == "deny"
    decision.deny == true
}

# Test 6: Allow off-hours request for high-sensitivity resources if user is Admin
test_admin_override_off_hours if {
    input_doc := {
        "user": {"username": "admin", "roles": ["admin"]},
        "profile": {"name": "Emergency Audit", "requires_approval": true},
        "resources": [{"db_name": "target_db", "table_name": "payments", "sensitivity": "high"}],
        "operations": ["SELECT"],
        "requested_duration": 60,
        "time_of_day": "23:15",
        "sensitivity": "high"
    }
    decision := access.decision with input as input_doc
    decision.deny == false
}

# Test 7: Deny when requested duration exceeds sensitivity threshold (critical max is 60m)
test_deny_duration_cap_exceeded if {
    input_doc := {
        "user": {"username": "developer", "roles": ["developer"]},
        "profile": {"name": "HR Payroll", "requires_approval": true},
        "resources": [{"db_name": "target_db", "table_name": "salaries", "sensitivity": "critical"}],
        "operations": ["SELECT"],
        "requested_duration": 180, # Exceeds 60m
        "time_of_day": "10:00",
        "sensitivity": "critical"
    }
    decision := access.decision with input as input_doc
    decision.action == "deny"
    decision.deny == true
}

# Test 8: Auto-approve Admin routine profile (Admin Security Administration)
test_admin_auto_approve_routine_profile if {
    input_doc := {
        "user": {"username": "admin", "roles": ["admin"]},
        "profile": {"name": "Admin Security Administration", "requires_approval": false},
        "resources": [
            {"db_name": "FinanceCorpDB", "table_name": "Employees", "sensitivity": "medium"},
            {"db_name": "FinanceCorpDB", "table_name": "Payroll", "sensitivity": "critical"}
        ],
        "operations": ["SELECT", "INSERT", "UPDATE", "DELETE"],
        "requested_duration": 60,
        "time_of_day": "10:00",
        "sensitivity": "critical"
    }
    decision := access.decision with input as input_doc
    decision.action == "allow"
    decision.allow == true
    decision.require_approval == false
    decision.deny == false
}

# Test 9: Auto-approve DBA routine profile (DBA Operations Profile)
test_dba_auto_approve_routine_profile if {
    input_doc := {
        "user": {"username": "dba", "roles": ["dba"]},
        "profile": {"name": "DBA Operations Profile", "requires_approval": false},
        "resources": [
            {"db_name": "FinanceCorpDB", "table_name": "Transactions", "sensitivity": "high"},
            {"db_name": "FinanceCorpDB", "table_name": "Customers", "sensitivity": "medium"}
        ],
        "operations": ["SELECT", "INSERT", "UPDATE"],
        "requested_duration": 120,
        "time_of_day": "11:00",
        "sensitivity": "high"
    }
    decision := access.decision with input as input_doc
    decision.action == "allow"
    decision.allow == true
    decision.require_approval == false
    decision.deny == false
}
