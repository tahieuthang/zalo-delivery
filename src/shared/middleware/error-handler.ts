import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import logger from '../logger/logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    logger.warn({ errorCode: err.errorCode, path: req.path }, err.message);
    res.status(err.statusCode).json({
      error: err.message,
      code: err.errorCode,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      code: ErrorCode.INVALID_INPUT,
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // Unexpected errors
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    code: ErrorCode.INTERNAL_ERROR,
  });
}
