// backend/src/services/detectors/index.js
import { detectHighQueryVelocity } from './highQueryVelocity.detector.js';
import { detectBulkExport } from './bulkExport.detector.js';
import { detectOffHoursActivity } from './offHoursActivity.detector.js';
import { detectOutOfProfileTable } from './outOfProfileTable.detector.js';
import { detectRapidFailedQueries } from './rapidFailedQueries.detector.js';
import { detectCrossSchemaRead } from './crossSchemaRead.detector.js';

export const detectors = [
  { id: 'high_query_velocity', fn: detectHighQueryVelocity },
  { id: 'bulk_export', fn: detectBulkExport },
  { id: 'off_hours_activity', fn: detectOffHoursActivity },
  { id: 'out_of_profile_table', fn: detectOutOfProfileTable },
  { id: 'rapid_failed_queries', fn: detectRapidFailedQueries },
  { id: 'cross_schema_read', fn: detectCrossSchemaRead }
];

export {
  detectHighQueryVelocity,
  detectBulkExport,
  detectOffHoursActivity,
  detectOutOfProfileTable,
  detectRapidFailedQueries,
  detectCrossSchemaRead
};
