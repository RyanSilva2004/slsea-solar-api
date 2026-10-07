// §13 L9: EP5 generation summaries
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { api, deviceToken, userToken } from './helpers.js';

const COUNT_KEYS = ['active', 'reporting', 'silent', 'never_reported', 'decommissioned'];

let colomboAnalyst;
let kandyAnalyst;
let westernAnalyst;
let nationalAnalyst;
let officer;
let admin;
let site;

function assertError(res, status, code) {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.code, code);
}

function summary(path, token, headers = {}) {
  return api('GET', `${path}generation-summary`, { token, headers });
}

function assertSummary(res, area) {
  assert.equal(res.status, 200, res.text);
  assert.ok(res.headers.get('etag'));
  assert.ok(res.headers.get('last-modified'));
  const body = res.body;
  assert.deepEqual(Object.keys(body), [
    'area',
    'day',
    'computed_at',
    'current_power_kw',
    'energy_today_kwh',
    'installations',
  ]);
  assert.deepEqual(body.area, area);
  assert.match(body.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(body.computed_at).toISOString(), body.computed_at);
  assert.deepEqual(Object.keys(body.installations), COUNT_KEYS);
  for (const value of [body.current_power_kw, body.energy_today_kwh, ...Object.values(body.installations)]) {
    assert.ok(value >= 0, `${value} >= 0`);
  }
  const { active, reporting, silent, never_reported: neverReported } = body.installations;
  assert.equal(reporting + silent + neverReported, active);
  return body;
}

// §12: a Colombo installation with a TEST- meter; decommissioned in after() once it has a reading
before(async () => {
  colomboAnalyst = await userToken('colombo.analyst');
  kandyAnalyst = await userToken('kandy.analyst');
  westernAnalyst = await userToken('western.analyst');
  nationalAnalyst = await userToken('national.analyst');
  officer = await userToken('colombo.officer');
  admin = await userToken(process.env.BOOTSTRAP_ADMIN_USERNAME, process.env.BOOTSTRAP_ADMIN_PASSWORD);

  const body = {
    meter_id: `TEST-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    capacity_kw: 5,
    substation_id: 1,
  };
  const res = await api('POST', '/installations', { token: officer, body });
  assert.equal(res.status, 201, res.text);
  site = res.body;
});

// An installation with readings cannot be deleted (§9 EP7): it is decommissioned instead
after(async () => {
  const id = site.installation_id;
  const headers = { 'If-Match': '*' };
  const res = await api('DELETE', `/installations/${id}`, { token: officer, headers });
  if (res.status === 409) {
    const { installation_id: _id, ...fields } = site;
    await api('PUT', `/installations/${id}`, { token: officer, headers, body: { ...fields, status: 'DECOMMISSIONED' } });
  }
});

test('district 1 summary counts', async () => {
  const body = assertSummary(await summary('/districts/1/', colomboAnalyst), {
    level: 'DISTRICT',
    id: 1,
    name: 'Colombo',
  });
  // Exactly 26 / 1 / 1 on a fresh seed; write tests add installations in Colombo
  assert.ok(body.installations.active >= 26);
  assert.ok(body.installations.decommissioned >= 1);
  assert.ok(body.installations.never_reported >= 1);
});

test('colombo.analyst on district 4 -> 403 40302', async () => {
  assertError(await summary('/districts/4/', colomboAnalyst), 403, 40302);
});

test('province 1: colombo.analyst -> 403 40302, western.analyst -> 200', async () => {
  assertError(await summary('/provinces/1/', colomboAnalyst), 403, 40302);
  const body = assertSummary(await summary('/provinces/1/', westernAnalyst), {
    level: 'PROVINCIAL',
    id: 1,
    name: 'Western',
  });
  assert.ok(body.installations.active >= 26);
});

test('national: western.analyst -> 403 40302, national.analyst -> 200', async () => {
  assertError(await summary('/', westernAnalyst), 403, 40302);
  const body = assertSummary(await summary('/', nationalAnalyst), { level: 'NATIONAL', id: null, name: 'Sri Lanka' });
  assert.ok(body.installations.active + body.installations.decommissioned >= 240);
});

test('admin -> 403 40301', async () => {
  assertError(await summary('/districts/1/', admin), 403, 40301);
});

test('unknown region -> 404 40401; query parameter -> 400 40002; POST -> 405', async () => {
  assertError(await summary('/districts/99/', nationalAnalyst), 404, 40401);
  assertError(await summary('/provinces/abc/', nationalAnalyst), 404, 40401);
  assertError(await api('GET', '/generation-summary?limit=5', { token: nationalAnalyst }), 400, 40002);
  const res = await api('POST', '/generation-summary', { token: nationalAnalyst });
  assertError(res, 405, 40501);
  assert.equal(res.headers.get('allow'), 'GET');
});

// Kandy: no test file writes there (§12), so nothing changes between the two requests
test('If-None-Match -> 304 when nothing changed', async () => {
  const first = await summary('/districts/4/', kandyAnalyst);
  assert.equal(first.status, 200, first.text);
  const second = await summary('/districts/4/', kandyAnalyst, { 'If-None-Match': first.headers.get('etag') });
  assert.equal(second.status, 304);
  assert.equal(second.text, '');
  assert.equal(second.headers.get('etag'), first.headers.get('etag'));
});

test('posting a reading changes the ETag', async () => {
  const credential = await api('POST', `/installations/${site.installation_id}/device-credential`, { token: officer });
  assert.equal(credential.status, 200, credential.text);
  const token = await deviceToken(site.installation_id, credential.body.device_secret);

  const beforeReading = await summary('/districts/1/', colomboAnalyst);
  assert.equal(beforeReading.status, 200, beforeReading.text);
  const reading = {
    recorded_at: new Date(Math.floor(Date.now() / 60000) * 60000 - 5 * 60000).toISOString(),
    power_kw: 2.5,
    energy_kwh: 100,
    voltage: 230.5,
  };
  const posted = await api('POST', `/installations/${site.installation_id}/readings`, { token, body: reading });
  assert.equal(posted.status, 201, posted.text);

  const afterReading = await summary('/districts/1/', colomboAnalyst, {
    'If-None-Match': beforeReading.headers.get('etag'),
  });
  assert.equal(afterReading.status, 200, afterReading.text);
  assert.notEqual(afterReading.headers.get('etag'), beforeReading.headers.get('etag'));
});
