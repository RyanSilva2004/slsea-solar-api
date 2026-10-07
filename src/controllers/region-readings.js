// EP17 region readings
import { ApiError, fieldError } from '../lib/errors.js';
import {
  districtInArea,
  districtOfSubstation,
  districtsById,
  districtsByProvince,
  provinceInArea,
  provincesById,
  substationsByDistrict,
} from '../lib/geography.js';
import { sendWithCaching } from '../lib/http-cache.js';
import { collection, paging } from '../lib/pagination.js';
import { readQuery } from '../lib/query.js';
import * as represent from '../lib/representations.js';
import Installation from '../models/installation.js';
import Reading from '../models/reading.js';

const REGION_ID_PATTERN = /^[1-9][0-9]*$/; // §6.1
const TIME_PARAMS = ['from', 'to', 'sort', 'offset', 'limit'];

function invalidFilter(message) {
  return new ApiError(40002, message, { errors: [fieldError(40002, message)] });
}

// §6.1: an invalid path id is not found → null
function pathRegionId(req, map) {
  const rawId = req.params.id;
  const id = REGION_ID_PATTERN.test(rawId) ? Number(rawId) : null;
  return id !== null && map.has(id) ? id : null;
}

// §9 EP17: filters must lie inside the path region (districts) and the given district-id
function checkFilters(query, districts) {
  const districtId = query['district-id'];
  if (districtId !== undefined && !districts.includes(districtId)) {
    throw invalidFilter('district-id is not inside the region of this path.');
  }
  const substationId = query['substation-id'];
  if (substationId === undefined) {
    return;
  }
  const substationDistrict = districtOfSubstation.get(substationId);
  if (!districts.includes(substationDistrict)) {
    throw invalidFilter('substation-id is not inside the region of this path.');
  }
  if (districtId !== undefined && substationDistrict !== districtId) {
    throw invalidFilter('substation-id is not inside the given district-id.');
  }
}

function substationsOfRegion(query, districts) {
  if (query['substation-id'] !== undefined) {
    return [query['substation-id']];
  }
  const narrowed = query['district-id'] !== undefined ? [query['district-id']] : districts;
  return narrowed.flatMap((districtId) => substationsByDistrict.get(districtId) ?? []);
}

function readingsFilter(installationIds, query) {
  const filter = { installation_id: { $in: installationIds } };
  if (query.from || query.to) {
    filter.recorded_at = {};
    if (query.from) {
      filter.recorded_at.$gte = query.from;
    }
    if (query.to) {
      filter.recorded_at.$lt = query.to;
    }
  }
  return filter;
}

// §9 EP17 query: installations of the region (any status) → their readings; Last-Modified = response time
async function sendRegionReadings(req, res, query, districts) {
  const { offset, limit } = paging(query);
  const installations = await Installation.find(
    { substation_id: { $in: substationsOfRegion(query, districts) } },
    { installation_id: 1 },
  ).lean();
  const filter = readingsFilter(
    installations.map((installation) => installation.installation_id),
    query,
  );
  const direction = query.sort === 'recorded-at:asc' ? 1 : -1;
  const [count, readings] = await Promise.all([
    Reading.countDocuments(filter),
    Reading.find(filter).sort({ recorded_at: direction, installation_id: 1 }).skip(offset).limit(limit).lean(),
  ]);
  const body = collection(req, { count, items: readings.map(represent.reading), offset, limit });
  sendWithCaching(req, res, body, new Date());
}

// Order: params (400) → unknown region (404) → region not inside the caller's area (403)
function checkRegion(id, inArea, area) {
  if (id === null) {
    throw new ApiError(40401, 'No region exists with this id.');
  }
  if (!inArea(id, area)) {
    throw new ApiError(40302, 'The region is outside your jurisdiction.');
  }
}

// EP17 /districts/{district-id}/readings
export async function listDistrictReadings(req, res) {
  const query = readQuery(req, ['substation-id', ...TIME_PARAMS]);
  const id = pathRegionId(req, districtsById);
  const districts = id === null ? [] : [id];
  checkFilters(query, districts);
  checkRegion(id, districtInArea, req.principal.area);
  await sendRegionReadings(req, res, query, districts);
}

// EP17 /provinces/{province-id}/readings
export async function listProvinceReadings(req, res) {
  const query = readQuery(req, ['district-id', 'substation-id', ...TIME_PARAMS]);
  const id = pathRegionId(req, provincesById);
  const districts = id === null ? [] : districtsByProvince.get(id);
  checkFilters(query, districts);
  checkRegion(id, provinceInArea, req.principal.area);
  await sendRegionReadings(req, res, query, districts);
}
