// §13 L2: request pipeline (§6.2) and error body (§6.10)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, baseUrl, originSecret, rootUrl } from './helpers.js';

function assertError(res, status, code) {
  assert.equal(res.status, status);
  assert.match(res.headers.get('content-type'), /^application\/json; charset=utf-8$/);
  assert.equal(res.body.code, code);
}

test('health is OK with Accept: text/html (tooling skips negotiation)', async () => {
  const res = await api('GET', rootUrl, { headers: { Accept: 'text/html' } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', service: 'slsea-solar-api' });
});

test('Accept: text/html on an API path -> 406 40601', async () => {
  const res = await api('GET', '/provinces', { headers: { Accept: 'text/html' } });
  assertError(res, 406, 40601);
});

test('Accept allowing JSON passes negotiation', async () => {
  const res = await api('GET', '/no-such-path', { headers: { Accept: 'text/html, */*;q=0.1' } });
  assertError(res, 404, 40403);
});

test('unknown path -> 404 40403', async () => {
  assertError(await api('GET', '/no-such-path'), 404, 40403);
});

test('other API version -> 404 40403', async () => {
  assertError(await api('GET', new URL('/solar/v2.0/provinces', rootUrl).href), 404, 40403);
});

test('trailing slash -> 404 40403', async () => {
  assertError(await api('GET', '/provinces/'), 404, 40403);
});

test('upper-case path -> 404 40403', async () => {
  assertError(await api('GET', '/Provinces'), 404, 40403);
});

test('method not listed -> 405 40501 with Allow', async () => {
  const res = await api('POST', rootUrl);
  assertError(res, 405, 40501);
  assert.equal(res.headers.get('allow'), 'GET');
});

test('error body has all five fields', async () => {
  for (const res of [
    await api('GET', '/no-such-path'),
    await api('GET', '/provinces', { headers: { Accept: 'text/html' } }),
  ]) {
    assert.deepEqual(Object.keys(res.body).sort(), ['code', 'description', 'error', 'message', 'more_info']);
    assert.equal(typeof res.body.code, 'number');
    assert.equal(typeof res.body.message, 'string');
    assert.ok(res.body.message.length > 0);
    assert.equal(typeof res.body.description, 'string');
    assert.equal(res.body.more_info, `${baseUrl}/docs`);
    assert.ok(Array.isArray(res.body.error));
  }
});

test('origin guard: missing or wrong X-Origin-Secret -> 403 40309', { skip: !originSecret && 'ORIGIN_SECRET not set' }, async () => {
  const missing = await fetch(rootUrl);
  assert.equal(missing.status, 403);
  assert.equal((await missing.json()).code, 40309);

  const wrong = await fetch(`${baseUrl}/provinces`, { headers: { 'X-Origin-Secret': `${originSecret}x` } });
  assert.equal(wrong.status, 403);
  assert.equal((await wrong.json()).code, 40309);

  const right = await api('GET', rootUrl);
  assert.equal(right.status, 200);
});
