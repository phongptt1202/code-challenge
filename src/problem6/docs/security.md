# Security Implementation Guide

> Comprehensive security implementation for the Real-Time Scoreboard API

## Table of Contents

1. [Overview](#overview)
2. [JWT Authentication](#jwt-authentication)
3. [Rate Limiting](#rate-limiting)
4. [Input Validation](#input-validation)
5. [Server-Side Score Calculation](#server-side-score-calculation)
6. [Additional Security Measures](#additional-security-measures)
7. [Security Checklist](#security-checklist)
8. [Testing Security](#testing-security)

## Overview

The Real-Time Scoreboard API implements multiple layers of security to protect against common web vulnerabilities:

- **Authentication**: JWT token-based authentication for all score updates
- **Authorization**: User isolation and permission validation
- **Input Validation**: Zod schema validation on all requests
- **Rate Limiting**: Per-user and global rate limits
- **Data Protection**: Parameterized queries (Prisma ORM)
- **Transport Security**: HTTPS and Helmet.js security headers
- **Anti-Cheat**: Server-side score calculation and validation
- **Secrets Management**: Environment-based secrets with AWS Secrets Manager integration

### Security Architecture

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │ HTTPS
       ▼
┌──────────────────────────┐
│  Rate Limit Middleware   │ ◄── Per-IP & Per-User limits
├──────────────────────────┤
│  Input Validation (Zod)  │ ◄── Schema validation
├──────────────────────────┤
│  JWT Auth Middleware     │ ◄── Token verification
├──────────────────────────┤
│  CORS Middleware         │ ◄── Origin whitelisting
├──────────────────────────┤
│  Helmet.js Headers       │ ◄── Security headers
├──────────────────────────┤
│  Request Handler         │ ◄── Business logic
├──────────────────────────┤
│  Parameterized Queries   │ ◄── SQL injection prevention
├──────────────────────────┤
│  Server-Side Validation  │ ◄── Score calculation on server
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│  PostgreSQL / Redis      │
│  (Encrypted at rest)     │
└──────────────────────────┘
```

---

## JWT Authentication

### Purpose

JWT (JSON Web Token) authentication provides stateless, secure user authentication for score updates. Each request requires a valid token issued by the server.

### Implementation

#### 1. Token Generation

Generate tokens during user login/registration with expiration:

```typescript
// src/utils/jwt.util.ts
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from './error.util';

export interface JwtPayload {
  userId: string;
  email: string;
}

/**
 * Generate a signed JWT token
 * @param payload - User identification data
 * @returns Signed JWT token string
 */
export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload as object, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRATION,
  } as jwt.SignOptions);
};

/**
 * Verify and decode JWT token
 * @param token - Token string to verify
 * @returns Decoded payload
 * @throws UnauthorizedError if token is invalid or expired
 */
export const verifyToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw new UnauthorizedError('Token verification failed');
  }
};
```

#### 2. Authentication Middleware

Validate JWT tokens on protected routes:

```typescript
// src/middleware/auth.middleware.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { UnauthorizedError } from '../utils/error.util';
import { verifyToken } from '../utils/jwt.util';

/**
 * Middleware to verify JWT authentication
 * Extracts and validates Bearer token from Authorization header
 *
 * Usage:
 *   router.post('/api/scores', authMiddleware, scoreController)
 *
 * Expected header:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */
export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract Authorization header
    const authHeader = req.headers.authorization;

    // Validate header exists and has correct format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    // Extract token (remove 'Bearer ' prefix)
    const token = authHeader.substring(7);

    // Verify token signature and expiration
    const payload = verifyToken(token);

    // Attach user info to request object
    req.user = payload;

    next();
  } catch (error) {
    // Pass auth errors to error handler
    next(error);
  }
};
```

#### 3. Type Definition

Define authenticated request type:

```typescript
// src/types/index.ts
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}
```

#### 4. Environment Configuration

Secure JWT configuration:

```typescript
// src/config/env.ts
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRATION: z.string().default('24h'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:');
  console.error(JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env = {
  NODE_ENV: parsedEnv.data.NODE_ENV,
  PORT: parseInt(parsedEnv.data.PORT, 10),
  DATABASE_URL: parsedEnv.data.DATABASE_URL,
  JWT_SECRET: parsedEnv.data.JWT_SECRET,
  JWT_EXPIRATION: parsedEnv.data.JWT_EXPIRATION,
  RATE_LIMIT_WINDOW_MS: parseInt(parsedEnv.data.RATE_LIMIT_WINDOW_MS, 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(parsedEnv.data.RATE_LIMIT_MAX_REQUESTS, 10),
};
```

**Security Considerations:**
- JWT_SECRET must be at least 32 characters long
- Store in AWS Secrets Manager, not in .env files
- Rotate secrets periodically (every 90 days)
- Use different secrets for development/staging/production
- Token expiration: 24 hours for web applications

#### 5. Usage in Routes

Apply authentication middleware to protected endpoints:

```typescript
// src/routes/score.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { scoreController } from '../controllers/score.controller';

const router = Router();

// All score endpoints require authentication
router.post('/api/scores', authMiddleware, scoreController.updateScore);

export default router;
```

#### 6. Token Refresh Strategy

For long-lived sessions, implement refresh tokens:

```typescript
/**
 * Implement token refresh endpoint
 * POST /api/auth/refresh
 * Body: { refreshToken: "..." }
 * Response: { accessToken: "...", refreshToken: "..." }
 *
 * - Refresh tokens stored in secure, httpOnly cookies
 * - Rotate refresh tokens on each use
 * - Maintain blacklist of revoked refresh tokens
 */
```

---

## Rate Limiting

### Purpose

Rate limiting prevents abuse by restricting the number of requests per user/IP address. This protects against:
- Brute force attacks
- DoS (Denial of Service) attacks
- API abuse
- Spam score submissions

### Implementation

#### 1. Global Rate Limiter

Apply global rate limit to all requests:

```typescript
// src/app.ts
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

const app = express();

/**
 * Global rate limiter - applies to all routes
 * Default: 100 requests per 15 minutes (900,000 ms)
 *
 * Configuration:
 * - windowMs: Time window in milliseconds
 * - max: Maximum requests per window
 * - message: Response message when limit exceeded
 * - standardHeaders: Include rate limit info in RateLimit-* headers
 * - legacyHeaders: Disable X-RateLimit-* headers (use standard instead)
 */
const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,      // 15 minutes
  max: env.RATE_LIMIT_MAX_REQUESTS,        // 100 requests
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',   // Skip health checks
});

app.use(globalLimiter);
```

#### 2. Per-User Rate Limiter

Stricter limits for authenticated endpoints:

```typescript
/**
 * Per-user rate limiter for score updates
 * Maximum 10 score updates per minute per user
 */
const scoreUpdateLimiter = rateLimit({
  windowMs: 60 * 1000,              // 1 minute
  max: 10,                          // 10 updates per minute
  message: 'Too many score updates, wait before submitting again',
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key generator - rate limit by user ID instead of IP
  keyGenerator: (req: AuthenticatedRequest) => {
    return req.user?.userId || req.ip || 'anonymous';
  },
  skip: (req: AuthenticatedRequest) => !req.user, // Only apply to authenticated users
  // Custom skip condition
  skip: (req) => {
    // Optionally skip rate limiting for admin users
    return req.user?.role === 'admin';
  },
});

// Apply to score endpoint
router.post('/api/scores', scoreUpdateLimiter, authMiddleware, scoreController);
```

#### 3. Sliding Window Implementation

For more accurate rate limiting with distributed systems:

```typescript
/**
 * Redis-backed sliding window rate limiter
 * Suitable for distributed deployments
 */
import RedisStore from 'rate-limit-redis';
import redis from 'redis';

const redisClient = redis.createClient({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});

const slidingWindowLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:',                    // Redis key prefix
  }),
  windowMs: 60 * 1000,               // 1 minute
  max: 10,                           // 10 requests per minute
  keyGenerator: (req: AuthenticatedRequest) => {
    return `user:${req.user?.userId}`;
  },
});

