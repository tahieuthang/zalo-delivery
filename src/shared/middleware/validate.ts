import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

function formatZodError(error: ZodError) {
  const err = new AppError(
    400,
    ErrorCode.INVALID_INPUT,
    'Validation failed',
    error.flatten().fieldErrors,
  );
  return err;
}

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(formatZodError(result.error));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(formatZodError(result.error));
    }
    req.query = result.data as Record<string, string>;
    next();
  };
}
