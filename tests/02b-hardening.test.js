// §13 L3a: equal-time login (§7.2), rate limit (§7.11), security headers (§6.11), input hardening (§6.2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { api, baseUrl, rootUrl } from './helpers.js';

const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'hq.admin';
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

function assertError(res, status, code) {
  assert.equal(res.status, status);
  assert.equal(res.body.code, code);
}

// §12: usernames no other test uses
function probeUsername() {
  return `probe-${crypto.randomBytes(6).toString('hex')}`;
}

function login(username, password) {
  return api('POST', '/token', { form: { grant_type: 'password', username, password } });
}

async function timedLogin(username, password) {
  const start = performance.now();
  const res = await login(username, password);
  return { res, ms: performance.now() - start };
}

test('unknown username and wrong password each take at least 30 ms', async () => {
  const unknown = await timedLogin(probeUsername(), 'wrong-password');
  assertError(unknown.res, 401, 40103);
  assert.ok(unknown.ms >= 30, `unknown username took ${unknown.ms.toFixed(1)} ms`);

  const wrong = await timedLogin(adminUsername, 'wrong-password');
  assertError(wrong.res, 401, 40103);
  assert.ok(wrong.ms >= 30, `wrong password took ${wrong.ms.toFixed(1)} ms`);
});

test('11 failed logins for one username -> the 11th is 429 42901', async () => {
  const username = probeUsername();
  for (let i = 1; i <= 10; i++) {
    assertError(await login(username, 'wrong-password'), 401, 40103);
  }
  const res = await login(username, 'wrong-password');
  assertError(res, 429, 42901);
  assert.match(res.headers.get('retry-after'), /^[1-9][0-9]*$/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(res.body).sort(), ['code', 'description', 'error', 'message']);
  assert.equal(res.body.description, 'Too many requests');

  // keys are separate
  assertError(await login(probeUsername(), 'wrong-password'), 401, 40103);
});

test('15 requests with a missing grant_type -> all 400, none 429', async () => {
  for (let i = 1; i <= 15; i++) {
    const res = await api('POST', '/token', { form: { username: probeUsername(), password: 'x' } });
    assertError(res, 400, 40001);
  }
});

test('12 successful logins in a row -> all 200', async () => {
  for (let i = 1; i <= 12; i++) {
    const res = await login(adminUsername, adminPassword);
    assert.equal(res.status, 200, `login ${i} returned ${res.status}`);
  }
});

test('form username[$ne]=x -> 400 40001', async () => {
  const res = await api('POST', '/token', {
    form: { 'username[$ne]': 'x', password: 'y', grant_type: 'password' },
  });
  assertError(res, 400, 40001);
});

test('/token body over 16kb -> 400 40001', async () => {
  const res = await api('POST', '/token', {
    form: { grant_type: 'password', username: probeUsername(), password: 'x'.repeat(17 * 1024) },
  });
  assertError(res, 400, 40001);
});

test('security headers on GET /, a 404 and the Swagger UI page; no CORS; no HSTS over http', async () => {
  const docs = await api('GET', '/docs/', { headers: { Accept: 'text/html' } });
  assert.equal(docs.status, 200);
  for (const res of [await api('GET', rootUrl), await api('GET', '/no-such-path'), docs]) {
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    if (baseUrl.startsWith('http://')) {
      assert.equal(res.headers.get('strict-transport-security'), null);
    }
  }
});
