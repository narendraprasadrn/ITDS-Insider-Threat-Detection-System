// backend/src/services/detectors/crossSchemaRead.detector.js

/**
 * Cross-Schema Read Detector
 * Flags database queries that span multiple schemas or target restricted system schemas
 * (e.g. mysql.*, information_schema.*, itds_app.*).
 *
 * @param {Array} events - Stream of SQL events for the session
 * @param {object} [baseline]
 * @param {object} [context]
 * @returns {object|null} { rule_id, weight, evidence_event_ids, explanation } or null
 */
export function detectCrossSchemaRead(events, baseline, context = {}) {
  if (!events || events.length === 0) return null;

  const matches = events.filter(evt => {
    const flags = typeof evt.flags === 'string' ? JSON.parse(evt.flags) : (evt.flags || {});
    if (flags.is_cross_schema) return true;

    const rawTables = typeof evt.tables === 'string' ? JSON.parse(evt.tables) : (evt.tables || []);
    const schemas = rawTables
      .map(t => t.includes('.') ? t.split('.')[0] : null)
      .filter(Boolean);

    const uniqueSchemas = [...new Set(schemas)];
    // Multi-schema query or query targeting system schemas
    if (uniqueSchemas.length > 1) return true;
    if (uniqueSchemas.some(s => ['mysql', 'information_schema', 'performance_schema', 'sys'].includes(s))) {
      return true;
    }

    return false;
  });

  if (matches.length > 0) {
    return {
      rule_id: 'cross_schema_read',
      weight: 30,
      evidence_event_ids: matches.map(e => e.id).filter(Boolean),
      explanation: `Cross-schema reconnaissance query detected traversing multiple database namespaces`
    };
  }

  return null;
}
