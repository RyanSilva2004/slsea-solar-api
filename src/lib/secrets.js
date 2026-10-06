// §7.7 Device secrets, §7.8 Passwords
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

// §7.2: compared against when the username is unknown, so both cases take equal time
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// hash missing (unknown user) → compares against DUMMY_HASH and resolves false
export async function checkPassword(password, hash) {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return Boolean(hash) && matches;
}

export function newDeviceSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashDeviceSecret(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function deviceSecretMatches(secret, storedHash) {
  const given = Buffer.from(hashDeviceSecret(secret), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
}

// §7.2 Authorization: Basic base64(installation_id:device_secret) → { id, secret } or null
export function readBasic(header) {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header ?? '');
  if (!match) {
    return null;
  }
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 1 || colon === decoded.length - 1) {
    return null;
  }
  return { id: decoded.slice(0, colon), secret: decoded.slice(colon + 1) };
}
