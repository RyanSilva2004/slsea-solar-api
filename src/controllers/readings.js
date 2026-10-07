// EP9 last-known reading, EP10 readings history and ingestion, EP11 reading member
import config from '../config.js';
import { audit } from '../lib/audit.js';
import { ApiError, fieldError } from '../lib/errors.js';
import { sendCreated, sendUpdated, sendWithCaching } from '../lib/http-cache.js';
import { nextReadingId } from '../lib/ids.js';
import { collection, paging } from '../lib/pagination.js';
import { readQuery } from '../lib/query.js';
import * as represent from '../lib/representations.js';
import { parseTimestamp } from '../lib/time.js';
import { readReadingBody } from '../lib/validation.js';
import Reading from '../models/reading.js';
import { findInstallation, INSTALLATION_ID_PATTERN } from './installations.js';

const READING_ID_PATTERN = /^[1-9][0-9]*$/; // §6.1
const MAX_FUTURE_MS = 2 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readingPath(reading) {
  return `/installations/${reading.installation_id}/readings/${reading.reading_id}`;
}

function problems(code, messages) {
  return new ApiError(code, messages.join(' '), { errors: messages.map((message) => fieldError(code, message)) });
}

// §9 EP10 GET: recorded_at window, from inclusive, to exclusive
function readingsFilter(installationId, query) {
  const filter = { installation_id: installationId };
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

// EP10 GET
export async function listReadings(req, res) {
  const query = readQuery(req, ['from', 'to', 'sort', 'offset', 'limit']);
  const { offset, limit } = paging(query);
  const installation = await findInstallation(req);
  const installationId = installation.installation_id;
  const filter = readingsFilter(installationId, query);
  const direction = query.sort === 'recorded-at:asc' ? 1 : -1;

  const [count, readings, lastReceived] = await Promise.all([
    Reading.countDocuments(filter),
    Reading.find(filter).sort({ recorded_at: direction }).skip(offset).limit(limit).lean(),
    Reading.findOne({ installation_id: installationId }, { received_at: 1 }).sort({ received_at: -1 }).lean(),
  ]);
  const body = collection(req, { count, items: readings.map(represent.reading), offset, limit });
  // §6.7: latest received_at of the installation, its created_at when it has none
  sendWithCaching(req, res, body, lastReceived?.received_at ?? installation.created_at);
}

// EP11 GET: a reading of another installation is not found
export async function getReading(req, res) {
  readQuery(req, []);
  const installation = await findInstallation(req);
  const rawId = req.params.readingId;
  const reading = READING_ID_PATTERN.test(rawId)
    ? await Reading.findOne({ reading_id: Number(rawId), installation_id: installation.installation_id }).lean()
    : null;
  if (!reading) {
    throw new ApiError(40401, 'No reading exists with this id for this installation.');
  }
  sendWithCaching(req, res, represent.reading(reading), reading.received_at);
}

// EP9 GET: newest reading by recorded_at
export async function getLastKnownReading(req, res) {
  readQuery(req, []);
  const installation = await findInstallation(req);
  const reading = await Reading.findOne({ installation_id: installation.installation_id })
    .sort({ recorded_at: -1 })
    .lean();
  if (!reading) {
    throw new ApiError(40402, 'This installation has not sent any readings yet.');
  }
  res.set('Content-Location', `${config.publicBaseUrl}${readingPath(reading)}`);
  sendWithCaching(req, res, represent.reading(reading), reading.received_at);
}

// EP10 POST step 2: §6.6 format, at most 2 minutes ahead, at most 7 days old
function readRecordedAt(text, now) {
  const recordedAt = parseTimestamp(text);
  if (!recordedAt) {
    throw problems(40003, ['recorded_at must be an ISO 8601 timestamp with a time zone offset.']);
  }
  if (recordedAt.getTime() - now.getTime() > MAX_FUTURE_MS) {
    throw problems(40003, ['recorded_at is more than 2 minutes in the future.']);
  }
  if (now.getTime() - recordedAt.getTime() > MAX_AGE_MS) {
    throw problems(40003, ['recorded_at is more than 7 days in the past.']);
  }
  return recordedAt;
}

// EP10 POST step 3: a device writes only to its own installation (§6.1: an invalid path id is not found)
function ownInstallation(req) {
  const own = req.principal.installation;
  const pathId = req.params.id;
  if (pathId === own.installation_id) {
    return own;
  }
  if (!INSTALLATION_ID_PATTERN.test(pathId)) {
    throw new ApiError(40401, 'No installation exists with this id.');
  }
  audit('wrong_installation', { token_installation: own.installation_id, path_installation: pathId });
  throw new ApiError(40306, 'This device token belongs to another installation.');
}

// EP10 POST step 5
function checkRanges(values, capacityKw) {
  const maxPower = Math.round(capacityKw * 1.05 * 1000) / 1000;
  const messages = [];
  if (values.power_kw < 0 || values.power_kw > capacityKw * 1.05) {
    messages.push(`power_kw must be from 0 to ${maxPower} (capacity_kw × 1.05).`);
  }
  if (values.voltage < 180 || values.voltage > 270) {
    messages.push('voltage must be from 180 to 270.');
  }
  if (values.energy_kwh < 0) {
    messages.push('energy_kwh must not be negative.');
  }
  if (messages.length > 0) {
    throw problems(40004, messages);
  }
}

function sameValues(stored, reading) {
  return (
    stored.power_kw === reading.power_kw &&
    stored.energy_kwh === reading.energy_kwh &&
    stored.voltage === reading.voltage
  );
}

// EP10 POST step 6: identical resend → 200 with the stored reading; different values → 409
function answerExisting(res, stored, reading) {
  if (!sameValues(stored, reading)) {
    throw new ApiError(40901, 'Another reading with this recorded_at and different values exists.');
  }
  res.set('Content-Location', `${config.publicBaseUrl}${readingPath(stored)}`);
  // §6.11: 200 with ETag and Last-Modified, as for a GET of the reading
  sendUpdated(res, represent.reading(stored), stored.received_at);
}

// EP10 POST step 7: the lifetime counter must fit between its neighbours in time
async function checkCounter(reading) {
  const { installation_id: installationId, recorded_at: recordedAt, energy_kwh: energyKwh } = reading;
  const [prev, next] = await Promise.all([
    Reading.findOne({ installation_id: installationId, recorded_at: { $lt: recordedAt } })
      .sort({ recorded_at: -1 })
      .lean(),
    Reading.findOne({ installation_id: installationId, recorded_at: { $gt: recordedAt } })
      .sort({ recorded_at: 1 })
      .lean(),
  ]);
  const messages = [];
  if (prev && energyKwh < prev.energy_kwh) {
    messages.push(`energy_kwh is below ${prev.energy_kwh}, the counter of the previous reading.`);
  }
  if (next && energyKwh > next.energy_kwh) {
    messages.push(`energy_kwh is above ${next.energy_kwh}, the counter of the next reading.`);
  }
  if (messages.length > 0) {
    throw problems(40005, messages);
  }
}

// EP10 POST step 8: null when (installation_id, recorded_at) was taken meanwhile
async function insertReading(reading) {
  const stored = { reading_id: await nextReadingId(), ...reading, received_at: new Date() };
  try {
    await Reading.create(stored);
    return stored;
  } catch (err) {
    if (err?.code === 11000 && err.keyPattern?.recorded_at) {
      return null;
    }
    throw err;
  }
}

// EP10 POST: steps 1–9 in order
export async function createReading(req, res) {
  readQuery(req, []);
  const values = readReadingBody(req.body);
  const recordedAt = readRecordedAt(values.recorded_at, new Date());
  const installation = ownInstallation(req);
  if (installation.status === 'DECOMMISSIONED') {
    throw new ApiError(40304, 'Readings cannot be sent for a decommissioned installation.');
  }
  checkRanges(values, installation.capacity_kw);

  const reading = { ...values, installation_id: installation.installation_id, recorded_at: recordedAt };
  for (;;) {
    const existing = await Reading.findOne({
      installation_id: reading.installation_id,
      recorded_at: reading.recorded_at,
    }).lean();
    if (existing) {
      return answerExisting(res, existing, reading);
    }
    await checkCounter(reading);
    const stored = await insertReading(reading);
    if (stored) {
      return sendCreated(res, represent.reading(stored), readingPath(stored), stored.received_at);
    }
  }
}
