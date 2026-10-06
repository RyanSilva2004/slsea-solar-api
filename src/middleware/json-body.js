// §6.2 step 8
import express from 'express';
import { ApiError } from '../lib/errors.js';

const parseJson = express.json({ limit: '16kb' });

function checkContentType(req, res, next) {
  if (!req.is('application/json')) {
    return next(new ApiError(41501, 'Content-Type must be application/json.'));
  }
  next();
}

function parse(req, res, next) {
  parseJson(req, res, (err) => {
    if (!err) {
      return next();
    }
    if (err.type === 'charset.unsupported' || err.type === 'encoding.unsupported') {
      return next(new ApiError(41501, 'Unsupported charset or content encoding.'));
    }
    if (err.type === 'entity.too.large') {
      return next(new ApiError(40001, 'Request body is larger than 16kb.'));
    }
    if (err.type === 'entity.parse.failed') {
      return next(new ApiError(40001, 'Malformed JSON body'));
    }
    next(err);
  });
}

function requireObject(req, res, next) {
  const body = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return next(new ApiError(40001, 'The request body must be a JSON object.'));
  }
  next();
}

const jsonBody = [checkContentType, parse, requireObject];

export default jsonBody;
