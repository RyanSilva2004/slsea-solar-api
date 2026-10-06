// §7.10 Origin guard (§6.2 step 0)
import crypto from 'node:crypto';
import config from '../config.js';
import { ApiError } from '../lib/errors.js';

const expected = Buffer.from(config.originSecret, 'utf8');

function matches(value) {
  const given = Buffer.from(value ?? '', 'utf8');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export default function origin(req, res, next) {
  if (config.originSecret === '' || matches(req.get('X-Origin-Secret'))) {
    return next();
  }
  next(new ApiError(40309, 'The X-Origin-Secret header is missing or wrong.'));
}
