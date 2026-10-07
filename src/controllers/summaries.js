// EP5 generation summaries
import { summary } from '../lib/derived.js';
import { ApiError } from '../lib/errors.js';
import {
  districtInArea,
  districtsById,
  districtsByProvince,
  provinceInArea,
  provincesById,
  substationsByDistrict,
} from '../lib/geography.js';
import { sendWithCaching } from '../lib/http-cache.js';
import { readQuery } from '../lib/query.js';
import * as represent from '../lib/representations.js';
import { sriLankaDay } from '../lib/time.js';
import Installation from '../models/installation.js';

const REGION_ID_PATTERN = /^[1-9][0-9]*$/; // §6.1

// §6.1: an invalid path id is not found → 404
function pathRegion(req, map) {
  const rawId = req.params.id;
  const region = REGION_ID_PATTERN.test(rawId) ? map.get(Number(rawId)) : undefined;
  if (!region) {
    throw new ApiError(40401, 'No region exists with this id.');
  }
  return region;
}

function outsideArea() {
  return new ApiError(40302, 'The region is outside your jurisdiction.');
}

// §9 EP5: installations of the region (any status); ETag ignores computed_at; Last-Modified = response time
async function sendSummary(req, res, area, districts) {
  const now = new Date();
  const substations = districts.flatMap((districtId) => substationsByDistrict.get(districtId) ?? []);
  const installations = await Installation.find(
    { substation_id: { $in: substations } },
    { installation_id: 1, status: 1 },
  ).lean();
  const totals = await summary(installations, now);
  const body = represent.generationSummary({ area, day: sriLankaDay(now).day, computedAt: now, totals });
  const { computed_at: _computedAt, ...etagSource } = body;
  sendWithCaching(req, res, body, now, etagSource);
}

// EP5 /districts/{district-id}/generation-summary
export async function getDistrictSummary(req, res) {
  readQuery(req, []);
  const district = pathRegion(req, districtsById);
  if (!districtInArea(district.district_id, req.principal.area)) {
    throw outsideArea();
  }
  const area = { level: 'DISTRICT', id: district.district_id, name: district.name };
  await sendSummary(req, res, area, [district.district_id]);
}

// EP5 /provinces/{province-id}/generation-summary
export async function getProvinceSummary(req, res) {
  readQuery(req, []);
  const province = pathRegion(req, provincesById);
  if (!provinceInArea(province.province_id, req.principal.area)) {
    throw outsideArea();
  }
  const area = { level: 'PROVINCIAL', id: province.province_id, name: province.name };
  await sendSummary(req, res, area, districtsByProvince.get(province.province_id));
}

// EP5 /generation-summary
export async function getNationalSummary(req, res) {
  readQuery(req, []);
  if (req.principal.user.jurisdiction_level !== 'NATIONAL') {
    throw outsideArea();
  }
  const area = { level: 'NATIONAL', id: null, name: 'Sri Lanka' };
  await sendSummary(req, res, area, [...districtsById.keys()]);
}