router.post('/api/scores', slidingWindowLimiter, authMiddleware, scoreController);
```

#### 4. Rate Limit Headers

Clients receive rate limit information:

```typescript
/**
 * Standard rate limit headers (RFC 6585):
 *
 * RateLimit-Limit: 10           (Max requests per window)
 * RateLimit-Remaining: 7         (Requests remaining)
 * RateLimit-Reset: 1703073900    (Unix timestamp when limit resets)
 *
 * Example response when rate limited:
 * HTTP/1.1 429 Too Many Requests
 *
 * {
 *   "error": {
 *     "message": "Too many score updates, wait before submitting again",
 *     "code": "RATE_LIMIT_EXCEEDED",
 *     "retryAfter": 45
 *   }
 * }
 */
```

#### 5. Configuration Best Practices

```typescript
// .env configuration
RATE_LIMIT_WINDOW_MS=900000        # 15 minutes global window
RATE_LIMIT_MAX_REQUESTS=100        # 100 requests per window

// Route-specific overrides
const strictLimiter = rateLimit({
  windowMs: 60000,   // 1 minute
  max: 5,            // 5 requests per minute (strict)
});

const relaxedLimiter = rateLimit({
  windowMs: 60000,   // 1 minute
  max: 30,           // 30 requests per minute (relaxed)
});

