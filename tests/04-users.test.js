// §13 L5: EP13 users, EP14 user member, EP15 passwords
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { api, baseUrl, userToken } from './helpers.js';

const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'hq.admin';
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

let admin;
let analyst;
const createdIds = [];

function assertError(res, status, code) {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.code, code);
}

function suffix() {
  return crypto.randomBytes(6).toString('hex');
}

function newUserBody(overrides = {}) {
  return {
    name: 'Test User',
    username: `test.${suffix()}`,
    password: `pw-${suffix()}`,
    role: 'ANALYST',
    jurisdiction_level: 'DISTRICT',
    district_id: 1,
    ...overrides,
  };
}

// Creates a user as hq.admin; deleted again in after()
async function createUser(overrides = {}) {
  const body = newUserBody(overrides);
  const res = await api('POST', '/users', { token: admin, body });
  assert.equal(res.status, 201, res.text);
  createdIds.push(res.body.user_id);
  return { user: res.body, password: body.password, etag: res.headers.get('etag') };
}

function login(username, password) {
  return api('POST', '/token', { form: { grant_type: 'password', username, password } });
}

async function loginToken(username, password) {
  const res = await login(username, password);
  assert.equal(res.status, 200, res.text);
  return res.body.access_token;
}

function changePassword(token, userId, body) {
  return api('POST', `/users/${userId}/password`, { token, body });
}

function editable(user) {
  const { user_id: _id, ...fields } = user;
  return fields;
}

before(async () => {
  admin = await userToken(adminUsername, adminPassword);
  analyst = await userToken('colombo.analyst');
});

after(async () => {
  for (const id of createdIds) {
    await api('DELETE', `/users/${id}`, { token: admin, headers: { 'If-Match': '*' } });
  }
});

test('create -> 201 + Location that resolves to the same user', async () => {
  const body = newUserBody({ name: '  Spaced Name  ' });
  const res = await api('POST', '/users', { token: admin, body });
  assert.equal(res.status, 201, res.text);
  createdIds.push(res.body.user_id);

  assert.deepEqual(Object.keys(res.body).sort(), [
    'district_id', 'jurisdiction_level', 'name', 'role', 'user_id', 'username',
  ]);
  assert.match(res.body.user_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(res.body.name, 'Spaced Name');
  assert.equal(res.body.username, body.username);

  const location = res.headers.get('location');
  assert.equal(location, `${baseUrl}/users/${res.body.user_id}`);
  assert.equal(res.headers.get('content-location'), location);
  assert.ok(res.headers.get('etag'));
  assert.ok(res.headers.get('last-modified'));

  const get = await api('GET', location, { token: admin });
  assert.equal(get.status, 200);
  assert.deepEqual(get.body, res.body);
  assert.equal(get.headers.get('etag'), res.headers.get('etag'));
});

test('list is sorted by username and filters by role', async () => {
  const res = await api('GET', '/users?limit=100', { token: admin });
  assert.equal(res.status, 200);
  const names = res.body.items.map((u) => u.username);
  assert.deepEqual(names, [...names].sort());

  const admins = await api('GET', '/users?role=ADMIN&limit=100', { token: admin });
  assert.equal(admins.status, 200);
  assert.ok(admins.body.items.every((u) => u.role === 'ADMIN'));
  assert.ok(admins.body.items.some((u) => u.username === adminUsername));

  assertError(await api('GET', '/users?role=admin', { token: admin }), 400, 40002);
});

test('duplicate username -> 409 40904', async () => {
  const { user } = await createUser();
  const res = await api('POST', '/users', { token: admin, body: newUserBody({ username: user.username }) });
  assertError(res, 409, 40904);
});

test('ADMIN with jurisdiction_level DISTRICT -> 400 40001', async () => {
  const res = await api('POST', '/users', { token: admin, body: newUserBody({ role: 'ADMIN' }) });
  assertError(res, 400, 40001);
});

test('missing, unknown and invalid fields -> 400 40001 listing each problem', async () => {
  const { name: _name, ...missingName } = newUserBody();
  assertError(await api('POST', '/users', { token: admin, body: missingName }), 400, 40001);

  const res = await api('POST', '/users', {
    token: admin,
    body: newUserBody({ extra: 1, password: 'short', district_id: 99 }),
  });
  assertError(res, 400, 40001);
  assert.equal(res.body.error.length, 3);
});

test('PUT without If-Match -> 403 40303; stale If-Match -> 412 41201', async () => {
  const { user, etag } = await createUser();
  const path = `/users/${user.user_id}`;

  assertError(await api('PUT', path, { token: admin, body: editable(user) }), 403, 40303);

  const changed = { ...editable(user), name: 'Renamed User', jurisdiction_level: 'PROVINCIAL' };
  const ok = await api('PUT', path, { token: admin, body: changed, headers: { 'If-Match': etag } });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(ok.body, { user_id: user.user_id, ...changed });
  assert.notEqual(ok.headers.get('etag'), etag);

  const stale = await api('PUT', path, { token: admin, body: editable(user), headers: { 'If-Match': etag } });
  assertError(stale, 412, 41201);
});

test('PUT with a password field -> 400 40001', async () => {
  const { user, etag } = await createUser();
  const body = { ...editable(user), password: 'new-password-123' };
  const res = await api('PUT', `/users/${user.user_id}`, { token: admin, body, headers: { 'If-Match': etag } });
  assertError(res, 400, 40001);
});

test('admin PUT / DELETE own account -> 403 40305', async () => {
  const list = await api('GET', '/users?role=ADMIN&limit=100', { token: admin });
  const self = list.body.items.find((u) => u.username === adminUsername);
  const path = `/users/${self.user_id}`;
  const etag = (await api('GET', path, { token: admin })).headers.get('etag');

  const put = await api('PUT', path, { token: admin, body: editable(self), headers: { 'If-Match': etag } });
  assertError(put, 403, 40305);
  assertError(await api('DELETE', path, { token: admin, headers: { 'If-Match': etag } }), 403, 40305);
});

test('analyst on /users -> 403 40301', async () => {
  assertError(await api('GET', '/users', { token: analyst }), 403, 40301);
  assertError(await api('POST', '/users', { token: analyst, body: newUserBody() }), 403, 40301);
});

test('own password change -> 200 no-store; old token 401 40102; new password works', async () => {
  const { user, password } = await createUser();
  const oldToken = await loginToken(user.username, password);
  const newPassword = `pw-${suffix()}`;

  const res = await changePassword(oldToken, user.user_id, { current_password: password, new_password: newPassword });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(Object.keys(res.body).sort(), ['password_changed_at', 'user_id']);
  assert.equal(res.body.user_id, user.user_id);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('pragma'), 'no-cache');

  assertError(await api('GET', '/provinces', { token: oldToken }), 401, 40102);
  assertError(await login(user.username, password), 401, 40103);
  await loginToken(user.username, newPassword);
});

