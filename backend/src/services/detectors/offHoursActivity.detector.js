// backend/src/services/detectors/offHoursActivity.detector.js

/**
 * Off-Hours Activity Detector
 * Flags database operations performed outside the user's regular working hours baseline.
 *
 * @param {Array} events - Stream of SQL events for the session
 * @param {object} baseline - User's baseline { typical_hours_start, typical_hours_end }
 * @param {object} [context]
 * @returns {object|null} { rule_id, weight, evidence_event_ids, explanation } or null
 */
export function detectOffHoursActivity(events, baseline, context = {}) {
  if (!events || events.length === 0 || !baseline) return null;

  const startHour = baseline.typical_hours_start !== undefined ? baseline.typical_hours_start : 9;
  const endHour = baseline.typical_hours_end !== undefined ? baseline.typical_hours_end : 18;

  const matches = events.filter(evt => {
    const time = new Date(evt.event_time);
    const hour = time.getHours();
    return hour < startHour || hour >= endHour;
  });

  if (matches.length > 0) {
    const hoursSeen = [...new Set(matches.map(m => new Date(m.event_time).getHours()))].sort((a, b) => a - b);
    return {
      rule_id: 'off_hours_activity',
      weight: 20,
      evidence_event_ids: matches.map(e => e.id).filter(Boolean),
      explanation: `Off-hours query execution detected at hour(s) [${hoursSeen.join(', ')}:00] outside user's regular schedule (${startHour}:00 - ${endHour}:00)`
    };
  }

  return null;
}
