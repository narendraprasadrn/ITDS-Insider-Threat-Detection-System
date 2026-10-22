package itds.query

import future.keywords.in
import future.keywords.if
import future.keywords.contains

default allow = false

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

violations contains violation if {
    input.query.operation == "SELECT"
    input.query.select_star == true
    input.query.has_limit == false
    violation := {
        "rule": "UNBOUNDED_BULK_READ",
        "severity": "medium",
        "reason": "Full table scan detected: SELECT * without LIMIT clause"
    }
}

table_in_granted_resources(table) if {
    some granted in input.session.granted_resources
    endswith(granted, concat(".", ["", table]))
}

# -------------------------------------------------------------
# FINAL EVALUATION RESULT
# -------------------------------------------------------------
allow if {
    count(violations) == 0
}

result := {
    "allow": allow,
    "violations": [v.rule | some v in violations],
    "violation_details": [v | some v in violations],
    "reasons": [v.reason | some v in violations]
}