// Apply based on endpoint sensitivity
router.post('/api/scores', strictLimiter, authMiddleware, scoreController);
router.get('/api/leaderboard', relaxedLimiter, leaderboardController);
```

---

## Input Validation

### Purpose

Input validation prevents malformed requests, injection attacks, and business logic violations. Zod provides runtime schema validation with TypeScript type inference.

### Implementation

#### 1. Score Update Schema

Validate score submission requests:

```typescript
// src/validators/score.validator.ts
import { z } from 'zod';

/**
 * Schema for POST /api/scores requests
 * Validates actionId and userId
 */
export const updateScoreSchema = z.object({
  body: z.object({
    actionId: z
      .string()
      .min(1, 'Action ID is required')
      .max(100, 'Action ID must be at most 100 characters')
      .regex(/^[a-z0-9-]+$/, 'Action ID must contain only lowercase letters, numbers, and hyphens')
      .describe('Action identifier (e.g., "complete-quest", "defeat-boss")'),

    userId: z
      .string()
      .uuid('Invalid user ID format')
      .describe('UUID of the user earning points'),

    score: z
      .number()
      .positive('Score must be positive')
      .int('Score must be an integer')
      .max(10000, 'Score cannot exceed 10,000 points')
      .optional()
      .describe('Optional score override (server validates against action type)'),
  }),
});

export type UpdateScoreRequest = z.infer<typeof updateScoreSchema>;
```

#### 2. Leaderboard Query Schema

Validate pagination and filtering:

```typescript
/**
 * Schema for GET /api/leaderboard query parameters
 * Validates pagination limits
 */
export const leaderboardQuerySchema = z.object({
  query: z.object({
    limit: z
      .string()
      .regex(/^\d+$/, 'Limit must be a number')
      .optional()
      .transform((val) => {
        if (!val) return 10;
        const num = parseInt(val, 10);
        return Math.min(num, 100); // Max 100 records
      })
      .describe('Number of records to return (default: 10, max: 100)'),

    offset: z
      .string()
      .regex(/^\d+$/, 'Offset must be a number')
      .optional()
      .transform((val) => val ? parseInt(val, 10) : 0)
      .describe('Number of records to skip (default: 0)'),
  }).optional(),
});
```

#### 3. User Profile Schema

Validate user information:

```typescript
/**
 * Base user schema
 */
export const userSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must be at most 100 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'First name contains invalid characters'),

  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be at most 100 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'Last name contains invalid characters'),

  age: z
    .number()
    .int('Age must be an integer')
    .min(1, 'Age must be at least 1')
    .max(150, 'Age must be at most 150'),
});

/**
 * Create user validation schema
 */
export const createUserSchema = z.object({
  body: userSchema,
});
```

#### 4. Validation Middleware

Apply schema validation to routes:

```typescript
// src/middleware/validation.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * Validation middleware factory
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 *
 * Usage:
 *   router.post('/api/scores', validate(updateScoreSchema), handler)
 */
export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request against schema
      // Parses body, query, and params
      const validated = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Apply transformed/validated values back to request
      req.body = validated.body;
      req.query = validated.query;
      req.params = validated.params;

      // Continue to next middleware/handler
      next();
    } catch (error) {
      // Pass validation errors to error handler
      next(error);
    }
  };
};
```

#### 5. Error Handling

Handle validation errors gracefully:

```typescript
// src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      },
    });
  }

  // Handle other errors...
};
```

#### 6. Route Implementation

Apply validation to protected routes:

```typescript
// src/routes/score.routes.ts
import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { updateScoreSchema } from '../validators/score.validator';
import { scoreController } from '../controllers/score.controller';

const router = Router();

/**
 * POST /api/scores
 * Update user score with action
 *
 * Middleware stack:
 * 1. Rate limiting (prevent abuse)
 * 2. Input validation (ensure data quality)
 * 3. Authentication (verify user identity)
 * 4. Handler (process score update)
 */
router.post(
  '/api/scores',
  validate(updateScoreSchema),
  authMiddleware,
  scoreController.updateScore
);

export default router;
```

#### 7. Advanced Validation Patterns

Custom validation logic:

```typescript
/**
 * Custom validation with business logic
 */
