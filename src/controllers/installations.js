// EP6 /installations, EP7 /installations/{installation-id}, EP8 overview, EP12 device credential
import { latestReadings, reportingStatus } from '../lib/derived.js';
import { ApiError, fieldError } from '../lib/errors.js';
import {
  districtInArea,
  districtOfInstallation,
  districtsById,
  installationInArea,
  provinceInArea,
  provinceOfDistrict,
  provincesById,
  substationInArea,
  substationsById,
  substationsOfArea,
} from '../lib/geography.js';
import { checkIfMatch, sendCreated, sendUpdated, sendWithCaching } from '../lib/http-cache.js';
import { nextInstallationId } from '../lib/ids.js';
import { collection, paging } from '../lib/pagination.js';
import { readQuery } from '../lib/query.js';
import * as represent from '../lib/representations.js';
import { hashDeviceSecret, newDeviceSecret } from '../lib/secrets.js';
import { toIso } from '../lib/time.js';
import { readInstallationBody } from '../lib/validation.js';
import Installation from '../models/installation.js';
import Reading from '../models/reading.js';

export const INSTALLATION_ID_PATTERN = /^INS-[0-9]{6}$/; // §6.1

function outsideJurisdiction(message) {
  return new ApiError(40302, message);
}

// §6.1, §7.6: invalid path id, unknown id or outside the caller's area → 404 40401
export async function findInstallation(req) {
  const rawId = req.params.id;
  const installation = INSTALLATION_ID_PATTERN.test(rawId)
    ? await Installation.findOne({ installation_id: rawId }).lean()
    : null;
  if (!installation || !installationInArea(installation, req.principal.area)) {
    throw new ApiError(40401, 'No installation exists with this id.');
  }
  return installation;
}

function checkSubstationInArea(req, substationId) {
  if (!substationInArea(substationId, req.principal.area)) {
    throw outsideJurisdiction('The substation is outside your jurisdiction.');
  }
}

function meterTaken() {
  return new ApiError(40902, 'This meter_id is already registered to another installation.');
}

// §9 EP6: also catch the unique index error 11000
async function saveCatchingDuplicate(save) {
  try {
    await save();
  } catch (err) {
    if (err?.code === 11000) {
      throw meterTaken();
    }
    throw err;
  }
}

// §7.6: every region filter must be inside the caller's area
function checkFiltersInArea(query, area) {
  const inside =
    (query['province-id'] === undefined || provinceInArea(query['province-id'], area)) &&
    (query['district-id'] === undefined || districtInArea(query['district-id'], area)) &&
    (query['substation-id'] === undefined || substationInArea(query['substation-id'], area));
  if (!inside) {
    throw outsideJurisdiction('The region filter is outside your jurisdiction.');
  }
}

function matchesFilters(installation, query) {
  const districtId = districtOfInstallation(installation);
  return (
    (query['province-id'] === undefined || provinceOfDistrict.get(districtId) === query['province-id']) &&
    (query['district-id'] === undefined || districtId === query['district-id']) &&
    (query['substation-id'] === undefined || installation.substation_id === query['substation-id']) &&
    (query.status === undefined || installation.status === query.status)
  );
}

// §9 EP6: keeps only ACTIVE installations with the given reporting status
async function withReportingStatus(installations, wanted) {
  const active = installations.filter((installation) => installation.status === 'ACTIVE');
  const latest = await latestReadings(active.map((installation) => installation.installation_id));
  const now = new Date();
  return active.filter(
    (installation) => reportingStatus(installation, latest.get(installation.installation_id), now) === wanted,
  );
}

// EP6 GET: filtering and paging in memory after loading the area's installations
export async function listInstallations(req, res) {
  const query = readQuery(req, [
    'province-id',
    'district-id',
    'substation-id',
    'status',
    'reporting-status',
    'offset',
    'limit',
  ]);
  const { offset, limit } = paging(query);
  const area = req.principal.area;
  checkFiltersInArea(query, area);

  const inArea = await Installation.find({ substation_id: { $in: substationsOfArea(area) } })
    .sort({ installation_id: 1 })
    .lean();
  let matching = inArea.filter((installation) => matchesFilters(installation, query));
  if (query['reporting-status'] !== undefined) {
    matching = await withReportingStatus(matching, query['reporting-status']);
  }

  const items = matching.slice(offset, offset + limit).map(represent.installation);
  const body = collection(req, { count: matching.length, items, offset, limit });
  sendWithCaching(req, res, body, new Date());
}

