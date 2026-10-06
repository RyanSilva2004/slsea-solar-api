// §6.11 (§6.2 step 0)
import config from '../config.js';

const https = config.publicBaseUrl.startsWith('https://');

export default function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  if (https) {
    res.set('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
}
