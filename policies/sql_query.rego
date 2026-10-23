package itds.query

import future.keywords.in
import future.keywords.if
import future.keywords.contains

default allow = false
default deny = false
default authorized = false

# -------------------------------------------------------------
# HELPERS & EXEMPTIONS
# -------------------------------------------------------------

is_unbounded_read_exempt if {
    input.session.allow_unbounded_reads == true
}

is_unbounded_read_exempt if {
    input.session.profile_name in [
        "Admin Security Administration",
        "DBA Operations Profile",
        "DBA Maintenance Profile"
    ]
}

critical_table_names := [
    "payroll", "taxrecords", "securityauditlogs",
    "target_db.payroll", "target_db.taxrecords", "target_db.securityauditlogs",
    "financecorpdb.payroll", "financecorpdb.taxrecords", "financecorpdb.securityauditlogs",
    "itds_db.payroll", "itds_db.taxrecords", "itds_db.securityauditlogs"
]

is_critical_resource_accessed if {
    some t in input.query.tables
    lower(t) in critical_table_names
}

is_critical_resource_accessed if {
    some t in input.query.tables
    some cr in input.session.critical_resources
    lower(t) == lower(cr)
}

table_in_granted_resources(table) if {
    some granted in input.session.granted_resources
    endswith(lower(granted), concat(".", ["", lower(table)]))
}

# -------------------------------------------------------------
# VIOLATIONS IDENTIFICATION
# -------------------------------------------------------------

violations contains violation if {
    input.session.is_expired == true
    violation := {
        "rule": "SESSION_EXPIRED",
        "severity": "critical",
        "reason": "Query executed after the Just-In-Time session has expired"
    }
}

violations contains violation if {
    not input.query.operation in input.session.granted_operations
    violation := {
        "rule": "OPERATION_NOT_GRANTED",
        "severity": "high",
        "reason": sprintf("Operation '%v' is not in session's granted operations: [%v]", [input.query.operation, concat(", ", input.session.granted_operations)])
    }
}

violations contains violation if {
    some table in input.query.tables
    not table in input.session.granted_resources
    not table_in_granted_resources(table)
    violation := {
        "rule": "TABLE_OUT_OF_SCOPE",
        "severity": "high",
        "reason": sprintf("Table '%v' is outside the session's approved resource scope", [table])
    }
}

violations contains violation if {
    input.query.is_ddl == true
    not "DDL" in input.session.granted_operations
    violation := {
        "rule": "UNAUTHORIZED_DDL",
        "severity": "critical",
        "reason": "DDL schema alteration statement attempted without explicit DDL grant"
    }
}

# Unbounded bulk read on critical tables (severity: critical -> triggers DENY)
violations contains violation if {
    input.query.operation == "SELECT"
    input.query.select_star == true
    input.query.has_limit == false
    not is_unbounded_read_exempt
    is_critical_resource_accessed
    violation := {
        "rule": "UNBOUNDED_BULK_READ",
        "severity": "critical",
        "reason": "Unbounded bulk read (SELECT *) attempted on critical sensitivity data"
    }
}

# Unbounded bulk read on standard application tables (severity: medium -> triggers REVIEW)
violations contains violation if {
    input.query.operation == "SELECT"
    input.query.select_star == true
    input.query.has_limit == false
    not is_unbounded_read_exempt
    not is_critical_resource_accessed
    violation := {
        "rule": "UNBOUNDED_BULK_READ",
        "severity": "medium",
        "reason": "Full table scan detected: SELECT * without LIMIT clause"
    }
}

violations contains violation if {
    input.query.is_cross_schema == true
    violation := {
        "rule": "CROSS_SCHEMA_ACCESS",
        "severity": "high",
        "reason": "Query accesses resources across multiple distinct database schemas"
    }
}

# -------------------------------------------------------------
# FINAL EVALUATION RESULT
# -------------------------------------------------------------
deny if {
    some v in violations
    v.severity in ["critical", "high"]
}

outcome := "DENY" if {
    deny
} else := "REVIEW" if {
    count(violations) > 0
} else := "ALLOW"

allow if {
    count(violations) == 0
}

authorized if {
    not deny
}

result := {
    "outcome": outcome,
    "allow": allow,
    "deny": deny,
    "authorized": authorized,
    "violations": [v.rule | some v in violations],
    "violation_details": [v | some v in violations],
    "reasons": [v.reason | some v in violations]
}
