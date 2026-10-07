// §13 L3: POST /token (§7.2), JWT (§7.3), authenticate.js (§7.4), require-scope.js (§7.5)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { api, userToken } from './helpers.js';
import authenticate from '../src/middleware/authenticate.js';
import requireScope from '../src/middleware/require-scope.js';
import { loadGeography } from '../src/lib/geography.js';

const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'hq.admin';
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const adminScope = 'geography:read users:manage account:write';
const testDeviceFile = 'seed/seed-output/test-device.json';

function assertError(res, status, code) {
  assert.equal(res.status, status);
  assert.equal(res.body.code, code);
}

function decode(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function basic(id, secret) {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

// Runs a middleware on a minimal request; resolves with the error passed on (or thrown), else null
async function run(middleware, req) {
  let passed = null;
  try {
    await middleware(req, {}, (err) => {
      passed = err ?? null;
    });
  } catch (err) {
    passed = err;
  }
  return passed;
}

function bearerRequest(authorization) {
  return { get: (name) => (name.toLowerCase() === 'authorization' ? authorization : undefined) };
}

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  await loadGeography();
});

after(async () => {
  await mongoose.disconnect();
});

test('admin password grant -> 200 token response', async () => {
  const res = await api('POST', '/token', {
    form: { grant_type: 'password', username: adminUsername, password: adminPassword },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['access_token', 'expires_in', 'scope', 'token_type']);
  assert.equal(res.body.token_type, 'Bearer');
  assert.equal(res.body.expires_in, 3600);
  assert.equal(res.body.scope, adminScope);

  const claims = decode(res.body.access_token);
  assert.equal(claims.iss, 'slsea-solar-api');
  assert.equal(claims.aud, 'slsea-solar-api');
  assert.equal(claims.typ, 'user');
  assert.equal(claims.scope, adminScope);
  assert.equal(typeof claims.ver, 'number');
  assert.equal(claims.exp - claims.iat, 3600);
});

test('token responses carry Cache-Control: no-store and Pragma: no-cache', async () => {
  for (const res of [
    await api('POST', '/token', { form: { grant_type: 'password', username: adminUsername, password: adminPassword } }),
    await api('POST', '/token', { form: { grant_type: 'password', username: adminUsername, password: 'wrong-password' } }),
    await api('GET', '/token'),
    await api('POST', '/token', { headers: { Accept: 'text/html' } }),
  ]) {
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('pragma'), 'no-cache');
  }
});

test('wrong password -> 401 40103 with WWW-Authenticate', async () => {
  const res = await api('POST', '/token', {
    form: { grant_type: 'password', username: adminUsername, password: 'wrong-password' },
  });
  assertError(res, 401, 40103);
  assert.equal(res.headers.get('www-authenticate'), 'Basic realm="solar"');
});

test('unknown username -> 401 40103', async () => {
  const res = await api('POST', '/token', {
    form: { grant_type: 'password', username: 'no.such.user', password: 'whatever-password' },
  });
  assertError(res, 401, 40103);
});

test('JSON body -> 415 41501', async () => {
  const res = await api('POST', '/token', {
    body: { grant_type: 'password', username: adminUsername, password: adminPassword },
  });
  assertError(res, 415, 41501);
});

test('missing grant_type -> 400 40001', async () => {
  const res = await api('POST', '/token', { form: { username: adminUsername, password: adminPassword } });
  assertError(res, 400, 40001);
});

test('unsupported grant_type -> 400 40001', async () => {
  assertError(await api('POST', '/token', { form: { grant_type: 'implicit' } }), 400, 40001);
});

test('password grant without password -> 400 40001', async () => {
  assertError(await api('POST', '/token', { form: { grant_type: 'password', username: adminUsername } }), 400, 40001);
});

test('unknown form field is ignored', async () => {
  const res = await api('POST', '/token', {
    form: { grant_type: 'password', username: adminUsername, password: adminPassword, colour: 'green' },
  });
  assert.equal(res.status, 200);
});

test('GET /token -> 405 40501 with Allow: POST', async () => {
  const res = await api('GET', '/token');
  assertError(res, 405, 40501);
  assert.equal(res.headers.get('allow'), 'POST');
});

test('device grant for INS-000004', { skip: !existsSync(testDeviceFile) && `${testDeviceFile} not found` }, async () => {
  const device = JSON.parse(readFileSync(testDeviceFile, 'utf8'));
  const res = await api('POST', '/token', {
    form: { grant_type: 'client_credentials' },
    headers: { Authorization: basic(device.installation_id, device.device_secret) },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.scope, 'readings:write');
  const claims = decode(res.body.access_token);
  assert.equal(claims.typ, 'device');
  assert.equal(claims.sub, 'INS-000004');

  const err = await run(authenticate, bearerRequest(`Bearer ${res.body.access_token}`));
  assert.equal(err, null);
});

test('device grant for decommissioned INS-000003 -> 401 40103', async () => {
  const res = await api('POST', '/token', {
    form: { grant_type: 'client_credentials' },
    headers: { Authorization: basic('INS-000003', 'any-secret') },
  });
  assertError(res, 401, 40103);
  assert.equal(res.headers.get('www-authenticate'), 'Basic realm="solar"');
});

test('device grant without Authorization -> 401 40103', async () => {
  assertError(await api('POST', '/token', { form: { grant_type: 'client_credentials' } }), 401, 40103);
});

test('no bearer token -> 401 40101', async () => {
  for (const header of [undefined, 'Basic abc', 'Bearer']) {
    const err = await run(authenticate, bearerRequest(header));
    assert.equal(err.code, 40101);
    assert.equal(err.status, 401);
    assert.equal(err.headers['WWW-Authenticate'], 'Bearer realm="solar"');
  }
});

test('bad bearer token -> 401 40102', async () => {
  const secret = process.env.JWT_SECRET;
  const options = { algorithm: 'HS256', issuer: 'slsea-solar-api', audience: 'slsea-solar-api', subject: 'x' };
  const claims = { typ: 'user', scope: adminScope, ver: 1 };
  const tokens = [
    'not-a-jwt',
    jwt.sign(claims, 'a-different-secret-that-is-long-enough!!', { ...options, expiresIn: 3600 }),
    jwt.sign(claims, secret, { ...options, expiresIn: -10 }),
    jwt.sign(claims, secret, { ...options, audience: 'someone-else', expiresIn: 3600 }),
    jwt.sign({ typ: 'user', scope: adminScope }, secret, { ...options, expiresIn: 3600 }),
    jwt.sign(claims, secret, { ...options, subject: '00000000-0000-0000-0000-000000000000', expiresIn: 3600 }),
  ];
  for (const token of tokens) {
    const err = await run(authenticate, bearerRequest(`Bearer ${token}`));
    assert.equal(err.code, 40102);
    assert.equal(err.headers['WWW-Authenticate'], 'Bearer realm="solar", error="invalid_token"');
  }
});

test('valid user token -> principal with role scopes and national area', async () => {
  const token = await userToken(adminUsername, adminPassword);
  const req = bearerRequest(`Bearer ${token}`);
  assert.equal(await run(authenticate, req), null);
  assert.equal(req.principal.type, 'user');
  assert.equal(req.principal.user.username, adminUsername);
  assert.deepEqual(req.principal.scopes, adminScope.split(' '));
  assert.equal(req.principal.area.size, 25);

  assert.equal(await run(requireScope('users:manage'), req), null);
  assert.equal((await run(requireScope('generation:read'), req)).code, 40301);
});
