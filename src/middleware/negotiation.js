// §6.2 step 3
import { ApiError } from '../lib/errors.js';

export default function negotiation(req, res, next) {
  if (req.get('Accept') !== undefined && !req.accepts('application/json')) {
    return next(new ApiError(40601, 'The Accept header must allow application/json.'));
  }
  next();
}