export const updateScoreSchema = z.object({
  body: z.object({
    actionId: z.string(),
    userId: z.string().uuid(),
  }).refine(
    async (data) => {
      // Verify action exists in database
      const action = await db.action.findUnique({
        where: { id: data.actionId },
      });
      return !!action;
    },
    {
      message: 'Invalid action ID',
      path: ['actionId'],
    }
  ).refine(
    async (data) => {
      // Verify user exists and hasn't already completed this action
      const userAction = await db.userAction.findFirst({
        where: {
          userId: data.userId,
          actionId: data.actionId,
        },
      });
      return !userAction;
    },
    {
      message: 'User has already completed this action',
      path: ['actionId'],
    }
  ),
});
```

---

## Server-Side Score Calculation

### Purpose

Never trust client-provided scores. Always calculate scores on the server to prevent cheating and manipulation.

### Architecture

```
Client Request          Server Processing
─────────────────      ──────────────────
{
  actionId: "...",     1. Validate actionId exists
  userId: "..."        2. Look up action points
}                      3. Apply multipliers/rules
                       4. Check user eligibility
         │             5. Validate against db
         │             6. Calculate final score
         ▼             7. Update database
                       8. Broadcast via pub/sub
Success Response
{
  score: 100,
  totalScore: 2450
}
```

### Implementation

#### 1. Score Calculation Service

Calculate scores server-side:

```typescript
// src/services/score.service.ts
import { prisma } from '../config/database';

interface ScoreUpdateRequest {
  userId: string;
  actionId: string;
  score?: number; // Client-provided score is ignored
}

interface ScoreUpdateResult {
  userId: string;
  actionId: string;
  pointsEarned: number;
  totalScore: number;
  timestamp: Date;
}

export const scoreService = {
  /**
   * Process score update with server-side calculation
   *
   * Security features:
   * - Validates action exists
   * - Looks up action point value from database
   * - Applies business rules and multipliers
   * - Validates user eligibility
   * - Prevents duplicate submissions
   */
  async updateScore(request: ScoreUpdateRequest): Promise<ScoreUpdateResult> {
    const { userId, actionId } = request;

    // 1. Fetch action configuration from database
    const action = await prisma.action.findUnique({
      where: { id: actionId },
      select: {
        id: true,
        points: true,
        maxDailyCount: true,
        requiredLevel: true,
        multiplier: true,
      },
    });

    // Action not found - security check
    if (!action) {
      throw new Error(`Invalid action: ${actionId}`);
    }

    // 2. Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        level: true,
        totalScore: true,
      },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // 3. Verify user meets action requirements
    if (user.level < action.requiredLevel) {
      throw new Error(
        `User level ${user.level} is below required level ${action.requiredLevel}`
      );
    }

    // 4. Check daily limit
    const todayCount = await prisma.userAction.count({
      where: {
        userId,
        actionId,
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
    });

    if (todayCount >= action.maxDailyCount) {
      throw new Error(
        `Daily limit (${action.maxDailyCount}) exceeded for action: ${actionId}`
      );
    }

    // 5. Calculate points with multipliers
    let pointsEarned = action.points;

    // Apply action multiplier
    pointsEarned = Math.floor(pointsEarned * (action.multiplier || 1));

    // Apply time-based bonus (weekend bonus: 1.5x)
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      pointsEarned = Math.floor(pointsEarned * 1.5);
    }

    // Apply streak bonus (if user completed action yesterday)
    const yesterdayAction = await prisma.userAction.findFirst({
      where: {
        userId,
        actionId,
        createdAt: {
          gte: new Date(new Date().setDate(new Date().getDate() - 1)),
          lt: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });

    if (yesterdayAction) {
      pointsEarned = Math.floor(pointsEarned * 1.2); // 20% streak bonus
    }

    // 6. Update database in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Record action completion
      const userAction = await tx.userAction.create({
        data: {
          userId,
          actionId,
          pointsEarned,
          metadata: {
            basePoints: action.points,
            multiplier: action.multiplier || 1,
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Update user total score
      const newTotal = user.totalScore + pointsEarned;
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          totalScore: newTotal,
        },
      });

      return {
        userId,
        actionId,
        pointsEarned,
        totalScore: newTotal,
        timestamp: userAction.createdAt,
      };
    });

    return result;
  },

  /**
   * Validate score integrity
   * Detect tampering by comparing database calculation with claimed score
   */
  async validateScoreIntegrity(userId: string): Promise<boolean> {
    // Recalculate total from all user actions
    const actions = await prisma.userAction.findMany({
      where: { userId },
      select: { pointsEarned: true },
    });

    const calculatedTotal = actions.reduce(
      (sum, action) => sum + action.pointsEarned,
      0
    );

    // Fetch claimed total from user record
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalScore: true },
    });

    // If they don't match, score has been tampered with
    const isValid = user?.totalScore === calculatedTotal;

    if (!isValid) {
      console.error(`Score tampering detected for user ${userId}`);
      // Log security event, alert administrators
    }

    return isValid;
  },
};
```

#### 2. Controller Implementation

Handle score update requests:

```typescript
// src/controllers/score.controller.ts
import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { scoreService } from '../services/score.service';

