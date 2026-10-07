// §12 Smoke tests: read-only, safe against production
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { api, baseUrl, originSecret, rootUrl, userToken } from './helpers.js';

let national;
let colombo;

function assertError(res, status, code) {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.code, code);
}

async function assertOk(path, token) {
  const res = await api('GET', path, { token });
  assert.equal(res.status, 200, `${path}: ${res.text}`);
  return res;
}

before(async () => {
  national = await userToken('national.analyst');
  colombo = await userToken('colombo.analyst');
});

test('health', async () => {
  const res = await api('GET', rootUrl);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', service: 'slsea-solar-api' });
});

test('X-Content-Type-Options: nosniff present', async () => {
  const res = await api('GET', rootUrl);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('docs: /docs -> 301, /docs/ -> Swagger UI', async () => {
  const headers = originSecret ? { 'X-Origin-Secret': originSecret } : {};
  const redirect = await fetch(`${baseUrl}/docs`, { headers, redirect: 'manual' });
  assert.equal(redirect.status, 301);
  const page = await fetch(`${baseUrl}/docs/`, { headers });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /swagger-ui/i);
});

test('openapi', async () => {
  const res = await api('GET', '/openapi');
  assert.equal(res.status, 200);
  assert.equal(res.body.openapi, '3.0.3');
});

test('one GET per endpoint family', async () => {
  await assertOk('/provinces', national);
  await assertOk('/districts/1', national);
  await assertOk('/substations?district-id=1', national);
  await assertOk('/installations?limit=5', colombo);
  await assertOk('/installations/INS-000004', national);
  await assertOk('/installations/INS-000004/overview', national);
  await assertOk('/installations/INS-000004/last-known-reading', national);
  await assertOk('/installations/INS-000004/readings?limit=5', national);
  await assertOk('/districts/1/readings?limit=5', colombo);
  await assertOk('/districts/1/generation-summary', colombo);
  await assertOk('/provinces/1/generation-summary', national);
  await assertOk('/generation-summary', national);
});

test('304 round trip', async () => {
  const first = await assertOk('/provinces/1', national);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  const second = await api('GET', '/provinces/1', { token: national, headers: { 'If-None-Match': etag } });
  assert.equal(second.status, 304);
  assert.equal(second.text, '');
});

test('no token -> 401', async () => {
  assertError(await api('GET', '/provinces'), 401, 40101);
});

test('analyst on /users -> 403 40301', async () => {
  assertError(await api('GET', '/users', { token: national }), 403, 40301);
});

test('INS-000064 as colombo.analyst -> 404', async () => {
  assertError(await api('GET', '/installations/INS-000064', { token: colombo }), 404, 40401);
});

test("colombo.analyst on Kandy's summary -> 403 40302", async () => {
  assertError(await api('GET', '/districts/4/generation-summary', { token: colombo }), 403, 40302);
});
