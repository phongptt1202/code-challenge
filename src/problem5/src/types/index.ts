import { Request } from 'express';
import { JwtPayload } from '../utils/jwt.util';

export interface AuthenticatedRequest<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: JwtPayload;
}

export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
}

export interface PaginationQuery {
  limit?: string;
  offset?: string;
}

export interface UserFilters extends PaginationQuery {
  firstName?: string;
  lastName?: string;
  minAge?: string;
  maxAge?: string;
}
