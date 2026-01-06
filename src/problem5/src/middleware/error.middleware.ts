import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/error.util';
import { ErrorResponse } from '../types';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.util';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction
) => {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    logger.warn({
      msg: 'Validation error',
      path: req.path,
      method: req.method,
      errors: err.errors,
    });
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.errors,
      },
    });
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    const logLevel = err.statusCode >= 500 ? 'error' : 'warn';
    logger[logLevel]({
      msg: err.message,
      path: req.path,
      method: req.method,
      statusCode: err.statusCode,
      code: err.code,
      details: err.details,
    });
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        details: err.details,
      },
    });
  }

  // Handle unknown errors
  logger.error({
    msg: 'Unhandled error',
    err,
    path: req.path,
    method: req.method,
  });
  return res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  });
};
