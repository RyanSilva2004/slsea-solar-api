// §13 L4: EP2 provinces, EP3 districts, EP4 substations
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { api, baseUrl, deviceToken, userToken } from './helpers.js';

const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'hq.admin';
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const testDeviceFile = 'seed/seed-output/test-device.json';

let token;

function assertError(res, status, code) {
  assert.equal(res.status, status);
  assert.equal(res.body.code, code);
}

before(async () => {
  token = await userToken(adminUsername, adminPassword);
});

test('list counts 9 / 25 / 42', async () => {
  for (const [path, count] of [['/provinces', 9], ['/districts', 25], ['/substations', 42]]) {
    const res = await api('GET', path, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, count);
    assert.ok(res.headers.get('etag'));
    assert.ok(res.headers.get('last-modified'));
  }
});

test('lists are sorted by id ascending with the §6.3 shapes', async () => {
  const res = await api('GET', '/provinces?limit=100', { token });
  assert.deepEqual(res.body.items.map((p) => p.province_id), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(Object.keys(res.body.items[0]).sort(), ['name', 'province_id']);

  const districts = await api('GET', '/districts?limit=1', { token });
  assert.deepEqual(Object.keys(districts.body.items[0]).sort(), ['district_id', 'name', 'province_id']);
});

test('/districts?province-id=1 -> count 3', async () => {
  const res = await api('GET', '/districts?province-id=1', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 3);
  assert.ok(res.body.items.every((d) => d.province_id === 1));
});

test('/substations?district-id=1 -> count 3 (Kolonnawa, Pannipitiya, Dehiwala)', async () => {
  const res = await api('GET', '/substations?district-id=1', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 3);
  assert.deepEqual(
    res.body.items.map((s) => [s.substation_id, s.name, s.district_id]),
    [[1, 'Kolonnawa', 1], [2, 'Pannipitiya', 1], [3, 'Dehiwala', 1]],
  );
});

test('/substations?province-id=1 keeps only Western substations', async () => {
  const res = await api('GET', '/substations?province-id=1&limit=100', { token });
  assert.equal(res.status, 200);
  assert.ok(res.body.count >= 3);
  const districtIds = (await api('GET', '/districts?province-id=1', { token })).body.items.map((d) => d.district_id);
  assert.ok(res.body.items.every((s) => districtIds.includes(s.district_id)));
});

test('members return the representation', async () => {
  const res = await api('GET', '/substations/8', { token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { substation_id: 8, name: 'Kiribathkumbura', district_id: 4 });
  assert.equal((await api('GET', '/provinces/1', { token })).body.province_id, 1);
  assert.equal((await api('GET', '/districts/4', { token })).body.district_id, 4);
});

test('unknown id -> 404 40401', async () => {
  for (const path of ['/provinces/10', '/districts/26', '/substations/43']) {
    assertError(await api('GET', path, { token }), 404, 40401);
  }
});

test('/districts/abc and /districts/0 -> 404 40401', async () => {
  assertError(await api('GET', '/districts/abc', { token }), 404, 40401);
  assertError(await api('GET', '/districts/0', { token }), 404, 40401);
});

test('?limit=101 -> 400 40002', async () => {
  assertError(await api('GET', '/provinces?limit=101', { token }), 400, 40002);
});

test('unknown or repeated query parameter -> 400 40002', async () => {
  assertError(await api('GET', '/provinces?colour=green', { token }), 400, 40002);
  assertError(await api('GET', '/provinces?district-id=1', { token }), 400, 40002);
  assertError(await api('GET', '/provinces/1?limit=5', { token }), 400, 40002);
  assertError(await api('GET', '/districts?province-id=1&province-id=2', { token }), 400, 40002);
  assertError(await api('GET', '/districts?province-id=99', { token }), 400, 40002);
});

test('next / previous links', async () => {
  const first = await api('GET', '/substations?limit=10', { token });
  assert.equal(first.body.items.length, 10);
  assert.equal(first.body.previous, null);
  assert.equal(first.body.next, `${baseUrl}/substations?limit=10&offset=10`);

  const middle = await api('GET', '/substations?offset=10&limit=10', { token });
  assert.equal(middle.body.items[0].substation_id, 11);
  assert.equal(middle.body.previous, `${baseUrl}/substations?offset=0&limit=10`);
  assert.equal(middle.body.next, `${baseUrl}/substations?offset=20&limit=10`);

  const last = await api('GET', '/substations?offset=40&limit=10', { token });
  assert.equal(last.body.items.length, 2);
  assert.equal(last.body.next, null);

  const beyond = await api('GET', '/substations?offset=100', { token });
  assert.equal(beyond.status, 200);
  assert.equal(beyond.body.count, 42);
  assert.deepEqual(beyond.body.items, []);
});

test('If-None-Match -> 304 with empty body', async () => {
  for (const path of ['/districts', '/districts/1']) {
    const first = await api('GET', path, { token });
    const res = await api('GET', path, { token, headers: { 'If-None-Match': first.headers.get('etag') } });
    assert.equal(res.status, 304);
    assert.equal(res.text, '');
    assert.equal(res.headers.get('etag'), first.headers.get('etag'));
    assert.equal(res.headers.get('content-type'), null);
  }
});

test('If-None-Match with another ETag -> 200', async () => {
  const res = await api('GET', '/districts', { token, headers: { 'If-None-Match': '"something-else"' } });
  assert.equal(res.status, 200);
});

test('If-Modified-Since -> 304', async () => {
  const first = await api('GET', '/provinces/1', { token });
  const res = await api('GET', '/provinces/1', {
    token,
    headers: { 'If-Modified-Since': first.headers.get('last-modified') },
  });
  assert.equal(res.status, 304);
  assert.equal(res.text, '');
});

test('POST -> 405 40501 with Allow: GET', async () => {
  for (const path of ['/provinces', '/districts/1', '/substations']) {
    const res = await api('POST', path, { token });
    assertError(res, 405, 40501);
    assert.equal(res.headers.get('allow'), 'GET');
  }
});

test('no token -> 401 40101 with WWW-Authenticate: Bearer realm="solar"', async () => {
  const res = await api('GET', '/provinces');
  assertError(res, 401, 40101);
  assert.equal(res.headers.get('www-authenticate'), 'Bearer realm="solar"');
});

test('device token -> 403 40301', { skip: !existsSync(testDeviceFile) && `${testDeviceFile} not found` }, async () => {
  const device = JSON.parse(readFileSync(testDeviceFile, 'utf8'));
  const deviceBearer = await deviceToken(device.installation_id, device.device_secret);
  assertError(await api('GET', '/provinces', { token: deviceBearer }), 403, 40301);
});
