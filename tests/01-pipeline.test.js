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

test('invalid percent-encoding in a path id -> 404 40401 (no token needed)', async () => {
  assertError(await api('GET', '/installations/%E0'), 404, 40401);
});

test('method not listed -> 405 40501 with Allow', async () => {
  const res = await api('POST', rootUrl);
  assertError(res, 405, 40501);
  assert.equal(res.headers.get('allow'), 'GET');
});

test('error body has exactly the four fields', async () => {
  for (const res of [
    await api('GET', '/no-such-path'),
    await api('GET', '/provinces', { headers: { Accept: 'text/html' } }),
  ]) {
    assert.deepEqual(Object.keys(res.body).sort(), ['code', 'description', 'error', 'message']);
    assert.equal(typeof res.body.code, 'number');
    assert.equal(typeof res.body.message, 'string');
    assert.ok(res.body.message.length > 0);
    assert.equal(typeof res.body.description, 'string');
    assert.deepEqual(res.body.error, []); // no field problems
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

// §10 tooling: OpenAPI document and Swagger UI
test('GET /openapi -> 200 OpenAPI 3.0.3 document (no Accept check)', async () => {
  const res = await api('GET', '/openapi', { headers: { Accept: 'text/html' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.openapi, '3.0.3');
  assert.equal(res.body.servers[0].url, process.env.PUBLIC_BASE_URL);
  const flows = res.body.components.securitySchemes.oauth2.flows;
  assert.equal(flows.password.tokenUrl, `${process.env.PUBLIC_BASE_URL}/token`);
  assert.equal(flows.clientCredentials.tokenUrl, `${process.env.PUBLIC_BASE_URL}/token`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('OpenAPI: 429 with Retry-After on /token and readings POST; If-Match required on PUT/DELETE', async () => {
  const { paths } = (await api('GET', '/openapi')).body;
  for (const op of [paths['/token'].post, paths['/installations/{installation-id}/readings'].post]) {
    assert.ok(op.responses[429].headers['Retry-After']);
  }
  for (const op of [
    paths['/installations/{installation-id}'].put,
    paths['/installations/{installation-id}'].delete,
    paths['/users/{user-id}'].put,
    paths['/users/{user-id}'].delete,
  ]) {
    assert.ok(op.parameters.some((p) => p.$ref === '#/components/parameters/IfMatch'));
  }
});

test('/docs -> 301 docs/, /docs/ -> Swagger UI page', async () => {
  const headers = originSecret ? { 'X-Origin-Secret': originSecret } : {};
  const redirect = await fetch(`${baseUrl}/docs`, { headers: { ...headers, Accept: 'text/html' }, redirect: 'manual' });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), 'docs/');

  const page = await fetch(`${baseUrl}/docs/`, { headers: { ...headers, Accept: 'text/html' } });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await page.text(), /swagger-ui-bundle\.js/);

  const init = await fetch(`${baseUrl}/docs/swagger-ui-init.js`, { headers });
  assert.match(await init.text(), /"url": "\/solar\/v1\.0\/openapi"/);
});
