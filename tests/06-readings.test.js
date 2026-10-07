// §13 L7: EP9 last-known reading, EP10 readings, EP11 reading member, readingsLimiter
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { api, userToken } from './helpers.js';

const MINUTE = 60 * 1000;
const base = Math.floor(Date.now() / MINUTE) * MINUTE;

let colomboAnalyst;
let officer;
const created = [];

// The main test installation, its device tokens and its last accepted reading
let site;
let firstToken;
let currentToken;
let firstReading;

function assertError(res, status, code) {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.code, code);
}

// recorded_at `minutes` before the start of this run
function minutesAgo(minutes) {
  return new Date(base - minutes * MINUTE).toISOString();
}

// §12: a Colombo installation with a TEST- meter; removed or decommissioned in after()
async function createInstallation() {
  const body = {
    meter_id: `TEST-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    capacity_kw: 5,
    substation_id: 1,
  };
  const res = await api('POST', '/installations', { token: officer, body });
  assert.equal(res.status, 201, res.text);
  created.push(res.body);
  return res.body;
}

async function issueSecret(installationId) {
  const res = await api('POST', `/installations/${installationId}/device-credential`, { token: officer });
  assert.equal(res.status, 200, res.text);
  return res.body.device_secret;
}

async function deviceToken(installationId, secret) {
  const basic = Buffer.from(`${installationId}:${secret}`).toString('base64');
  const res = await api('POST', '/token', {
    form: { grant_type: 'client_credentials' },
    headers: { Authorization: `Basic ${basic}` },
  });
  assert.equal(res.status, 200, res.text);
  return res.body.access_token;
}

function postReading(installationId, token, body) {
  return api('POST', `/installations/${installationId}/readings`, { token, body });
}

function reading(minutes, energyKwh, overrides = {}) {
  return { recorded_at: minutesAgo(minutes), power_kw: 2.5, energy_kwh: energyKwh, voltage: 230.5, ...overrides };
}

before(async () => {
  colomboAnalyst = await userToken('colombo.analyst');
  officer = await userToken('colombo.officer');
  site = await createInstallation();
  firstToken = await deviceToken(site.installation_id, await issueSecret(site.installation_id));
  currentToken = firstToken;
});

// An installation with readings cannot be deleted (§9 EP7): it is decommissioned instead
after(async () => {
  for (const installation of created) {
    const id = installation.installation_id;
    const headers = { 'If-Match': '*' };
    const res = await api('DELETE', `/installations/${id}`, { token: officer, headers });
    if (res.status === 409) {
      const { installation_id: _id, ...fields } = installation;
      const body = { ...fields, status: 'DECOMMISSIONED' };
      await api('PUT', `/installations/${id}`, { token: officer, headers, body });
    }
  }
});

test('POST -> 201 + Location that resolves', async () => {
  const res = await postReading(site.installation_id, firstToken, reading(50, 100));
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(Object.keys(res.body).sort(), [
    'energy_kwh',
    'installation_id',
    'power_kw',
    'reading_id',
    'recorded_at',
    'voltage',
  ]);
  assert.equal(res.body.installation_id, site.installation_id);
  assert.equal(res.body.recorded_at, minutesAgo(50));
  const location = res.headers.get('location');
  assert.equal(location, res.headers.get('content-location'));
  assert.ok(location.endsWith(`/installations/${site.installation_id}/readings/${res.body.reading_id}`));
  assert.ok(res.headers.get('etag'));
  assert.ok(res.headers.get('last-modified'));
  firstReading = res.body;

  const resolved = await api('GET', location, { token: colomboAnalyst });
  assert.equal(resolved.status, 200, resolved.text);
  assert.deepEqual(resolved.body, res.body);
  assert.equal(resolved.headers.get('etag'), res.headers.get('etag'));
});

test('identical resend -> 200 + Content-Location', async () => {
  const res = await postReading(site.installation_id, firstToken, reading(50, 100));
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body, firstReading);
  assert.ok(res.headers.get('content-location').endsWith(`/readings/${firstReading.reading_id}`));
  assert.equal(res.headers.get('location'), null);
  assert.ok(res.headers.get('etag'));
  assert.ok(res.headers.get('last-modified'));
});

test('changed values at the same time -> 409 40901', async () => {
  assertError(await postReading(site.installation_id, firstToken, reading(50, 100, { power_kw: 2.6 })), 409, 40901);
});

test('body problems -> 400 40001', async () => {
  const withId = { ...reading(45, 101), installation_id: site.installation_id };
  const res = await postReading(site.installation_id, firstToken, withId);
  assertError(res, 400, 40001);
  assert.match(res.body.message, /installation_id comes from the URL/);

  const several = await postReading(site.installation_id, firstToken, { recorded_at: 5, power_kw: '1' });
  assertError(several, 400, 40001);
  assert.equal(several.body.error.length, 4); // recorded_at, power_kw, energy_kwh, voltage

  const filter = await postReading(site.installation_id, firstToken, reading(45, 101, { power_kw: { $gt: 0 } }));
  assertError(filter, 400, 40001);
});

test('recorded_at without offset, 10 min ahead, 8 days old -> 400 40003', async () => {
  const noOffset = minutesAgo(45).replace('Z', '');
  assertError(await postReading(site.installation_id, firstToken, reading(45, 101, { recorded_at: noOffset })), 400, 40003);
  assertError(await postReading(site.installation_id, firstToken, reading(-10, 101)), 400, 40003);
  assertError(await postReading(site.installation_id, firstToken, reading(8 * 24 * 60, 101)), 400, 40003);
});

test('power > capacity x 1.05 and voltage 300 -> 400 40004', async () => {
  assertError(await postReading(site.installation_id, firstToken, reading(45, 101, { power_kw: 5.3 })), 400, 40004);
  assertError(await postReading(site.installation_id, firstToken, reading(45, 101, { voltage: 300 })), 400, 40004);

  const both = await postReading(site.installation_id, firstToken, reading(45, 101, { power_kw: -1, voltage: 300 }));
  assertError(both, 400, 40004);
  assert.equal(both.body.error.length, 2);
});

test('energy below the previous reading -> 400 40005', async () => {
  const later = await postReading(site.installation_id, firstToken, reading(20, 120));
  assert.equal(later.status, 201, later.text);
  assertError(await postReading(site.installation_id, firstToken, reading(10, 110)), 400, 40005);
  // above the next reading in time
  assertError(await postReading(site.installation_id, firstToken, reading(35, 130)), 400, 40005);
});

test('late reading between two others with a consistent counter -> 201', async () => {
  const res = await postReading(site.installation_id, firstToken, reading(35, 110));
  assert.equal(res.status, 201, res.text);

  const history = await api('GET', `/installations/${site.installation_id}/readings?sort=recorded-at:asc`, {
    token: colomboAnalyst,
  });
  assert.equal(history.status, 200, history.text);
  assert.deepEqual(
    history.body.items.map((item) => item.energy_kwh),
    [100, 110, 120],
  );
});

test('device posting to another installation -> 403 40306', async () => {
  assertError(await postReading('INS-000004', firstToken, reading(45, 101)), 403, 40306);
});

test('re-issued credential: new token posts -> 201, token from before -> 401 40102', async () => {
  currentToken = await deviceToken(site.installation_id, await issueSecret(site.installation_id));
  const res = await postReading(site.installation_id, currentToken, reading(5, 125));
  assert.equal(res.status, 201, res.text);
  assertError(await postReading(site.installation_id, firstToken, reading(4, 126)), 401, 40102);
});

test('analyst POST -> 403 40301; device GET -> 403 40301', async () => {
  assertError(await postReading(site.installation_id, colomboAnalyst, reading(3, 126)), 403, 40301);
  assertError(await api('GET', `/installations/${site.installation_id}/readings`, { token: currentToken }), 403, 40301);
  assertError(await api('GET', '/installations/INS-000004/last-known-reading', { token: currentToken }), 403, 40301);
});

test('history count >= 672 for INS-000004, default order newest first', async () => {
  const res = await api('GET', '/installations/INS-000004/readings', { token: colomboAnalyst });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.body.count >= 672, `count ${res.body.count}`);
  assert.equal(res.body.items.length, 20);
  assert.equal(res.body.previous, null);
  assert.match(res.body.next, /offset=20&limit=20$/);
  const times = res.body.items.map((item) => item.recorded_at);
  assert.deepEqual(times, [...times].sort().reverse());
  assert.ok(res.headers.get('etag'));
  assert.ok(res.headers.get('last-modified'));

  const again = await api('GET', '/installations/INS-000004/readings', {
    token: colomboAnalyst,
    headers: { 'If-None-Match': res.headers.get('etag') },
  });
  assert.equal(again.status, 304);
  assert.equal(again.text, '');
});

test('sort=recorded-at:asc order', async () => {
  const res = await api('GET', '/installations/INS-000004/readings?sort=recorded-at:asc&limit=50', {
    token: colomboAnalyst,
  });
  assert.equal(res.status, 200, res.text);
  const times = res.body.items.map((item) => item.recorded_at);
  assert.equal(times.length, 50);
  assert.deepEqual(times, [...times].sort());
  assertError(await api('GET', '/installations/INS-000004/readings?sort=power', { token: colomboAnalyst }), 400, 40002);
});

test('from (inclusive) / to (exclusive) window', async () => {
  const first = await api('GET', '/installations/INS-000004/readings?sort=recorded-at:asc&limit=5', {
    token: colomboAnalyst,
  });
  const items = first.body.items;
  const from = encodeURIComponent(items[1].recorded_at);
  const to = encodeURIComponent(items[4].recorded_at);
  const res = await api('GET', `/installations/INS-000004/readings?sort=recorded-at:asc&from=${from}&to=${to}`, {
    token: colomboAnalyst,
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.count, 3);
  assert.deepEqual(res.body.items, items.slice(1, 4));
});

test('from >= to -> 400 40003; bad timestamp -> 400 40003', async () => {
  const time = encodeURIComponent(minutesAgo(60));
  const same = await api('GET', `/installations/INS-000004/readings?from=${time}&to=${time}`, { token: colomboAnalyst });
  assertError(same, 400, 40003);
  assertError(await api('GET', '/installations/INS-000004/readings?from=yesterday', { token: colomboAnalyst }), 400, 40003);
});

test('readings of an installation outside the area -> 404 40401', async () => {
  assertError(await api('GET', '/installations/INS-000064/readings', { token: colomboAnalyst }), 404, 40401);
  assertError(await api('GET', '/installations/INS-000064/last-known-reading', { token: colomboAnalyst }), 404, 40401);
});

test('last-known of INS-000001 -> 404 40402', async () => {
  assertError(await api('GET', '/installations/INS-000001/last-known-reading', { token: colomboAnalyst }), 404, 40402);
});

test('last-known Content-Location resolves to the newest reading', async () => {
  const res = await api('GET', '/installations/INS-000004/last-known-reading', { token: colomboAnalyst });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.headers.get('etag'));
  assert.ok(res.headers.get('last-modified'));
  const location = res.headers.get('content-location');
  assert.ok(location.endsWith(`/installations/INS-000004/readings/${res.body.reading_id}`));

  const resolved = await api('GET', location, { token: colomboAnalyst });
  assert.equal(resolved.status, 200, resolved.text);
  assert.deepEqual(resolved.body, res.body);

  const newest = await api('GET', '/installations/INS-000004/readings?limit=1', { token: colomboAnalyst });
  assert.deepEqual(newest.body.items[0], res.body);

  const own = await api('GET', `/installations/${site.installation_id}/last-known-reading`, { token: colomboAnalyst });
  assert.equal(own.status, 200, own.text);
  assert.equal(own.body.energy_kwh, 125);
});

test('reading of another installation -> 404 40401', async () => {
  const other = await api('GET', '/installations/INS-000005/last-known-reading', { token: colomboAnalyst });
  assert.equal(other.status, 200, other.text);
  const res = await api('GET', `/installations/INS-000004/readings/${other.body.reading_id}`, { token: colomboAnalyst });
  assertError(res, 404, 40401);
  assertError(await api('GET', '/installations/INS-000004/readings/abc', { token: colomboAnalyst }), 404, 40401);
});

test('PUT on a reading -> 405 with Allow: GET', async () => {
  const res = await api('PUT', `/installations/${site.installation_id}/readings/${firstReading.reading_id}`, {
    token: colomboAnalyst,
    body: {},
  });
  assertError(res, 405, 40501);
  assert.equal(res.headers.get('allow'), 'GET');
  const del = await api('DELETE', '/installations/INS-000004/last-known-reading', { token: colomboAnalyst });
  assertError(del, 405, 40501);
});

test('readingsLimiter: 120 x 400 40001, the 121st -> 429 42901; another installation is not limited', async () => {
  const limited = await createInstallation();
  const token = await deviceToken(limited.installation_id, await issueSecret(limited.installation_id));
  for (let i = 1; i <= 120; i += 1) {
    const res = await postReading(limited.installation_id, token, {});
    assert.equal(res.status, 400, `request ${i}: ${res.text}`);
    assert.equal(res.body.code, 40001);
  }
  const blocked = await postReading(limited.installation_id, token, {});
  assertError(blocked, 429, 42901);
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  assert.deepEqual(Object.keys(blocked.body).sort(), ['code', 'description', 'error', 'message', 'more_info']);

  const other = await postReading(site.installation_id, currentToken, reading(2, 126));
  assert.equal(other.status, 201, other.text);
});
