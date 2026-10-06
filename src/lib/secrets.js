// §7.7 Device secrets, §7.8 Passwords
import bcrypt from 'bcryptjs';

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}
