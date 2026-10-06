// §7.5 (§6.2 step 5)
import { ApiError } from '../lib/errors.js';

export default function requireScope(...anyOf) {
  return (req, res, next) => {
    if (!anyOf.some((scope) => req.principal.scopes.includes(scope))) {
      return next(new ApiError(40301, `This request needs the scope ${anyOf.join(' or ')}.`));
    }
    next();
  };
}
