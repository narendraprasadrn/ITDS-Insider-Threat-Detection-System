package itds.access

import future.keywords.in
import future.keywords.if
import future.keywords.contains

default allow = false
default require_approval = false
default deny = false

# Business hours definition (08:00 to 18:00)
is_business_hours if {
    input.time_of_day >= "08:00"
    input.time_of_day <= "18:00"
}

# Check if user is admin
is_admin if {
    "admin" in input.user.roles
}

# Check if user is dba
is_dba if {
    "dba" in input.user.roles
}

# Max duration thresholds by sensitivity (minutes)
max_duration_by_sensitivity := {
    "low": 480,
    "medium": 240,
    "high": 120,
    "critical": 60
}

# Determine highest sensitivity in requested resources
has_critical_resource if {
    some res in input.resources
    res.sensitivity == "critical"
}

has_high_resource if {
    some res in input.resources
    res.sensitivity == "high"
}

# -------------------------------------------------------------
# DENY RULES (Evaluation priority 1: Any deny reason triggers deny)
# -------------------------------------------------------------
deny_reasons contains reason if {
    "DDL" in input.operations
    not is_dba
    not is_admin
    reason := "DDL operations are strictly restricted to the DBA or Admin roles"
}

deny_reasons contains reason if {
    input.sensitivity in ["high", "critical"]
    not is_business_hours
    not is_admin
    reason := sprintf("Access to %v-sensitivity resources outside business hours (08:00-18:00) is prohibited unless Admin", [input.sensitivity])
}

deny_reasons contains reason if {
    limit := max_duration_by_sensitivity[input.sensitivity]
    input.requested_duration > limit
    reason := sprintf("Requested duration of %v minutes exceeds the maximum permitted %v minutes for %v-sensitivity access", [input.requested_duration, limit, input.sensitivity])
}

deny_reasons contains reason if {
    "DELETE" in input.operations
    has_critical_resource
    not is_admin
    reason := "DELETE operations on critical-sensitivity resources are prohibited except by Admin"
}

deny if {
    count(deny_reasons) > 0
}

# -------------------------------------------------------------
# REQUIRE APPROVAL RULES (Evaluation priority 2: If not denied)
# -------------------------------------------------------------
approval_reasons contains reason if {
    not deny
    has_critical_resource
    reason := "Access involves critical sensitivity resources (e.g. employee compensation/salaries)"
}

approval_reasons contains reason if {
    not deny
    has_high_resource
    reason := "Access involves high sensitivity resources (e.g. financial transaction records)"
}

approval_reasons contains reason if {
    not deny
    input.profile.requires_approval == true
    reason := "Profile is configured with mandatory supervisor approval"
}

approval_reasons contains reason if {
    not deny
    some op in input.operations
    op in ["UPDATE", "DELETE", "DDL"]
    reason := sprintf("Request includes modifying operations (%v)", [op])
}

require_approval if {
    not deny
    count(approval_reasons) > 0
}

# -------------------------------------------------------------
# ALLOW RULES (Evaluation priority 3: Neither denied nor requiring approval)
# -------------------------------------------------------------
allow if {
    not deny
    not require_approval
}

# -------------------------------------------------------------
# UNIFIED DECISION OBJECT
# -------------------------------------------------------------
action := "deny" if {
    deny
} else := "require_approval" if {
    require_approval
} else := "allow"

reasons := [r | some r in deny_reasons] if {
    deny
} else := [r | some r in approval_reasons] if {
    require_approval
} else := ["Request meets standard auto-approval criteria within business boundaries"]

decision := {
    "action": action,
    "allow": allow,
    "require_approval": require_approval,
    "deny": deny,
    "reasons": reasons
}