export const scoreController = {
  /**
   * POST /api/scores
   * Update user score with server-side calculation
   */
  async updateScore(req: AuthenticatedRequest, res: Response) {
    try {
      // Extract authenticated user ID
      const userId = req.user!.userId;

      // Extract and validate action ID
      const { actionId } = req.body;

      // Note: Client-provided score is intentionally ignored
      // Server always calculates score from action configuration

      // Process score update with server-side calculation
      const result = await scoreService.updateScore({
        userId,
        actionId,
        // score is NOT used from client
      });

      // Return updated score information
      res.status(200).json({
        data: {
          userId: result.userId,
          actionId: result.actionId,
          pointsEarned: result.pointsEarned,
          totalScore: result.totalScore,
          timestamp: result.timestamp,
        },
        message: 'Score updated successfully',
      });

      // Broadcast leaderboard update to all connected clients
      // via Redis pub/sub or WebSocket
      await publishScoreUpdate({
        userId,
        totalScore: result.totalScore,
      });
    } catch (error) {
      // Error handling
      res.status(400).json({
        error: {
          message: error instanceof Error ? error.message : 'Score update failed',
          code: 'SCORE_UPDATE_FAILED',
        },
      });
    }
  },
};

/**
 * Publish score update to all connected clients
 * Uses Redis pub/sub for multi-instance support
 */
async function publishScoreUpdate(data: {
  userId: string;
  totalScore: number;
}) {
  const redis = await getRedisClient();
  await redis.publish('score:updated', JSON.stringify(data));
}
```

#### 3. Database Schema

Schema design for score tracking:

```typescript
// prisma/schema.prisma
model User {
  id              String      @id @default(cuid())
  email           String      @unique
  firstName       String
  lastName        String
  totalScore      Int         @default(0)
  level           Int         @default(1)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  actions         UserAction[]

  @@index([totalScore]) // Index for leaderboard queries
}

model Action {
  id              String      @id
  name            String
  description     String?
  points          Int         // Base points value
  maxDailyCount   Int         @default(5)
  requiredLevel   Int         @default(1)
  multiplier      Float       @default(1.0)
  createdAt       DateTime    @default(now())

  userActions     UserAction[]

  @@unique([id])
}

model UserAction {
  id              String      @id @default(cuid())
  userId          String
  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  actionId        String
  action          Action      @relation(fields: [actionId], references: [id], onDelete: Cascade)
  pointsEarned    Int         // Calculated server-side (not from client)
  metadata        Json?       // Store calculation details
  createdAt       DateTime    @default(now())

  @@index([userId, actionId])
  @@index([userId, createdAt])
  @@index([actionId, createdAt])
}
```

#### 4. Anti-Cheat Monitoring

Detect suspicious patterns:

```typescript
/**
 * Anti-cheat monitoring
 * Detect unusual score patterns that may indicate tampering
 */
export const antiCheatService = {
  /**
   * Detect abnormal score updates
   * Flags for review:
   * - User scores way above average
   * - Rapid score increases
   * - Completing actions faster than humanly possible
   */
  async analyzeUserPattern(userId: string) {
    const recentActions = await prisma.userAction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Check for impossible submission rates
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recentCount = recentActions.filter(
      (a) => a.createdAt > thirtyMinutesAgo
    ).length;

    if (recentCount > 50) {
      // More than 50 actions in 30 minutes is suspicious
      console.warn(`Suspicious activity detected for user ${userId}`);
      return { suspicious: true, reason: 'Abnormal submission rate' };
    }

    // Check for impossible point values
    const avgPoints =
      recentActions.reduce((sum, a) => sum + a.pointsEarned, 0) /
      recentActions.length;
    const maxPoints = Math.max(...recentActions.map((a) => a.pointsEarned));

    if (maxPoints > avgPoints * 5) {
      // Points 5x above average
      console.warn(`Suspicious point value detected for user ${userId}`);
      return { suspicious: true, reason: 'Abnormal point values' };
    }

    return { suspicious: false };
  },
};
```

---

## Additional Security Measures

### 1. SQL Injection Prevention

Use Prisma ORM for parameterized queries:

```typescript
/**
 * GOOD: Prisma parameterized queries
 * All queries are parameterized - SQL injection safe
 */
