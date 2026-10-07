// §13 L8: EP8 installation overview, EP17 region readings
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { api, baseUrl, userToken } from './helpers.js';

const SILENT_AFTER_MS = 30 * 60 * 1000;

// Region counts are compared on a window that ends before any reading other test files post (§12: last hour)
const cutoff = encodeURIComponent(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

let colomboAnalyst;
let westernAnalyst;
let admin;

function assertError(res, status, code) {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.code, code);
}

function overview(installationId, token = colomboAnalyst, headers = {}) {
  return api('GET', `/installations/${installationId}/overview`, { token, headers });
}

// §8: SILENT when the newest reading is more than 30 minutes old
function expectedStatus(lastReading, now) {
  return now - Date.parse(lastReading.recorded_at) > SILENT_AFTER_MS ? 'SILENT' : 'REPORTING';
}

// Every item of a paged collection, following next links
async function allItems(path, token) {
  const items = [];
  let url = path;
  while (url) {
    const res = await api('GET', url, { token });
    assert.equal(res.status, 200, res.text);
    items.push(...res.body.items);
    url = res.body.next;
  }
  return items;
}

function assertOrdered(items, direction) {
  for (let i = 1; i < items.length; i += 1) {
    const [a, b] = [items[i - 1], items[i]];
    const byTime = direction * (Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
    assert.ok(byTime > 0 || (byTime === 0 && a.installation_id < b.installation_id), `order at ${i}`);
  }
}

before(async () => {
  colomboAnalyst = await userToken('colombo.analyst');
  westernAnalyst = await userToken('western.analyst');
  admin = await userToken(process.env.BOOTSTRAP_ADMIN_USERNAME, process.env.BOOTSTRAP_ADMIN_PASSWORD);
});

test('overview of INS-000004 is complete', async () => {
  const before = Date.now();
  const res = await overview('INS-000004');
  assert.equal(res.status, 200, res.text);
  assert.ok(res.headers.get('etag'));
  assert.ok(res.headers.get('last-modified'));
  const body = res.body;
  assert.deepEqual(Object.keys(body), [
    'installation',
    'substation',
    'district',
    'province',
    'reporting_status',
    'last_known_reading',
  ]);

  const member = await api('GET', '/installations/INS-000004', { token: colomboAnalyst });
  assert.deepEqual(body.installation, member.body);
  assert.deepEqual(body.substation, { substation_id: 1, name: 'Kolonnawa' });
  assert.deepEqual(body.district, { district_id: 1, name: 'Colombo' });
  assert.deepEqual(body.province, { province_id: 1, name: 'Western' });

  const last = await api('GET', '/installations/INS-000004/last-known-reading', { token: colomboAnalyst });
  assert.equal(last.status, 200, last.text);
  assert.deepEqual(body.last_known_reading, last.body);
  assert.equal(body.reporting_status, expectedStatus(body.last_known_reading, before));
});

test('INS-000001 -> last_known_reading null, NEVER_REPORTED', async () => {
  const res = await overview('INS-000001');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.last_known_reading, null);
  assert.equal(res.body.reporting_status, 'NEVER_REPORTED');
});

test('INS-000003 -> reporting_status null (DECOMMISSIONED)', async () => {
  const res = await overview('INS-000003');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.installation.status, 'DECOMMISSIONED');
  assert.equal(res.body.reporting_status, null);
  assert.notEqual(res.body.last_known_reading, null);
});

test('INS-000002 -> SILENT when its newest reading is over 30 minutes old', async () => {
  const before = Date.now();
  const res = await overview('INS-000002');
  assert.equal(res.status, 200, res.text);
  assert.notEqual(res.body.last_known_reading, null);
  assert.equal(res.body.reporting_status, expectedStatus(res.body.last_known_reading, before));
});

test('overview: If-None-Match -> 304; outside the area -> 404; POST -> 405; admin -> 403 40301', async () => {
  const first = await overview('INS-000003');
  const again = await overview('INS-000003', colomboAnalyst, { 'If-None-Match': first.headers.get('etag') });
  assert.equal(again.status, 304);
  assert.equal(again.text, '');

  assertError(await overview('INS-000064'), 404, 40401);
  assertError(await overview('INS-64'), 404, 40401);
  const post = await api('POST', '/installations/INS-000004/overview', { token: colomboAnalyst });
  assertError(post, 405, 40501);
  assert.equal(post.headers.get('allow'), 'GET');
  assertError(await overview('INS-000004', admin), 403, 40301);
});

test('/districts/1/readings count = sum of the Colombo installations', async () => {
  const installations = await allItems('/installations?district-id=1&limit=100', colomboAnalyst);
  assert.ok(installations.length >= 27);
  let sum = 0;
  for (const installation of installations) {
    const path = `/installations/${installation.installation_id}/readings?to=${cutoff}&limit=1`;
    const res = await api('GET', path, { token: colomboAnalyst });
    assert.equal(res.status, 200, res.text);
    sum += res.body.count;
  }
  const region = await api('GET', `/districts/1/readings?to=${cutoff}&limit=1`, { token: colomboAnalyst });
  assert.equal(region.status, 200, region.text);
  assert.ok(sum > 0);
  assert.equal(region.body.count, sum);
});

