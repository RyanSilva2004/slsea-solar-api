// §6.3 Representations
import { toIso } from './time.js';

export function province(doc) {
  return { province_id: doc.province_id, name: doc.name };
}

export function district(doc) {
  return { district_id: doc.district_id, name: doc.name, province_id: doc.province_id };
}

export function substation(doc) {
  return { substation_id: doc.substation_id, name: doc.name, district_id: doc.district_id };
}

export function installation(doc) {
  return {
    installation_id: doc.installation_id,
    meter_id: doc.meter_id,
    capacity_kw: doc.capacity_kw,
    status: doc.status,
    substation_id: doc.substation_id,
  };
}

export function reading(doc) {
  return {
    reading_id: doc.reading_id,
    installation_id: doc.installation_id,
    recorded_at: toIso(doc.recorded_at),
    power_kw: doc.power_kw,
    energy_kwh: doc.energy_kwh,
    voltage: doc.voltage,
  };
}

export function user(doc) {
  return {
    user_id: doc.user_id,
    name: doc.name,
    username: doc.username,
    role: doc.role,
    jurisdiction_level: doc.jurisdiction_level,
    district_id: doc.district_id,
  };
}

// §9 EP8: geography entries carry only id and name
export function overview({ installation: doc, substation, district, province, reportingStatus, latest }) {
  return {
    installation: installation(doc),
    substation: { substation_id: substation.substation_id, name: substation.name },
    district: { district_id: district.district_id, name: district.name },
    province: { province_id: province.province_id, name: province.name },
    reporting_status: reportingStatus,
    last_known_reading: latest ? reading(latest) : null,
  };
}

// §9 EP5: totals = summary(...) from lib/derived.js
export function generationSummary({ area, day, computedAt, totals }) {
  return {
    area,
    day,
    computed_at: toIso(computedAt),
    current_power_kw: totals.current_power_kw,
    energy_today_kwh: totals.energy_today_kwh,
    installations: totals.installations,
  };
}
