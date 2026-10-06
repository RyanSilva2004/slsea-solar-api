// §6.6 Timestamps, §8 Sri Lanka day

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const SRI_LANKA_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function parseTimestamp(text) {
  if (typeof text !== 'string' || !TIMESTAMP_PATTERN.test(text)) {
    return null;
  }
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export function toIso(date) {
  return date.toISOString();
}

export function floorToSecond(date) {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

export function toHttpDate(date) {
  return date.toUTCString();
}

export function parseHttpDate(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export function sriLankaDay(now) {
  const day = new Date(now.getTime() + SRI_LANKA_OFFSET_MS).toISOString().slice(0, 10);
  const dayStart = new Date(Date.parse(`${day}T00:00:00.000Z`) - SRI_LANKA_OFFSET_MS);
  return { day, dayStart };
}
