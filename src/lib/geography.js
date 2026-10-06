// §7.6 Geography cache and areas
import Province from '../models/province.js';
import District from '../models/district.js';
import Substation from '../models/substation.js';

export const provincesById = new Map();
export const districtsById = new Map();
export const substationsById = new Map();
export const districtsByProvince = new Map();
export const substationsByDistrict = new Map();
export const districtOfSubstation = new Map();
export const provinceOfDistrict = new Map();

function addToList(map, key, value) {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push(value);
}

export async function loadGeography() {
  const [provinces, districts, substations] = await Promise.all([
    Province.find().sort({ province_id: 1 }).lean(),
    District.find().sort({ district_id: 1 }).lean(),
    Substation.find().sort({ substation_id: 1 }).lean(),
  ]);

  for (const province of provinces) {
    provincesById.set(province.province_id, province);
    districtsByProvince.set(province.province_id, []);
  }
  for (const district of districts) {
    districtsById.set(district.district_id, district);
    provinceOfDistrict.set(district.district_id, district.province_id);
    addToList(districtsByProvince, district.province_id, district.district_id);
    substationsByDistrict.set(district.district_id, []);
  }
  for (const substation of substations) {
    substationsById.set(substation.substation_id, substation);
    districtOfSubstation.set(substation.substation_id, substation.district_id);
    addToList(substationsByDistrict, substation.district_id, substation.substation_id);
  }

  return { provinces: provincesById.size, districts: districtsById.size, substations: substationsById.size };
}

export function districtOfInstallation(installation) {
  return districtOfSubstation.get(installation.substation_id);
}

// Set of district ids the user may see
export function areaOf(user) {
  if (user.jurisdiction_level === 'NATIONAL') {
    return new Set(districtsById.keys());
  }
  if (user.jurisdiction_level === 'PROVINCIAL') {
    const provinceId = provinceOfDistrict.get(user.district_id);
    return new Set(districtsByProvince.get(provinceId) ?? []);
  }
  return new Set([user.district_id]);
}

// §7.6: a region is inside the area if every one of its districts is in the area set
export function districtInArea(districtId, area) {
  return area.has(districtId);
}

export function provinceInArea(provinceId, area) {
  return (districtsByProvince.get(provinceId) ?? []).every((districtId) => area.has(districtId));
}

export function substationInArea(substationId, area) {
  return area.has(districtOfSubstation.get(substationId));
}

export function installationInArea(installation, area) {
  return area.has(districtOfInstallation(installation));
}

export function substationsOfArea(area) {
  return [...area].flatMap((districtId) => substationsByDistrict.get(districtId) ?? []);
}