// EP6 POST: body → substation in area → meter taken
export async function createInstallation(req, res) {
  readQuery(req, []);
  const fields = readInstallationBody(req.body, { withStatus: false });
  checkSubstationInArea(req, fields.substation_id);
  if (await Installation.exists({ meter_id: fields.meter_id })) {
    throw meterTaken();
  }
  const now = new Date();
  const installation = {
    installation_id: await nextInstallationId(),
    ...fields,
    status: 'ACTIVE',
    device_secret_hash: null,
    device_secret_issued_at: null,
    created_at: now,
    updated_at: now,
  };
  await saveCatchingDuplicate(() => Installation.create(installation));
  sendCreated(res, represent.installation(installation), `/installations/${installation.installation_id}`, now);
}

// EP7 GET
export async function getInstallation(req, res) {
  readQuery(req, []);
  const installation = await findInstallation(req);
  sendWithCaching(req, res, represent.installation(installation), installation.updated_at);
}

// EP7 PUT: body → 404 → substation in area → If-Match → meter taken by another installation
export async function replaceInstallation(req, res) {
  readQuery(req, []);
  const fields = readInstallationBody(req.body, { withStatus: true });
  const installation = await findInstallation(req);
  checkSubstationInArea(req, fields.substation_id);
  checkIfMatch(req, represent.installation(installation));
  const meterFilter = { meter_id: fields.meter_id, installation_id: { $ne: installation.installation_id } };
  if (await Installation.exists(meterFilter)) {
    throw meterTaken();
  }
  const now = new Date();
  const update = { ...fields, updated_at: now };
  if (installation.status !== 'DECOMMISSIONED' && fields.status === 'DECOMMISSIONED') {
    // §7.7: credential removed on decommissioning
    update.device_secret_hash = null;
    update.device_secret_issued_at = null;
  }
  await saveCatchingDuplicate(() =>
    Installation.updateOne({ installation_id: installation.installation_id }, { $set: update }),
  );
  sendUpdated(res, represent.installation({ ...installation, ...fields }), now);
}

// EP7 DELETE: 404 → If-Match → has readings → delete
export async function deleteInstallation(req, res) {
  readQuery(req, []);
  const installation = await findInstallation(req);
  checkIfMatch(req, represent.installation(installation));
  if (await Reading.exists({ installation_id: installation.installation_id })) {
    throw new ApiError(40903, 'An installation with readings cannot be deleted; decommission it instead.');
  }
  await Installation.deleteOne({ installation_id: installation.installation_id });
  res.json(represent.installation(installation));
}

// EP8 GET: Last-Modified = response time
export async function getOverview(req, res) {
  readQuery(req, []);
  const installation = await findInstallation(req);
  const now = new Date();
  const latest = (await latestReadings([installation.installation_id])).get(installation.installation_id) ?? null;
  const district = districtsById.get(districtOfInstallation(installation));
  const body = represent.overview({
    installation,
    substation: substationsById.get(installation.substation_id),
    district,
    province: provincesById.get(district.province_id),
    reportingStatus: reportingStatus(installation, latest, now),
    latest,
  });
  sendWithCaching(req, res, body, now);
}

// §9 EP12: a non-empty request body → 400 40001
function rejectBody(req) {
  const length = Number(req.get('Content-Length') ?? 0);
  if (length > 0 || req.get('Transfer-Encoding') !== undefined) {
    const message = 'This request takes no body.';
    throw new ApiError(40001, message, { errors: [fieldError(40001, message)] });
  }
}

// EP12 POST: §7.7 a new secret replaces any old one; updated_at is not changed
export async function issueCredential(req, res) {
  readQuery(req, []);
  rejectBody(req);
  const installation = await findInstallation(req);
  if (installation.status === 'DECOMMISSIONED') {
    throw new ApiError(40304, 'A device credential cannot be issued for a decommissioned installation.');
  }
  const secret = newDeviceSecret();
  const now = new Date();
  await Installation.updateOne(
    { installation_id: installation.installation_id },
    { $set: { device_secret_hash: hashDeviceSecret(secret), device_secret_issued_at: now } },
  );
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }); // §6.11
  res.json({ installation_id: installation.installation_id, device_secret: secret, issued_at: toIso(now) });
}
