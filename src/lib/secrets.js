// §7.7 Device secrets, §7.8 Passwords
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
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
