// EP2, EP3, EP4 — served from the geography cache (§7.6)
import { ApiError } from '../lib/errors.js';
import { districtOfSubstation, districtsById, provinceOfDistrict, provincesById, substationsById } from '../lib/geography.js';
import { sendWithCaching } from '../lib/http-cache.js';
import { collection, paging } from '../lib/pagination.js';
import { readQuery } from '../lib/query.js';
import * as represent from '../lib/representations.js';

const ID_PATTERN = /^[1-9][0-9]*$/; // §6.1

function latestUpdate(docs) {
  return new Date(Math.max(...docs.map((doc) => doc.updated_at.getTime())));
}

// §6.1: invalid path id or unknown id → 404 40401
function findById(map, rawId) {
  const doc = ID_PATTERN.test(rawId) ? map.get(Number(rawId)) : undefined;
  if (!doc) {
    throw new ApiError(40401, 'No record exists with this id.');
  }
  return doc;
}

function sendList(req, res, map, query, keep, toBody) {
  const { offset, limit } = paging(query);
  const all = [...map.values()];
  const matching = all.filter(keep);
  const items = matching.slice(offset, offset + limit).map(toBody);
  const body = collection(req, { count: matching.length, items, offset, limit });
  sendWithCaching(req, res, body, latestUpdate(all)); // §6.7: latest updated_at in the collection
}

function sendMember(req, res, map, toBody) {
  readQuery(req, []);
  const doc = findById(map, req.params.id);
  sendWithCaching(req, res, toBody(doc), doc.updated_at);
}

// EP2
export function listProvinces(req, res) {
  const query = readQuery(req, ['offset', 'limit']);
  sendList(req, res, provincesById, query, () => true, represent.province);
}

export function getProvince(req, res) {
  sendMember(req, res, provincesById, represent.province);
}

// EP3
export function listDistricts(req, res) {
  const query = readQuery(req, ['province-id', 'offset', 'limit']);
  const provinceId = query['province-id'];
  const keep = (district) => provinceId === undefined || district.province_id === provinceId;
  sendList(req, res, districtsById, query, keep, represent.district);
}

export function getDistrict(req, res) {
  sendMember(req, res, districtsById, represent.district);
}

// EP4
export function listSubstations(req, res) {
  const query = readQuery(req, ['province-id', 'district-id', 'offset', 'limit']);
  const provinceId = query['province-id'];
  const districtId = query['district-id'];
  const keep = (substation) => {
    const district = districtOfSubstation.get(substation.substation_id);
    return (
      (districtId === undefined || district === districtId) &&
      (provinceId === undefined || provinceOfDistrict.get(district) === provinceId)
    );
  };
  sendList(req, res, substationsById, query, keep, represent.substation);
}

export function getSubstation(req, res) {
  sendMember(req, res, substationsById, represent.substation);
}