test('wrong current password -> 403 40307; same new password -> 400 40001', async () => {
  const { user, password } = await createUser();
  const token = await loginToken(user.username, password);

  const wrong = await changePassword(token, user.user_id, {
    current_password: 'not-the-password',
    new_password: `pw-${suffix()}`,
  });
  assertError(wrong, 403, 40307);

  const same = await changePassword(token, user.user_id, { current_password: password, new_password: password });
  assertError(same, 400, 40001);
});

test("analyst changing another user's password -> 403 40308", async () => {
  const { user } = await createUser();
  const res = await changePassword(analyst, user.user_id, { new_password: `pw-${suffix()}` });
  assertError(res, 403, 40308);
});

test('admin reset -> 200; old token revoked; new password works', async () => {
  const { user, password } = await createUser();
  const oldToken = await loginToken(user.username, password);
  const newPassword = `pw-${suffix()}`;

  const res = await changePassword(admin, user.user_id, { new_password: newPassword });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.headers.get('cache-control'), 'no-store');

  assertError(await api('GET', '/provinces', { token: oldToken }), 401, 40102);
  await loginToken(user.username, newPassword);

  const extra = await changePassword(admin, user.user_id, { new_password: newPassword, current_password: 'x' });
  assertError(extra, 400, 40001);
});

test('DELETE then DELETE -> 200 then 404; deleted user token -> 401 40102', async () => {
  const { user, password, etag } = await createUser();
  const token = await loginToken(user.username, password);
  const path = `/users/${user.user_id}`;

  const first = await api('DELETE', path, { token: admin, headers: { 'If-Match': etag } });
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(first.body, user);

  assertError(await api('DELETE', path, { token: admin, headers: { 'If-Match': etag } }), 404, 40401);
  assertError(await api('GET', '/provinces', { token }), 401, 40102);
});

test('unknown or malformed user id -> 404 40401', async () => {
  assertError(await api('GET', `/users/${crypto.randomUUID()}`, { token: admin }), 404, 40401);
  assertError(await api('GET', '/users/not-a-uuid', { token: admin }), 404, 40401);
});

test('JSON body over 16kb -> 400 40001', async () => {
  const res = await api('POST', '/users', { token: admin, body: newUserBody({ name: 'x'.repeat(17 * 1024) }) });
  assertError(res, 400, 40001);
});

test('"username": { "$gt": "" } -> 400 40001', async () => {
  const res = await api('POST', '/users', { token: admin, body: newUserBody({ username: { $gt: '' } }) });
  assertError(res, 400, 40001);
});

test('method not allowed on /users/{user-id}/password -> 405 with Allow: POST', async () => {
  const { user } = await createUser();
  const res = await api('GET', `/users/${user.user_id}/password`, { token: admin });
  assertError(res, 405, 40501);
  assert.equal(res.headers.get('allow'), 'POST');
});

// §7.11: a successful login resets the count of its key
test('rate-limit reset: 9 failures, success, 10 failures -> 401; 11th -> 429 42901', async () => {
  const username = `probe-reset-${suffix()}`;
  const password = `pw-${suffix()}`;
  const res = await api('POST', '/users', { token: admin, body: newUserBody({ username, password }) });
  assert.equal(res.status, 201, res.text);
  const userId = res.body.user_id;
  const etag = res.headers.get('etag');

  try {
    for (let i = 1; i <= 9; i++) {
      assertError(await login(username, 'wrong-password'), 401, 40103);
    }
    assert.equal((await login(username, password)).status, 200);
    for (let i = 1; i <= 9; i++) {
      assertError(await login(username, 'wrong-password'), 401, 40103);
    }
    assertError(await login(username, 'wrong-password'), 401, 40103);
    const limited = await login(username, 'wrong-password');
    assertError(limited, 429, 42901);
    assert.match(limited.headers.get('retry-after'), /^[1-9][0-9]*$/);
  } finally {
    const deleted = await api('DELETE', `/users/${userId}`, { token: admin, headers: { 'If-Match': etag } });
    assert.equal(deleted.status, 200, deleted.text);
  }
});
