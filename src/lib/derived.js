// §8 Derived values
import Reading from '../models/reading.js';

const SILENT_AFTER_MS = 30 * 60 * 1000;

// Latest reading per installation: Map installation_id → reading
export async function latestReadings(ids) {
  const groups = await Reading.aggregate([
    { $match: { installation_id: { $in: ids } } },
    { $sort: { installation_id: 1, recorded_at: -1 } },
    { $group: { _id: '$installation_id', doc: { $first: '$$ROOT' } } },
  ]);
  return new Map(groups.map((group) => [group._id, group.doc]));
}

export function reportingStatus(installation, latest, now) {
  if (installation.status === 'DECOMMISSIONED') {
    return null;
  }
  if (!latest) {
    return 'NEVER_REPORTED';
  }
  return now.getTime() - latest.recorded_at.getTime() > SILENT_AFTER_MS ? 'SILENT' : 'REPORTING';
}
