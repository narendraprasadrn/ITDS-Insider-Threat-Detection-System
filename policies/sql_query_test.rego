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
    "TABLE_OUT_OF_SCOPE" in res.violations
}

# Test 4: Flag violation for unbounded SELECT *
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
    "UNAUTHORIZED_DDL" in res.violations
}