const user = await prisma.user.findUnique({
  where: { id: userId }, // Always parameterized
});

/**
 * AVOID: Raw SQL without parameterization
 * ❌ VULNERABLE TO SQL INJECTION ❌
 */
const user = await prisma.$queryRaw(
  `SELECT * FROM User WHERE id = ${userId}` // UNSAFE!
);

/**
 * GOOD: Raw SQL with parameterization
 * If raw SQL is necessary, use parameterized queries
 */
const user = await prisma.$queryRaw`
  SELECT * FROM User WHERE id = ${userId}
`;
```

### 2. XSS (Cross-Site Scripting) Prevention

Helmet.js security headers:

```typescript
// src/app.ts
import helmet from 'helmet';

const app = express();

/**
 * Helmet.js provides security headers to prevent XSS
 *
 * Headers set:
 * - Content-Security-Policy: Restrict script sources
 * - X-Content-Type-Options: Prevent MIME type sniffing
 * - X-Frame-Options: Prevent clickjacking
 * - X-XSS-Protection: Enable browser XSS filters
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Adjust for your needs
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  })
);
```

Response validation prevents reflected XSS:

```typescript
/**
 * Sanitize output in responses
 * Never return unsanitized user input
 */
app.get('/api/user/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      firstName: true, // These come from database, pre-validated
      lastName: true,
    },
  });

  res.json(user); // Safe - values are from validated database
});
```

### 3. CORS (Cross-Origin Resource Sharing)

Restrict API access to trusted origins:

```typescript
// src/app.ts
import cors from 'cors';

/**
 * CORS configuration
 * Restrict which origins can call this API
 */
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true, // Allow cookies in requests
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Preflight cache 24 hours
};

app.use(cors(corsOptions));

/**
 * .env configuration
 * ALLOWED_ORIGINS=https://example.com,https://app.example.com
 */
```

Preflight request handling:

```typescript
/**
 * Browser sends OPTIONS preflight request before actual request
 *
 * Browser Request:
 * OPTIONS /api/scores
 * Origin: https://app.example.com
 * Access-Control-Request-Method: POST
 *
 * Server Response:
 * Access-Control-Allow-Origin: https://app.example.com
 * Access-Control-Allow-Methods: POST, GET, PUT, DELETE
 * Access-Control-Allow-Headers: Content-Type, Authorization
 */
```

### 4. Secrets Management

Environment-based configuration:

```typescript
// src/config/env.ts
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  ALLOWED_ORIGINS: z.string(),
});

// Validate at startup
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables');
  process.exit(1);
}

export const env = parsed.data;
```

AWS Secrets Manager integration:

```typescript
/**
 * Load secrets from AWS Secrets Manager
 * Recommended for production
 */
import { SecretsManager } from 'aws-sdk';

const secretsManager = new SecretsManager({
  region: 'us-east-1',
});

export async function loadSecrets() {
  try {
    const secret = await secretsManager
      .getSecretValue({ SecretId: 'scoreboard-api/prod' })
      .promise();

    const secrets = JSON.parse(secret.SecretString!);

    return {
      JWT_SECRET: secrets.jwt_secret,
      DATABASE_PASSWORD: secrets.database_password,
      REDIS_PASSWORD: secrets.redis_password,
    };
  } catch (error) {
    console.error('Failed to load secrets:', error);
    process.exit(1);
  }
}
```

Secrets rotation strategy:

```typescript
/**
 * Secrets rotation checklist:
 *
 * 1. Schedule rotation every 90 days
 * 2. Create new secret with new value
 * 3. Update application to use new secret
 * 4. Monitor old secret deprecation
 * 5. Remove old secret after 7 days
 *
 * Tools:
 * - AWS Secrets Manager auto-rotation
 * - HashiCorp Vault
 * - 1Password
 */
```

### 5. HTTPS/TLS Configuration

Enforce encrypted connections:

```typescript
/**
 * AWS ECS / Load Balancer Configuration
 *
 * All traffic over HTTPS with TLS 1.2+
 *
 * 1. ALB listener on port 443 (HTTPS)
 * 2. Redirect HTTP → HTTPS
 * 3. ACM certificate (auto-renewal)
 * 4. Security group allows only 443 (inbound)
 */

