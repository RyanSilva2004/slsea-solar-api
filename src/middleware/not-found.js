// §6.1, §6.2 step 4
import { ApiError } from '../lib/errors.js';

export default function notFound(req, res, next) {
  next(new ApiError(40403, `No resource exists at ${req.path}.`));
}
