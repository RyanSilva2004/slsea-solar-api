// EP13 /users, EP14 /users/{user-id}, EP15 /users/{user-id}/password
import crypto from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { checkIfMatch, sendCreated, sendUpdated, sendWithCaching } from '../lib/http-cache.js';
import { collection, paging } from '../lib/pagination.js';
import { readQuery } from '../lib/query.js';
import * as represent from '../lib/representations.js';
import { checkPassword, hashPassword } from '../lib/secrets.js';
import { toIso } from '../lib/time.js';
import { checkNewPassword, readOwnPasswordBody, readResetPasswordBody, readUserBody } from '../lib/validation.js';
import User from '../models/user.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/; // §6.1

// §6.1: invalid path id or unknown id → 404 40401
async function findUser(rawId) {
  const user = UUID_PATTERN.test(rawId) ? await User.findOne({ user_id: rawId }).lean() : null;
  if (!user) {
    throw new ApiError(40401, 'No user exists with this id.');
  }
  return user;
}

function usernameTaken() {
  return new ApiError(40904, 'This username is already used by another user.');
}

// §9 EP13: also catch the unique index error 11000
async function saveCatchingDuplicate(save) {
  try {
    await save();
  } catch (err) {
    if (err?.code === 11000) {
      throw usernameTaken();
    }
    throw err;
  }
}

function refuseOwnAccount(req, user) {
  if (user.user_id === req.principal.user.user_id) {
    throw new ApiError(40305, 'An administrator cannot change or delete their own account here.');
  }
}

// EP13 GET
export async function listUsers(req, res) {
  const query = readQuery(req, ['district-id', 'role', 'jurisdiction-level', 'offset', 'limit']);
  const { offset, limit } = paging(query);
  const filter = {};
  if (query['district-id'] !== undefined) {
    filter.district_id = query['district-id'];
  }
  if (query.role !== undefined) {
    filter.role = query.role;
  }
  if (query['jurisdiction-level'] !== undefined) {
    filter.jurisdiction_level = query['jurisdiction-level'];
  }
  const [count, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ username: 1 }).skip(offset).limit(limit).lean(),
  ]);
  const body = collection(req, { count, items: users.map(represent.user), offset, limit });
  sendWithCaching(req, res, body, new Date());
}

// EP13 POST
export async function createUser(req, res) {
  readQuery(req, []);
  const { password, ...fields } = readUserBody(req.body, { withPassword: true });
  if (await User.exists({ username: fields.username })) {
    throw usernameTaken();
  }
  const now = new Date();
  const user = {
    user_id: crypto.randomUUID(),
    ...fields,
    password_hash: await hashPassword(password),
    password_changed_at: now,
    created_at: now,
    updated_at: now,
  };
  await saveCatchingDuplicate(() => User.create(user));
  sendCreated(res, represent.user(user), `/users/${user.user_id}`, now);
}

// EP14 GET
export async function getUser(req, res) {
  readQuery(req, []);
  const user = await findUser(req.params.id);
  sendWithCaching(req, res, represent.user(user), user.updated_at);
}

// EP14 PUT: body → 404 → If-Match → own account → username taken
export async function replaceUser(req, res) {
  readQuery(req, []);
  const fields = readUserBody(req.body, { withPassword: false });
  const user = await findUser(req.params.id);
  checkIfMatch(req, represent.user(user));
  refuseOwnAccount(req, user);
  if (await User.exists({ username: fields.username, user_id: { $ne: user.user_id } })) {
    throw usernameTaken();
  }
  const now = new Date();
  await saveCatchingDuplicate(() => User.updateOne({ user_id: user.user_id }, { $set: { ...fields, updated_at: now } }));
  sendUpdated(res, represent.user({ ...user, ...fields }), now);
}

// EP14 DELETE: 404 → If-Match → own account → delete
export async function deleteUser(req, res) {
  readQuery(req, []);
  const user = await findUser(req.params.id);
  checkIfMatch(req, represent.user(user));
  refuseOwnAccount(req, user);
  await User.deleteOne({ user_id: user.user_id });
  res.json(represent.user(user));
}

async function ownPassword(req) {
  const caller = req.principal.user;
  const { currentPassword, newPassword } = readOwnPasswordBody(req.body);
  if (!(await checkPassword(currentPassword, caller.password_hash))) {
    throw new ApiError(40307, 'current_password is wrong.');
  }
  checkNewPassword(newPassword, currentPassword);
  return { user: caller, newPassword };
}

// 40308 is checked before the user is looked up
async function resetPassword(req) {
  if (!req.principal.scopes.includes('users:manage')) {
    throw new ApiError(40308, "Only an administrator can set another user's password.");
  }
  const newPassword = readResetPasswordBody(req.body);
  const user = await findUser(req.params.id);
  return { user, newPassword };
}

// EP15 POST
export async function changePassword(req, res) {
  readQuery(req, []);
  const own = req.params.id === req.principal.user.user_id;
  const { user, newPassword } = own ? await ownPassword(req) : await resetPassword(req);
  const now = new Date();
  const passwordHash = await hashPassword(newPassword);
  await User.updateOne(
    { user_id: user.user_id },
    { $set: { password_hash: passwordHash, password_changed_at: now, updated_at: now } },
  );
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }); // §6.11
  res.json({ user_id: user.user_id, password_changed_at: toIso(now) });
}