// Application level: Enforce HTTPS redirect
app.use((req, res, next) => {
  if (!req.secure && process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Security headers
app.use(
  helmet.hsts({
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  })
);
```

### 6. Database Security

PostgreSQL security practices:

```sql
-- Create application-specific database user with minimal permissions
CREATE USER scoreboard_api WITH PASSWORD 'strong_random_password_32chars_min';

-- Grant minimal required permissions
GRANT CONNECT ON DATABASE scoreboard TO scoreboard_api;
GRANT USAGE ON SCHEMA public TO scoreboard_api;
GRANT SELECT, INSERT, UPDATE ON public.* TO scoreboard_api;

-- Disable superuser privileges
ALTER ROLE scoreboard_api WITH NOSUPERUSER;

-- Restrict connection to localhost only
-- Set in postgresql.conf:
-- listen_addresses = 'localhost'

-- Enable SSL connections
-- ssl = on
-- ssl_cert_file = '/path/to/server.crt'
-- ssl_key_file = '/path/to/server.key'

-- Enable audit logging
-- log_statement = 'all'
-- log_connections = on
-- log_disconnections = on
```

Connection security:

```typescript
// Database connection with SSL
const DATABASE_URL = `postgres://user:pass@host:5432/db?sslmode=require`;

// Connection pool limits
const pool = new Pool({
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  ssl: {
    rejectUnauthorized: true, // Verify certificate
    ca: readFileSync('/path/to/ca.crt'),
  },
  max: 20,             // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 7. Password Security

If storing passwords (for auth service):

```typescript
/**
 * Password hashing with bcrypt
 * Never store plain text passwords
 */
import bcrypt from 'bcrypt';

export const authService = {
  async hashPassword(password: string): Promise<string> {
    // Salt rounds: 12 = ~100ms hashing time
    return bcrypt.hash(password, 12);
  },

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  /**
   * Password requirements:
   * - Minimum 12 characters
   * - Must contain uppercase, lowercase, number, special char
   * - No common passwords (use common-passwords list)
   */
  validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain uppercase letters');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain lowercase letters');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain numbers');
    }
    if (!/[!@#$%^&*]/.test(password)) {
      errors.push('Password must contain special characters');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};
```

### 8. Logging and Monitoring

Security event logging:

```typescript
// src/utils/logger.util.ts
export const logger = {
  /**
   * Log security events
   * Never log sensitive data (passwords, tokens)
   */
  security(event: {
    type: 'AUTH_FAILURE' | 'RATE_LIMIT' | 'VALIDATION_ERROR' | 'TAMPERING';
    userId?: string;
    ip: string;
    message: string;
    details?: any;
  }) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'SECURITY',
      ...event,
    };

    console.log(JSON.stringify(logEntry));

    // Send to security monitoring service
    // - CloudWatch Logs
    // - Datadog
    // - Splunk
  },

  /**
   * Monitor security metrics
   */
  metrics(event: {
    type: 'AUTH_SUCCESS' | 'RATE_LIMIT_HIT' | 'SCORE_UPDATE';
    value: number;
    tags: Record<string, string>;
  }) {
    // Send to metrics aggregator
    // - CloudWatch Metrics
    // - Prometheus
    // - DataDog
  },
};
```

---

## Security Checklist

Use this checklist for deployment and reviews:

### Authentication & Authorization
- [ ] JWT tokens use strong secret (min 32 chars)
- [ ] Token expiration set to 24 hours or less
- [ ] All protected endpoints require valid token
- [ ] User ID from token, not from request body
- [ ] Refresh token rotation implemented
- [ ] Token blacklist for logout implemented

### Input Validation
- [ ] All inputs validated with Zod schemas
- [ ] Request size limits enforced
- [ ] File uploads restricted by type and size
- [ ] No direct use of user input in queries
- [ ] Validation errors don't leak information

### Rate Limiting
- [ ] Global rate limit enabled (100 req/15min)
- [ ] Per-user rate limit on score endpoint (10 req/min)
- [ ] Rate limit headers returned to clients
- [ ] Redis backing for distributed rate limiting

### Data Protection
- [ ] Database uses parameterized queries (Prisma)
- [ ] Sensitive data encrypted at rest
- [ ] Database connections use SSL/TLS
- [ ] Database user has minimal permissions
- [ ] Regular database backups tested

### API Security
- [ ] CORS configured to whitelist origins
- [ ] HTTPS enforced (redirect HTTP → HTTPS)
- [ ] Security headers set via Helmet.js
- [ ] No sensitive data in error messages
- [ ] Request/response size limits enforced

### Secrets Management
- [ ] Environment secrets in AWS Secrets Manager
- [ ] No secrets in version control
- [ ] Secrets rotated every 90 days
- [ ] Different secrets per environment
- [ ] Access to secrets logged

### Logging & Monitoring
- [ ] Security events logged (auth, rate limit, errors)
- [ ] Logs exclude sensitive data (passwords, tokens)
- [ ] Centralized logging (CloudWatch, Splunk)
- [ ] Security alerts configured
- [ ] Regular log review scheduled

### Score Integrity
- [ ] Scores calculated server-side only
- [ ] Client-provided scores ignored
- [ ] Score calculation audited
- [ ] Suspicious patterns detected
- [ ] Score integrity checks scheduled

### Deployment
- [ ] Environment variables validated at startup
- [ ] Dependencies scanned for vulnerabilities
- [ ] Security headers verified in production
- [ ] HTTPS certificate valid and up-to-date
- [ ] DDoS protection enabled (CloudFlare, AWS Shield)

---

## Testing Security

### Unit Tests

```typescript
// tests/middleware/auth.middleware.test.ts
import { authMiddleware } from '../../src/middleware/auth.middleware';
import { generateToken, verifyToken } from '../../src/utils/jwt.util';

describe('Auth Middleware', () => {
  it('should accept valid token', () => {
    const payload = { userId: 'user-1', email: 'user@example.com' };
    const token = generateToken(payload);
    const request = {
      headers: { authorization: `Bearer ${token}` },
    };

    authMiddleware(request, {} as any, (error) => {
      expect(error).toBeUndefined();
      expect(request.user).toEqual(payload);
    });
  });

  it('should reject missing token', () => {
    const request = { headers: {} };
    authMiddleware(request, {} as any, (error) => {
      expect(error).toBeDefined();
      expect(error.message).toContain('No token provided');
    });
  });

  it('should reject expired token', () => {
    // Create token with immediate expiration
    const token = jwt.sign(
      { userId: 'user-1', email: 'user@example.com' },
      env.JWT_SECRET,
      { expiresIn: '0s' }
    );

    // Wait for expiration
    setTimeout(() => {
      const request = {
        headers: { authorization: `Bearer ${token}` },
      };

      authMiddleware(request, {} as any, (error) => {
        expect(error).toBeDefined();
        expect(error.message).toContain('Token has expired');
      });
    }, 100);
  });
});
```

### Integration Tests

```typescript
// tests/api/score.integration.test.ts
describe('Score Update API', () => {
  it('should update score with valid token', async () => {
    const user = await createTestUser();
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    const response = await request(app)
      .post('/api/scores')
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionId: 'complete-quest',
        userId: user.id,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.pointsEarned).toBeGreaterThan(0);
  });

  it('should reject invalid token', async () => {
    const response = await request(app)
      .post('/api/scores')
      .set('Authorization', 'Bearer invalid-token')
      .send({ actionId: 'complete-quest', userId: 'user-1' });

    expect(response.status).toBe(401);
  });

  it('should reject missing token', async () => {
    const response = await request(app)
      .post('/api/scores')
      .send({ actionId: 'complete-quest', userId: 'user-1' });

    expect(response.status).toBe(401);
  });

  it('should rate limit excessive requests', async () => {
    const user = await createTestUser();
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    // Submit 11 requests (limit is 10/minute)
    for (let i = 0; i < 11; i++) {
      const response = await request(app)
        .post('/api/scores')
        .set('Authorization', `Bearer ${token}`)
        .send({ actionId: 'complete-quest', userId: user.id });

      if (i < 10) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(429); // Too Many Requests
      }
    }
  });

  it('should validate input schema', async () => {
    const user = await createTestUser();
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    const response = await request(app)
      .post('/api/scores')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionId: '' }); // Missing or invalid actionId

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should calculate score server-side', async () => {
    const user = await createTestUser();
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    const response = await request(app)
      .post('/api/scores')
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionId: 'complete-quest',
        userId: user.id,
        score: 9999, // Client-provided score is ignored
      });

    expect(response.status).toBe(200);
    // Score should come from action config, not client
    expect(response.body.data.pointsEarned).toBeLessThanOrEqual(100);
  });
});
```

### Load Testing Security

```bash
# Test rate limiting under load
autocannon -c 100 -d 30 -R 50 \
  --header "Authorization: Bearer ${JWT_TOKEN}" \
  http://localhost:3000/api/scores
```

---

## References

- [OWASP Top 10 Web Vulnerabilities](https://owasp.org/www-project-top-ten/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8949)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Zod Documentation](https://zod.dev/)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Document Version:** 1.0
**Last Updated:** 2025-12-11
**Security Level:** Internal Use Only
