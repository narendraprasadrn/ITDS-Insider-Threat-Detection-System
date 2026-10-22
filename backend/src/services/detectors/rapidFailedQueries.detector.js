// backend/src/services/detectors/rapidFailedQueries.detector.js

/**
 * Rapid Failed Queries Detector
 * Identifies repeated query errors, privilege denials (blocked_by_db), or syntax failures
 * indicating permission enumeration, brute-forcing, or SQL injection probing.
 *
 * @param {Array} events - Stream of SQL events for the session
 * @param {object} [baseline]
 * @param {object} [context] - { minFailures = 2 }
 * @returns {object|null} { rule_id, weight, evidence_event_ids, explanation } or null
 */
export function detectRapidFailedQueries(events, baseline, context = {}) {
  if (!events || events.length === 0) return null;

  const minFailures = context.minFailures || 2;

  const failedEvents = events.filter(evt => {
    // Queries flagged with status 'failed', 'parse_error', or having associated blocked_by_db violations
    const isFailedStatus = evt.status === 'failed' || evt.status === 'parse_error';
    const hasBlockedViolation = Boolean(evt.has_blocked_violation);
    return isFailedStatus || hasBlockedViolation;
  });

  if (failedEvents.length >= minFailures) {
    return {
      rule_id: 'rapid_failed_queries',
      weight: 25,
      evidence_event_ids: failedEvents.map(e => e.id).filter(Boolean),
      explanation: `Repeated query failures / authorization denials detected (${failedEvents.length} blocked attempts)`
    };
  }

  return null;
}
