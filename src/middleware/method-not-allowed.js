// §6.1: last handler of every router.route(path)
import { ApiError } from '../lib/errors.js';

export default function methodNotAllowed(methods) {
  const allow = methods.join(', ');
  return (req, res, next) => {
    next(
      new ApiError(40501, `${req.method} is not allowed on this path. Allowed: ${allow}.`, {
        headers: { Allow: allow },
      }),
    );
  };
}
