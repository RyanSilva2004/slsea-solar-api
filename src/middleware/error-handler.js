// §6.2, §6.10
import { ApiError, errorBody } from '../lib/errors.js';

export default function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof ApiError) {
    res.set(err.headers);
    return res.status(err.status).json(errorBody(err.code, err.message, err.errors));
  }
  console.error(err);
  return res.status(500).json(errorBody(50001, 'An unexpected error occurred.'));
}
