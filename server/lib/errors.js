const logger = require('./logger');

// Wrap async route handlers to forward errors to Express error middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Centralized Express error handler (4-arg signature)
const errorHandler = (err, req, res, _next) => {
  logger.error({ err, method: req.method, path: req.path }, 'Unhandled route error');

  const status = err.status || 500;
  const body = { error: err.expose ? err.message : 'Internal server error' };
  if (err.code) body.code = err.code;

  res.status(status).json(body);
};

module.exports = { asyncHandler, errorHandler };
