import { Request, Response, NextFunction } from 'express';
import logger from './logger';

interface HttpError extends Error {
  status?: number;
  code?: string;
  expose?: boolean;
}

// Wrap async route handlers to forward errors to Express error middleware
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Centralized Express error handler (4-arg signature)
const errorHandler = (err: HttpError, req: Request, res: Response, _next: NextFunction): void => {
  logger.error({ err, method: req.method, path: req.path }, 'Unhandled route error');

  const status = err.status || 500;
  const body: { error: string; code?: string } = { error: err.expose ? err.message : 'Internal server error' };
  if (err.code) body.code = err.code;

  res.status(status).json(body);
};

export { asyncHandler, errorHandler };
