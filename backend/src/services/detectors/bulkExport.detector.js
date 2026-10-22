// backend/src/services/detectors/bulkExport.detector.js

/**
 * Bulk Export Detector
 * Detects large-scale data extraction patterns: unbounded SELECT * queries without WHERE/LIMIT
 * or queries targeting full tables.
 *
 * @param {Array} events - Stream of SQL events for the session
 * @param {object} [baseline]
 * @param {object} [context]
 * @returns {object|null} { rule_id, weight, evidence_event_ids, explanation } or null
 */
export function detectBulkExport(events, baseline, context = {}) {
  if (!events || events.length === 0) return null;

  const matches = events.filter(evt => {
    const flags = typeof evt.flags === 'string' ? JSON.parse(evt.flags) : (evt.flags || {});
    const isSelect = evt.operation === 'SELECT';

    const isUnbounded = Boolean(flags.is_unbounded_read) ||
      (isSelect && Boolean(flags.select_star) && !flags.has_limit) ||
      (isSelect && !flags.has_where && !flags.has_limit);

    const hasHighRows = Number(evt.rows_hint) > 500;

    return isUnbounded || hasHighRows;
  });

  if (matches.length > 0) {
    return {
      rule_id: 'bulk_export',
      weight: 30,
      evidence_event_ids: matches.map(e => e.id).filter(Boolean),
      explanation: `Bulk data export detected: ${matches.length} unbounded SELECT query/queries executed without WHERE or LIMIT clause`
    };
  }

  return null;
}
