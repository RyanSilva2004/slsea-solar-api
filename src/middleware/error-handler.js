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
  // §6.1, §6.2: a path parameter with invalid percent-encoding is an invalid path id
  if (err instanceof URIError) {
    return res.status(404).json(errorBody(40401, 'No resource exists with this id.'));
  }
  console.error(err);
  return res.status(500).json(errorBody(50001, 'An unexpected error occurred.'));
}
