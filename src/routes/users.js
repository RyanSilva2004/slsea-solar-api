// EP13 /users, EP14 /users/{user-id}, EP15 /users/{user-id}/password
import express from 'express';
import * as users from '../controllers/users.js';
import authenticate from '../middleware/authenticate.js';
import requireScope from '../middleware/require-scope.js';
import jsonBody from '../middleware/json-body.js';
import methodNotAllowed from '../middleware/method-not-allowed.js';

const router = express.Router({ strict: true, caseSensitive: true, mergeParams: true });
const manage = [authenticate, requireScope('users:manage')];

router
  .route('/users')
  .get(manage, users.listUsers)
  .post(manage, jsonBody, users.createUser)
  .all(methodNotAllowed(['GET', 'POST']));

router
  .route('/users/:id')
  .get(manage, users.getUser)
  .put(manage, jsonBody, users.replaceUser)
  .delete(manage, users.deleteUser)
  .all(methodNotAllowed(['GET', 'PUT', 'DELETE']));

router
  .route('/users/:id/password')
  .post(authenticate, requireScope('account:write', 'users:manage'), jsonBody, users.changePassword)
  .all(methodNotAllowed(['POST']));

export default router;
