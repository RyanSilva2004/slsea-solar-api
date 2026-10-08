// §6.11 (§6.2 step 0)
import config from '../config.js';

const https = config.publicBaseUrl.startsWith('https://');
const TOKEN_PATH = '/solar/v1.0/token';

export default function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  if (https) {
    res.set('Strict-Transport-Security', 'max-age=31536000');
  }
  // §7.2: every /token response, errors included
  if (req.path === TOKEN_PATH) {
    res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  }
  next();
}
