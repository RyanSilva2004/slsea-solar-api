// §13 L6: EP6 installations, EP7 installation member, EP12 device credential
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { api, baseUrl, userToken } from './helpers.js';

let colomboAnalyst;
let nationalAnalyst;
let officer;
const createdIds = [];

function assertError(res, status, code) {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.code, code);
}

// §12: test installations use meter ids starting with TEST-
function testMeter() {
  return `TEST-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

function isSeeded(installationId) {
  return Number(installationId.slice('INS-'.length)) <= 240;
}

// Creates a Colombo installation as colombo.officer; deleted again in after()
async function createInstallation(overrides = {}) {
  const body = { meter_id: testMeter(), capacity_kw: 5, substation_id: 1, ...overrides };
  const res = await api('POST', '/installations', { token: officer, body });
  assert.equal(res.status, 201, res.text);
  createdIds.push(res.body.installation_id);
  return { installation: res.body, etag: res.headers.get('etag') };
}

function issueCredential(installationId) {
  return api('POST', `/installations/${installationId}/device-credential`, { token: officer });
}

function deviceTokenRequest(installationId, secret) {
  const basic = Buffer.from(`${installationId}:${secret}`).toString('base64');
  return api('POST', '/token', {
    form: { grant_type: 'client_credentials' },
    headers: { Authorization: `Basic ${basic}` },
  });
}

async function newDeviceToken(installationId, secret) {
  const res = await deviceTokenRequest(installationId, secret);
  assert.equal(res.status, 200, res.text);
  return res.body.access_token;
}

// A valid device token passes authentication and fails only the scope check
function probeDeviceToken(token) {
  return api('GET', '/provinces', { token });
}

function editable(installation) {
  const { installation_id: _id, ...fields } = installation;
  return fields;
}

before(async () => {
  colomboAnalyst = await userToken('colombo.analyst');
  nationalAnalyst = await userToken('national.analyst');
  officer = await userToken('colombo.officer');
});

after(async () => {
  for (const id of createdIds) {
    await api('DELETE', `/installations/${id}`, { token: officer, headers: { 'If-Match': '*' } });
  }
});

test('list counts: colombo.analyst >= 27, national.analyst >= 240', async () => {
  const colombo = await api('GET', '/installations', { token: colomboAnalyst });
  assert.equal(colombo.status, 200, colombo.text);
  assert.ok(colombo.body.count >= 27, `count ${colombo.body.count}`);
  assert.ok(colombo.headers.get('etag'));
  assert.ok(colombo.headers.get('last-modified'));
  assert.deepEqual(Object.keys(colombo.body.items[0]).sort(), [
    'capacity_kw',
    'installation_id',
    'meter_id',
    'status',
    'substation_id',
  ]);

  const national = await api('GET', '/installations', { token: nationalAnalyst });
  assert.equal(national.status, 200);
  assert.ok(national.body.count >= 240, `count ${national.body.count}`);
});

test('list is sorted by installation_id and holds only the caller area', async () => {
  const res = await api('GET', '/installations?limit=100', { token: colomboAnalyst });
  const ids = res.body.items.map((item) => item.installation_id);
  assert.deepEqual(ids, [...ids].sort());
  assert.ok(res.body.items.every((item) => [1, 2, 3].includes(item.substation_id)));
});

test('?district-id=4 as colombo.analyst -> 403 40302', async () => {
  assertError(await api('GET', '/installations?district-id=4', { token: colomboAnalyst }), 403, 40302);
  assertError(await api('GET', '/installations?province-id=1', { token: colomboAnalyst }), 403, 40302);
  assertError(await api('GET', '/installations?substation-id=8', { token: colomboAnalyst }), 403, 40302);
});

test('filters: substation-id and status', async () => {
  const res = await api('GET', '/installations?substation-id=3&status=DECOMMISSIONED&limit=100', {
    token: colomboAnalyst,
  });
  assert.equal(res.status, 200);
  const seeded = res.body.items.filter((item) => isSeeded(item.installation_id));
  assert.deepEqual(seeded.map((item) => item.installation_id), ['INS-000003']);
  assert.ok(res.body.items.every((item) => item.status === 'DECOMMISSIONED' && item.substation_id === 3));
});

test('?reporting-status=NEVER_REPORTED as colombo.analyst -> only INS-000001 of the seeded sites', async () => {
  const res = await api('GET', '/installations?reporting-status=NEVER_REPORTED&limit=100', {
    token: colomboAnalyst,
  });
  assert.equal(res.status, 200, res.text);
  const seeded = res.body.items.filter((item) => isSeeded(item.installation_id));
  assert.deepEqual(seeded.map((item) => item.installation_id), ['INS-000001']);
  // any other item is a test installation without readings
  assert.ok(res.body.items.every((item) => isSeeded(item.installation_id) || item.meter_id.startsWith('TEST-')));
  assert.ok(res.body.items.every((item) => item.status === 'ACTIVE'));
});

test('unknown query parameter -> 400 40002', async () => {
  assertError(await api('GET', '/installations?colour=red', { token: colomboAnalyst }), 400, 40002);
  assertError(await api('GET', '/installations?status=active', { token: colomboAnalyst }), 400, 40002);
});

test('INS-000064 as colombo.analyst -> 404; bad path id -> 404', async () => {
  assertError(await api('GET', '/installations/INS-000064', { token: colomboAnalyst }), 404, 40401);
  assertError(await api('GET', '/installations/INS-64', { token: colomboAnalyst }), 404, 40401);
  assertError(await api('GET', '/installations/INS-999999', { token: colomboAnalyst }), 404, 40401);

  const own = await api('GET', '/installations/INS-000004', { token: colomboAnalyst });
  assert.equal(own.status, 200);
  assert.equal(own.body.installation_id, 'INS-000004');
});

test('member GET -> 304 with If-None-Match', async () => {
  const first = await api('GET', '/installations/INS-000004', { token: colomboAnalyst });
  const second = await api('GET', '/installations/INS-000004', {
    token: colomboAnalyst,
    headers: { 'If-None-Match': first.headers.get('etag') },
  });
  assert.equal(second.status, 304);
  assert.equal(second.text, '');
});

test('officer POST -> 201 + Location that resolves, status ACTIVE', async () => {
  const body = { meter_id: testMeter(), capacity_kw: 7.5, substation_id: 2 };
  const res = await api('POST', '/installations', { token: officer, body });
  assert.equal(res.status, 201, res.text);
  createdIds.push(res.body.installation_id);

  assert.match(res.body.installation_id, /^INS-[0-9]{6}$/);
  assert.deepEqual(editable(res.body), { ...body, status: 'ACTIVE' });
  const location = res.headers.get('location');
  assert.equal(location, `${baseUrl}/installations/${res.body.installation_id}`);
  assert.equal(res.headers.get('content-location'), location);
  assert.ok(res.headers.get('etag'));
  assert.ok(res.headers.get('last-modified'));

  const fetched = await api('GET', location, { token: colomboAnalyst });
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.body, res.body);
  assert.equal(fetched.headers.get('etag'), res.headers.get('etag'));
});

test('POST body rules -> 400 40001', async () => {
  const valid = { meter_id: testMeter(), capacity_kw: 5, substation_id: 1 };
  const cases = [
    { ...valid, status: 'ACTIVE' },
    { ...valid, meter_id: { $gt: '' } },
    { ...valid, meter_id: 'lower-case' },
    { ...valid, capacity_kw: 0 },
    { ...valid, capacity_kw: 1000.5 },
    { ...valid, capacity_kw: '5' },
    { ...valid, substation_id: 99 },
    { ...valid, colour: 'red' },
    { capacity_kw: 5, substation_id: 1 },
  ];
  for (const body of cases) {
    assertError(await api('POST', '/installations', { token: officer, body }), 400, 40001);
  }
});

test('status in POST body -> 400 with its own message', async () => {
  const body = { meter_id: testMeter(), capacity_kw: 5, substation_id: 1, status: 'ACTIVE' };
  const res = await api('POST', '/installations', { token: officer, body });
  assertError(res, 400, 40001);
  assert.equal(res.body.error[0].message, 'status cannot be set on create.');
});

test('POST to substation 8 as colombo.officer -> 403 40302', async () => {
  const body = { meter_id: testMeter(), capacity_kw: 5, substation_id: 8 };
  assertError(await api('POST', '/installations', { token: officer, body }), 403, 40302);
});

test('duplicate meter -> 409 40902 (new and seeded meters)', async () => {
  const { installation } = await createInstallation();
  const again = { meter_id: installation.meter_id, capacity_kw: 3, substation_id: 1 };
  assertError(await api('POST', '/installations', { token: officer, body: again }), 409, 40902);
  const seeded = { meter_id: 'SLM-10000004', capacity_kw: 3, substation_id: 1 };
  assertError(await api('POST', '/installations', { token: officer, body: seeded }), 409, 40902);
});

test('analyst POST -> 403 40301', async () => {
  const body = { meter_id: testMeter(), capacity_kw: 5, substation_id: 1 };
  assertError(await api('POST', '/installations', { token: colomboAnalyst, body }), 403, 40301);
});

test('PUT full replace with If-Match; missing If-Match 403; stale 412', async () => {
  const { installation, etag } = await createInstallation();
  const path = `/installations/${installation.installation_id}`;
  const body = { meter_id: testMeter(), capacity_kw: 9.25, status: 'ACTIVE', substation_id: 3 };

  assertError(await api('PUT', path, { token: officer, body }), 403, 40303);

  const res = await api('PUT', path, { token: officer, body, headers: { 'If-Match': etag } });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body, { installation_id: installation.installation_id, ...body });
  const newEtag = res.headers.get('etag');
  assert.ok(newEtag);
  assert.notEqual(newEtag, etag);
  assert.ok(res.headers.get('last-modified'));

  const fetched = await api('GET', path, { token: officer });
  assert.deepEqual(fetched.body, res.body);
  assert.equal(fetched.headers.get('etag'), newEtag);

  assertError(await api('PUT', path, { token: officer, body, headers: { 'If-Match': etag } }), 412, 41201);
});

test('PUT missing field -> 400; PUT to substation 8 -> 403; meter of another -> 409', async () => {
  const { installation, etag } = await createInstallation();
  const path = `/installations/${installation.installation_id}`;
  const headers = { 'If-Match': etag };
  const full = editable(installation);

  const { status: _status, ...missing } = full;
  assertError(await api('PUT', path, { token: officer, body: missing, headers }), 400, 40001);
  const bad = { ...full, status: 'RETIRED' };
  assertError(await api('PUT', path, { token: officer, body: bad, headers }), 400, 40001);

  const moved = { ...full, substation_id: 8 };
  assertError(await api('PUT', path, { token: officer, body: moved, headers }), 403, 40302);

  const taken = { ...full, meter_id: 'SLM-10000004' };
  assertError(await api('PUT', path, { token: officer, body: taken, headers }), 409, 40902);

  // its own meter is not a conflict
  const same = await api('PUT', path, { token: officer, body: full, headers });
  assert.equal(same.status, 200, same.text);
});

test('PUT / DELETE outside the area -> 404 40401', async () => {
  const body = { meter_id: testMeter(), capacity_kw: 5, status: 'ACTIVE', substation_id: 8 };
  const headers = { 'If-Match': '*' };
  assertError(await api('PUT', '/installations/INS-000064', { token: officer, body, headers }), 404, 40401);
  assertError(await api('DELETE', '/installations/INS-000064', { token: officer, headers }), 404, 40401);
});

test('DELETE INS-000003 -> 409 40903; without If-Match -> 403 40303', async () => {
  const current = await api('GET', '/installations/INS-000003', { token: officer });
  const headers = { 'If-Match': current.headers.get('etag') };
  assertError(await api('DELETE', '/installations/INS-000003', { token: officer }), 403, 40303);
  assertError(await api('DELETE', '/installations/INS-000003', { token: officer, headers }), 409, 40903);
});

test('credential -> 200 + secret + no-store; device token works; re-issue revokes the old token', async () => {
  const { installation } = await createInstallation();
  const id = installation.installation_id;

  const first = await issueCredential(id);
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(Object.keys(first.body).sort(), ['device_secret', 'installation_id', 'issued_at']);
  assert.equal(first.body.installation_id, id);
  assert.match(first.body.device_secret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal(first.headers.get('pragma'), 'no-cache');
  assert.equal(first.headers.get('etag'), null);

  const oldToken = await newDeviceToken(id, first.body.device_secret);
  assertError(await probeDeviceToken(oldToken), 403, 40301);

  const second = await issueCredential(id);
  assert.equal(second.status, 200, second.text);
  assert.notEqual(second.body.device_secret, first.body.device_secret);

  assertError(await probeDeviceToken(oldToken), 401, 40102);
  assertError(await deviceTokenRequest(id, first.body.device_secret), 401, 40103);
  const newToken = await newDeviceToken(id, second.body.device_secret);
  assertError(await probeDeviceToken(newToken), 403, 40301);
});

test('credential: GET -> 405; outside the area -> 404; analyst -> 403 40301', async () => {
  const res = await api('GET', '/installations/INS-000004/device-credential', { token: officer });
  assertError(res, 405, 40501);
  assert.equal(res.headers.get('allow'), 'POST');
  assertError(await issueCredential('INS-000064'), 404, 40401);
  const analyst = await api('POST', '/installations/INS-000004/device-credential', { token: colomboAnalyst });
  assertError(analyst, 403, 40301);
});

test('credential with a request body -> 400 40001 before the installation is looked up', async () => {
  const { installation } = await createInstallation();
  const path = `/installations/${installation.installation_id}/device-credential`;

  const json = await api('POST', path, { token: officer, body: {} });
  assertError(json, 400, 40001);
  assert.equal(json.headers.get('cache-control'), null);
  const text = await api('POST', path, { token: officer, body: 'x', headers: { 'Content-Type': 'text/plain' } });
  assertError(text, 400, 40001);
  const outside = '/installations/INS-000064/device-credential';
  assertError(await api('POST', outside, { token: officer, body: {} }), 400, 40001);

  // no body is accepted
  const ok = await issueCredential(installation.installation_id);
  assert.equal(ok.status, 200, ok.text);
});

test('decommission via PUT -> device token 401 40102, /token 401 40103, credential 403 40304', async () => {
  const { installation, etag } = await createInstallation();
  const id = installation.installation_id;
  const credential = await issueCredential(id);
  const token = await newDeviceToken(id, credential.body.device_secret);

  const body = { ...editable(installation), status: 'DECOMMISSIONED' };
  const res = await api('PUT', `/installations/${id}`, { token: officer, body, headers: { 'If-Match': etag } });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.status, 'DECOMMISSIONED');

  assertError(await probeDeviceToken(token), 401, 40102);
  const tokenRes = await deviceTokenRequest(id, credential.body.device_secret);
  assertError(tokenRes, 401, 40103);
  assert.equal(tokenRes.headers.get('www-authenticate'), 'Basic realm="solar"');
  assertError(await issueCredential(id), 403, 40304);

  // DECOMMISSIONED -> ACTIVE does not create a credential
  const active = { ...body, status: 'ACTIVE' };
  const reactivated = await api('PUT', `/installations/${id}`, {
    token: officer,
    body: active,
    headers: { 'If-Match': res.headers.get('etag') },
  });
  assert.equal(reactivated.status, 200, reactivated.text);
  assertError(await deviceTokenRequest(id, credential.body.device_secret), 401, 40103);
});

test('DELETE new installation without readings -> 200, then 404', async () => {
  const { installation, etag } = await createInstallation();
  const path = `/installations/${installation.installation_id}`;

  const res = await api('DELETE', path, { token: officer, headers: { 'If-Match': etag } });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body, installation);
  assert.equal(res.headers.get('etag'), null);

  assertError(await api('DELETE', path, { token: officer, headers: { 'If-Match': etag } }), 404, 40401);
  assertError(await api('GET', path, { token: officer }), 404, 40401);
});

test('PATCH /installations/{id} -> 405 with Allow', async () => {
  const res = await api('PATCH', '/installations/INS-000004', { token: officer, body: {} });
  assertError(res, 405, 40501);
  assert.equal(res.headers.get('allow'), 'GET, PUT, DELETE');
});
