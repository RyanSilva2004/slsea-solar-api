// §8 Derived values
import Reading from '../models/reading.js';
import { sriLankaDay } from './time.js';

const SILENT_AFTER_MS = 30 * 60 * 1000;

// Latest reading per installation: Map installation_id → reading
export async function latestReadings(ids) {
  const groups = await Reading.aggregate([
    { $match: { installation_id: { $in: ids } } },
    { $sort: { installation_id: -1, recorded_at: -1 } },
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

// Energy today per installation: Map installation_id → lastToday.energy_kwh − baseline.energy_kwh
export async function energyToday(ids, now) {
  const { dayStart } = sriLankaDay(now);
  const [today, before] = await Promise.all([
    Reading.aggregate([
      { $match: { installation_id: { $in: ids }, recorded_at: { $gte: dayStart, $lte: now } } },
      { $sort: { installation_id: 1, recorded_at: 1 } },
      { $group: { _id: '$installation_id', first: { $first: '$energy_kwh' }, last: { $last: '$energy_kwh' } } },
    ]),
    Reading.aggregate([
      { $match: { installation_id: { $in: ids }, recorded_at: { $lt: dayStart } } },
      { $sort: { installation_id: -1, recorded_at: -1 } },
      { $group: { _id: '$installation_id', energy: { $first: '$energy_kwh' } } },
    ]),
  ]);
  const baselines = new Map(before.map((group) => [group._id, group.energy]));
  return new Map(today.map((group) => [group._id, group.last - (baselines.get(group._id) ?? group.first)]));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

// Summary over a set of installations (any status)
export async function summary(installations, now) {
  const ids = installations.map((installation) => installation.installation_id);
  const [latest, energy] = await Promise.all([latestReadings(ids), energyToday(ids, now)]);
  const counts = { active: 0, reporting: 0, silent: 0, never_reported: 0, decommissioned: 0 };
  let currentPower = 0;
  for (const installation of installations) {
    if (installation.status === 'DECOMMISSIONED') {
      counts.decommissioned += 1;
      continue;
    }
    counts.active += 1;
    const reading = latest.get(installation.installation_id);
    const status = reportingStatus(installation, reading, now);
    counts[status.toLowerCase()] += 1;
    if (status === 'REPORTING') {
      currentPower += reading.power_kw;
    }
  }
  let energyTotal = 0;
  for (const contribution of energy.values()) {
    energyTotal += contribution;
  }
  return {
    current_power_kw: round3(currentPower),
    energy_today_kwh: round3(energyTotal),
    installations: counts,
  };
}