test('region readings: newest first, ties by installation_id; sort=recorded-at:asc', async () => {
  const desc = await api('GET', '/districts/1/readings?limit=100', { token: colomboAnalyst });
  assert.equal(desc.status, 200, desc.text);
  assert.equal(desc.body.items.length, 100);
  assertOrdered(desc.body.items, -1);
  assert.ok(desc.headers.get('etag'));
  assert.ok(desc.headers.get('last-modified'));

  const asc = await api('GET', '/districts/1/readings?sort=recorded-at:asc&limit=100', { token: colomboAnalyst });
  assert.equal(asc.status, 200, asc.text);
  assertOrdered(asc.body.items, 1);
});

test('substation-id filter keeps only readings of that substation', async () => {
  const ids = new Set(
    (await allItems('/installations?substation-id=1&limit=100', colomboAnalyst)).map((i) => i.installation_id),
  );
  const res = await api('GET', '/districts/1/readings?substation-id=1&limit=100', { token: colomboAnalyst });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.body.items.length > 0);
  assert.ok(res.body.items.every((item) => ids.has(item.installation_id)));
});

test('?substation-id=8 on district 1 -> 400 40002; bad params -> 400; unknown district -> 404', async () => {
  assertError(await api('GET', '/districts/1/readings?substation-id=8', { token: colomboAnalyst }), 400, 40002);
  assertError(await api('GET', '/districts/1/readings?district-id=1', { token: colomboAnalyst }), 400, 40002);
  assertError(await api('GET', '/districts/1/readings?limit=101', { token: colomboAnalyst }), 400, 40002);
  assertError(await api('GET', '/districts/1/readings?from=yesterday', { token: colomboAnalyst }), 400, 40003);
  assertError(await api('GET', '/districts/99/readings', { token: colomboAnalyst }), 404, 40401);
  assertError(await api('GET', '/districts/abc/readings', { token: colomboAnalyst }), 404, 40401);
});

test('colombo.analyst on /districts/4/readings -> 403 40302; admin -> 403 40301', async () => {
  assertError(await api('GET', '/districts/4/readings', { token: colomboAnalyst }), 403, 40302);
  assertError(await api('GET', '/districts/1/readings', { token: admin }), 403, 40301);
});

test('/provinces/1/readings: colombo.analyst -> 403 40302, western.analyst -> 200', async () => {
  assertError(await api('GET', '/provinces/1/readings', { token: colomboAnalyst }), 403, 40302);
  const province = await api('GET', `/provinces/1/readings?to=${cutoff}&limit=1`, { token: westernAnalyst });
  assert.equal(province.status, 200, province.text);
  const district = await api('GET', `/districts/1/readings?to=${cutoff}&limit=1`, { token: westernAnalyst });
  assert.ok(province.body.count > district.body.count);

  const narrowed = await api('GET', `/provinces/1/readings?district-id=1&to=${cutoff}&limit=1`, {
    token: westernAnalyst,
  });
  assert.equal(narrowed.status, 200, narrowed.text);
  assert.equal(narrowed.body.count, district.body.count);
});

test('province filters outside the region or the given district -> 400 40002', async () => {
  const token = westernAnalyst;
  assertError(await api('GET', '/provinces/1/readings?district-id=4', { token }), 400, 40002);
  assertError(await api('GET', '/provinces/1/readings?substation-id=8', { token }), 400, 40002);
  const westernDistricts = await allItems('/districts?province-id=1', token);
  const otherDistrict = westernDistricts.find((district) => district.district_id !== 1);
  const otherSubstations = await allItems(`/substations?district-id=${otherDistrict.district_id}`, token);
  const path = `/provinces/1/readings?district-id=1&substation-id=${otherSubstations[0].substation_id}`;
  assertError(await api('GET', path, { token }), 400, 40002);
  assertError(await api('GET', '/provinces/10/readings', { token }), 404, 40401);
});

test('paging links keep the filters', async () => {
  const first = await api('GET', '/districts/1/readings?substation-id=1&limit=5', { token: colomboAnalyst });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.items.length, 5);
  assert.equal(first.body.previous, null);
  assert.equal(first.body.next, `${baseUrl}/districts/1/readings?substation-id=1&limit=5&offset=5`);

  const second = await api('GET', first.body.next, { token: colomboAnalyst });
  assert.equal(second.status, 200, second.text);
  assert.equal(second.body.previous, `${baseUrl}/districts/1/readings?substation-id=1&limit=5&offset=0`);
  assert.notEqual(second.body.items[0].reading_id, first.body.items[0].reading_id);

  const beyondPath = `/districts/1/readings?substation-id=1&offset=${first.body.count + 10}`;
  const beyond = await api('GET', beyondPath, { token: colomboAnalyst });
  assert.equal(beyond.status, 200, beyond.text);
  assert.deepEqual(beyond.body.items, []);
  assert.equal(beyond.body.next, null);
});
