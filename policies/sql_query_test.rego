package itds.query_test

import future.keywords.in
import future.keywords.if
import data.itds.query

# Test 1: Allow valid SELECT query with limit and where clause
test_allow_valid_query if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT"],
            "granted_resources": ["target_db.customers", "target_db.orders"],
            "is_expired": false
        },
        "query": {
            "operation": "SELECT",
            "tables": ["target_db.customers"],
            "has_where": true,
            "select_star": false,
            "has_limit": true,
            "is_ddl": false
        }
    }
    res := query.result with input as input_doc
    res.allow == true
    res.outcome == "ALLOW"
    count(res.violations) == 0
}

# Test 2: Flag violation for ungranted operation (e.g. DELETE executed under read-only profile)
test_violation_ungranted_operation if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT"],
            "granted_resources": ["target_db.customers"],
            "is_expired": false
        },
        "query": {
            "operation": "DELETE",
            "tables": ["target_db.customers"],
            "has_where": true,
            "select_star": false,
            "has_limit": false,
            "is_ddl": false
        }
    }
    res := query.result with input as input_doc
    res.allow == false
    res.outcome == "DENY"
    "OPERATION_NOT_GRANTED" in res.violations
}

# Test 3: Flag violation for table out of scope (e.g. accessing salaries when granted customers)
test_violation_table_out_of_scope if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT"],
            "granted_resources": ["target_db.customers"],
            "is_expired": false
        },
        "query": {
            "operation": "SELECT",
            "tables": ["target_db.salaries"],
            "has_where": false,
            "select_star": false,
            "has_limit": true,
            "is_ddl": false
        }
    }
    res := query.result with input as input_doc
    res.allow == false
    res.outcome == "DENY"
    "TABLE_OUT_OF_SCOPE" in res.violations
}

# Test 4: Flag violation for unbounded SELECT * (outcome: REVIEW)
test_violation_unbounded_select_star if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT"],
            "granted_resources": ["target_db.orders"],
            "is_expired": false
        },
        "query": {
            "operation": "SELECT",
            "tables": ["target_db.orders"],
            "has_where": false,
            "select_star": true,
            "has_limit": false,
            "is_ddl": false
        }
    }
    res := query.result with input as input_doc
    res.allow == false
    res.outcome == "REVIEW"
    res.authorized == true
    "UNBOUNDED_BULK_READ" in res.violations
}

# Test 5: Flag violation for query on expired session
test_violation_session_expired if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT"],
            "granted_resources": ["target_db.customers"],
            "is_expired": true
        },
        "query": {
            "operation": "SELECT",
            "tables": ["target_db.customers"],
            "has_where": true,
            "select_star": false,
            "has_limit": true,
            "is_ddl": false
        }
    }
    res := query.result with input as input_doc
    res.allow == false
    res.outcome == "DENY"
    "SESSION_EXPIRED" in res.violations
}

# Test 6: Flag violation for unauthorized DDL execution
test_violation_unauthorized_ddl if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT", "INSERT"],
            "granted_resources": ["target_db.customers"],
            "is_expired": false
        },
        "query": {
            "operation": "ALTER",
            "tables": ["target_db.customers"],
            "has_where": false,
            "select_star": false,
            "has_limit": false,
            "is_ddl": true
        }
    }
    res := query.result with input as input_doc
    res.allow == false
    res.outcome == "DENY"
    "UNAUTHORIZED_DDL" in res.violations
}

# Test 7: Flag violation for cross-schema access
test_violation_cross_schema_access if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT"],
            "granted_resources": ["target_db.customers"],
            "is_expired": false
        },
        "query": {
            "operation": "SELECT",
            "tables": ["target_db.customers", "mysql.user"],
            "has_where": false,
            "select_star": false,
            "has_limit": true,
            "is_ddl": false,
            "is_cross_schema": true
        }
    }
    res := query.result with input as input_doc
    res.allow == false
    res.outcome == "DENY"
    "CROSS_SCHEMA_ACCESS" in res.violations
}

# Test 8: Allow unbounded read when session is exempt (Admin or DBA session)
test_exempt_unbounded_read if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT"],
            "granted_resources": ["target_db.orders"],
            "profile_name": "Admin Security Administration",
            "is_expired": false
        },
        "query": {
            "operation": "SELECT",
            "tables": ["target_db.orders"],
            "has_where": false,
            "select_star": true,
            "has_limit": false,
            "is_ddl": false
        }
    }
    res := query.result with input as input_doc
    res.allow == true
    res.outcome == "ALLOW"
    count(res.violations) == 0
}

# Test 9: Deny unbounded bulk read on critical data (UNBOUNDED_BULK_READ with severity critical)
test_deny_unbounded_critical_read if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT"],
            "granted_resources": ["target_db.payroll"],
            "profile_name": "Executive Payroll & Compensation",
            "is_expired": false
        },
        "query": {
            "operation": "SELECT",
            "tables": ["target_db.payroll"],
            "has_where": false,
            "select_star": true,
            "has_limit": false,
            "is_ddl": false
        }
    }
    res := query.result with input as input_doc
    res.allow == false
    res.outcome == "DENY"
    "UNBOUNDED_BULK_READ" in res.violations
}

# Test 10: Deny destructive DROP TABLE even if user has DDL grant
test_deny_destructive_drop_table if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT", "INSERT", "UPDATE", "DELETE", "DDL"],
            "granted_resources": ["target_db.customers"],
            "profile_name": "Admin Security Administration",
            "is_expired": false
        },
        "query": {
            "operation": "DROP",
            "tables": ["target_db.customers"],
            "has_where": false,
            "select_star": false,
            "has_limit": false,
            "is_ddl": true
        }
    }
    res := query.result with input as input_doc
    res.allow == false
    res.outcome == "DENY"
    "PROHIBITED_DESTRUCTIVE_DDL" in res.violations
}

# Test 11: Deny internal system schema access (e.g. mysql.user)
test_deny_system_schema_access if {
    input_doc := {
        "session": {
            "granted_operations": ["SELECT"],
            "granted_resources": ["target_db.customers"],
            "profile_name": "Admin Security Administration",
            "is_expired": false
        },
        "query": {
            "operation": "SELECT",
            "tables": ["mysql.user"],
            "has_where": false,
            "select_star": true,
            "has_limit": true,
            "is_ddl": false
        }
    }
    res := query.result with input as input_doc
    res.allow == false
    res.outcome == "DENY"
    "SYSTEM_SCHEMA_ACCESS_DENIED" in res.violations
}
