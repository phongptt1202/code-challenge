# API Specification

> Real-Time Scoreboard API - Production-ready endpoint reference

## Overview

The Real-Time Scoreboard API provides a secure, scalable interface for managing user scores and retrieving live leaderboard updates. All endpoints are designed for high performance and require appropriate authentication and rate limiting.

## Base URL

```
https://api.scoreboard.example.com/api
```

## Authentication

All endpoints requiring authentication use **JWT Bearer tokens** in the `Authorization` header.

### JWT Token Format

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Claims:**
- `sub` - User ID (string)
- `iat` - Issued at timestamp
- `exp` - Expiration timestamp (recommended: 24 hours)
- `aud` - Audience (must be "scoreboard-api")

**Token Generation:**
The token should be generated server-side with a secret key stored securely in AWS Secrets Manager.

## Rate Limiting

- **POST /api/scores** - Max 10 requests per minute per user
- **GET /api/leaderboard** - Max 60 requests per minute
- **GET /api/leaderboard/stream** - 1 connection per user (persistent)

Rate limit headers are returned with each response:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 8
X-RateLimit-Reset: 1702336800
```

## Error Responses

All error responses follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "statusCode": 400,
    "timestamp": "2025-12-11T15:30:00Z",
    "requestId": "req-12345abc"
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_TOKEN` | 401 | JWT token is missing, invalid, or expired |
| `FORBIDDEN` | 403 | User does not have permission to perform this action |
| `INVALID_REQUEST` | 400 | Request body or parameters are invalid |
| `INVALID_ACTION_ID` | 400 | The provided actionId is not recognized |
| `RATE_LIMIT_EXCEEDED` | 429 | User has exceeded rate limit |
| `USER_NOT_FOUND` | 404 | The specified userId does not exist |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Database or Redis service is unavailable |

---

## Endpoint 1: Update Score

Updates a user's score based on a completed action. This is a secure endpoint that validates the action server-side and prevents unauthorized score manipulation.

### Request

```http
POST /api/scores
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
X-Idempotency-Key: optional-uuid-for-duplicate-prevention
```

**Request Body:**

```json
{
  "userId": "user-123",
  "actionId": "complete-quest"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | Unique identifier of the user (max 50 chars) |
| `actionId` | string | Yes | Action performed by user (max 100 chars) |

**Request Validation:**
- `userId` must match the user ID in the JWT token (token claim `sub`)
- `userId` must exist in the database
- `actionId` must be a defined action in the system with a configured point value
- Request must arrive within 1 minute of token issuance

### Response (Success)

**Status Code:** `200 OK`

```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "actionId": "complete-quest",
    "pointsEarned": 10,
    "newScore": 1250,
    "previousScore": 1240,
    "timestamp": "2025-12-11T15:30:45Z",
    "leaderboardPosition": 8
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | The user who earned points |
| `actionId` | string | The action that was completed |
| `pointsEarned` | integer | Points awarded for this action |
| `newScore` | integer | User's score after update |
| `previousScore` | integer | User's score before update |
| `timestamp` | ISO 8601 | When the score update was processed |
| `leaderboardPosition` | integer | Current rank in top 10 (null if outside top 10) |

### Response (Error Cases)

**401 Unauthorized - Missing/Invalid Token**

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "JWT token is missing or invalid",
    "statusCode": 401,
    "timestamp": "2025-12-11T15:30:00Z",
    "requestId": "req-12345abc"
  }
}
```

**400 Bad Request - Invalid actionId**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "INVALID_ACTION_ID",
    "message": "Action 'invalid-action' is not recognized. Valid actions: complete-quest, defeat-boss, collect-treasure",
    "statusCode": 400,
    "timestamp": "2025-12-11T15:30:00Z",
    "requestId": "req-12345abc"
  }
}
```

**400 Bad Request - User Mismatch**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "userId in request must match authenticated user",
    "statusCode": 400,
    "timestamp": "2025-12-11T15:30:00Z",
    "requestId": "req-12345abc"
  }
}
```

**404 Not Found - User Not Found**

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User 'user-456' not found in system",
    "statusCode": 404,
    "timestamp": "2025-12-11T15:30:00Z",
    "requestId": "req-12345abc"
  }
}
```

**429 Too Many Requests - Rate Limited**

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1702336800

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Max 10 requests per minute",
    "statusCode": 429,
    "timestamp": "2025-12-11T15:30:00Z",
    "requestId": "req-12345abc"
  }
}
```

### Implementation Notes

- **Server-Side Validation:** Point values are determined server-side based on actionId, not from client
- **Atomic Update:** Score update and leaderboard ranking happen atomically
- **Idempotency:** Use optional `X-Idempotency-Key` header to safely retry requests
- **Broadcast:** Upon success, a message is published to Redis Pub/Sub channel `leaderboard:updates` to notify all connected SSE clients
- **Latency Target:** p95 latency < 50ms

---

## Endpoint 2: Get Leaderboard

Retrieves the current top 10 users ranked by score. This endpoint is read-only and does not require authentication, allowing public access to the leaderboard.

### Request

```http
GET /api/leaderboard
Accept: application/json
```

**Query Parameters:** None

### Response (Success)

**Status Code:** `200 OK`

```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "rank": 1,
        "userId": "user-456",
        "username": "Legendary Player",
        "score": 5200,
        "position": "🥇 1st",
        "lastUpdateTime": "2025-12-11T15:28:30Z",
        "avatar": "https://cdn.example.com/avatars/user-456.png"
      },
      {
        "rank": 2,
        "userId": "user-789",
        "username": "Awesome Player",
        "score": 4950,
        "position": "🥈 2nd",
        "lastUpdateTime": "2025-12-11T15:25:15Z",
        "avatar": "https://cdn.example.com/avatars/user-789.png"
      },
      {
        "rank": 3,
        "userId": "user-123",
        "username": "Good Player",
        "score": 4750,
        "position": "🥉 3rd",
        "lastUpdateTime": "2025-12-11T15:30:45Z",
        "avatar": "https://cdn.example.com/avatars/user-123.png"
      },
      {
        "rank": 4,
        "userId": "user-234",
        "username": "Rising Star",
        "score": 4200,
        "position": "4th",
        "lastUpdateTime": "2025-12-11T15:29:00Z",
        "avatar": "https://cdn.example.com/avatars/user-234.png"
      },
      {
        "rank": 5,
        "userId": "user-567",
        "username": "Skilled Player",
        "score": 3800,
        "position": "5th",
        "lastUpdateTime": "2025-12-11T15:26:20Z",
        "avatar": "https://cdn.example.com/avatars/user-567.png"
      },
      {
        "rank": 6,
        "userId": "user-890",
        "username": "Steady Player",
        "score": 3500,
        "position": "6th",
        "lastUpdateTime": "2025-12-11T15:31:00Z",
        "avatar": "https://cdn.example.com/avatars/user-890.png"
      },
      {
        "rank": 7,
        "userId": "user-111",
        "username": "Consistent",
        "score": 3200,
        "position": "7th",
        "lastUpdateTime": "2025-12-11T15:22:45Z",
        "avatar": "https://cdn.example.com/avatars/user-111.png"
      },
      {
        "rank": 8,
        "userId": "user-222",
        "username": "Determined",
        "score": 2950,
        "position": "8th",
        "lastUpdateTime": "2025-12-11T15:30:15Z",
        "avatar": "https://cdn.example.com/avatars/user-222.png"
      },
      {
        "rank": 9,
        "userId": "user-333",
        "username": "Ambitious",
        "score": 2700,
        "position": "9th",
        "lastUpdateTime": "2025-12-11T15:27:30Z",
        "avatar": "https://cdn.example.com/avatars/user-333.png"
      },
      {
        "rank": 10,
        "userId": "user-444",
        "username": "Challenger",
        "score": 2500,
        "position": "10th",
        "lastUpdateTime": "2025-12-11T15:29:45Z",
        "avatar": "https://cdn.example.com/avatars/user-444.png"
      }
    ],
    "fetchedAt": "2025-12-11T15:31:30Z",
    "cacheStatus": "HIT"
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `leaderboard` | array | Array of top 10 ranked users |
| `rank` | integer | Ranking position (1-10) |
| `userId` | string | Unique user identifier |
| `username` | string | User's display name |
| `score` | integer | User's total score |
| `position` | string | Readable position with medal emoji |
| `lastUpdateTime` | ISO 8601 | When this user's score was last updated |
| `avatar` | string | URL to user's avatar image |
| `fetchedAt` | ISO 8601 | When the leaderboard data was fetched |
| `cacheStatus` | string | "HIT" if from Redis cache, "MISS" if freshly computed |

### Response (Error Cases)

**503 Service Unavailable - Database/Redis Down**

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Leaderboard service is temporarily unavailable. Please try again in a few moments.",
    "statusCode": 503,
    "timestamp": "2025-12-11T15:30:00Z",
    "requestId": "req-12345abc"
  }
}
```

### Implementation Notes

- **No Authentication Required:** Public endpoint for displaying leaderboard
- **Redis Caching:** Results cached in Redis with TTL of 5 seconds
- **Sorted Sets:** Uses Redis ZREVRANGE for O(log N + M) performance where M=10
- **Hydration:** User metadata (username, avatar) loaded from PostgreSQL if not in Redis cache
- **Latency Target:** p95 latency < 10ms (cached), < 100ms (cache miss)
- **Cache Headers:** Responds with Cache-Control headers for browser caching
  ```
  Cache-Control: public, max-age=5
  ETag: W/"6b86b273"
  ```

---

## Endpoint 3: Real-Time Leaderboard Stream

Server-Sent Events (SSE) endpoint that streams real-time leaderboard updates to connected clients. Clients remain connected and receive messages whenever the top 10 changes.

### Request

```http
GET /api/leaderboard/stream
Accept: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Connection Parameters:**
- Keep-alive timeout: 60 seconds (server sends heartbeat)
- Reconnection timeout: 5 seconds (if connection dropped)
- Max concurrent connections per user: 1

### Response Headers

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Transfer-Encoding: chunked
X-Accel-Buffering: no
```

### Event Format

The stream uses the Server-Sent Events protocol with several event types:

#### 1. Initial Snapshot (on connection)

```
event: snapshot
data: {"type":"snapshot","leaderboard":[{"rank":1,"userId":"user-456","username":"Legendary Player","score":5200},{"rank":2,"userId":"user-789","username":"Awesome Player","score":4950}]}

```

#### 2. Score Update

```
event: update
data: {"type":"update","userId":"user-123","newScore":4760,"rank":3,"previousRank":5,"pointsEarned":10}

```

#### 3. Rank Change

```
event: rank-change
data: {"type":"rank-change","userId":"user-234","oldRank":11,"newRank":10,"score":4200,"enteredTop10":true}

```

#### 4. Position Swap

```
event: position-swap
data: {"type":"position-swap","user1Id":"user-456","user1NewRank":2,"user2Id":"user-789","user2NewRank":1}

```

#### 5. Heartbeat (keep-alive)

```
event: heartbeat
data: {"timestamp":"2025-12-11T15:31:30Z"}

```

#### 6. Server Message

```
event: message
data: {"type":"message","level":"info","text":"Leaderboard updated"}

```

### Event Payload Details

**Score Update Event:**

```json
{
  "type": "update",
  "userId": "user-123",
  "newScore": 4760,
  "previousScore": 4750,
  "pointsEarned": 10,
  "rank": 3,
  "previousRank": 3,
  "timestamp": "2025-12-11T15:30:45Z",
  "actionId": "complete-quest"
}
```

**Rank Change Event:**

```json
{
  "type": "rank-change",
  "userId": "user-234",
  "oldRank": 11,
  "newRank": 10,
  "score": 4200,
  "enteredTop10": true,
  "exitedTop10": false,
  "timestamp": "2025-12-11T15:32:00Z"
}
```

**Initial Snapshot Event:**

```json
{
  "type": "snapshot",
  "leaderboard": [
    {
      "rank": 1,
      "userId": "user-456",
      "username": "Legendary Player",
      "score": 5200,
      "avatar": "https://cdn.example.com/avatars/user-456.png"
    },
    {
      "rank": 2,
      "userId": "user-789",
      "username": "Awesome Player",
      "score": 4950,
      "avatar": "https://cdn.example.com/avatars/user-789.png"
    }
  ],
  "timestamp": "2025-12-11T15:31:30Z"
}
```

### Client Implementation Example

```javascript
// Connect to SSE stream
const eventSource = new EventSource('/api/leaderboard/stream');

// Handle initial snapshot
eventSource.addEventListener('snapshot', (event) => {
  const data = JSON.parse(event.data);
  console.log('Leaderboard snapshot:', data.leaderboard);
  updateUI(data.leaderboard);
});

// Handle score updates
eventSource.addEventListener('update', (event) => {
  const data = JSON.parse(event.data);
  console.log(`${data.userId} scored ${data.pointsEarned} points`);
  updatePlayerRow(data);
});

// Handle rank changes
eventSource.addEventListener('rank-change', (event) => {
  const data = JSON.parse(event.data);
  console.log(`${data.userId} moved to rank ${data.newRank}`);
  animateRankChange(data);
});

// Handle heartbeat
eventSource.addEventListener('heartbeat', (event) => {
  console.log('Connection alive:', event.data);
});

// Handle errors
eventSource.addEventListener('error', (event) => {
  if (event.readyState === EventSource.CLOSED) {
    console.log('SSE connection closed');
    // Attempt reconnection
    setTimeout(() => {
      location.reload(); // or implement exponential backoff
    }, 5000);
  }
});
```

### Implementation Notes

- **Redis Pub/Sub:** Listens on channel `leaderboard:updates` for score change events
- **Persistence:** Maintains in-memory set of connected client IDs for cleanup
- **Heartbeat:** Sends heartbeat every 30 seconds to detect dead connections
- **Broadcast:** Changes only broadcast if top 10 is affected (filtered at publish time)
- **Connection Limits:** Max 1 connection per user to prevent duplicate streams
- **Memory Efficient:** Uses Redis as message broker rather than in-memory queue
- **Graceful Shutdown:** Flushes pending events and closes connections on server restart

### Stream Termination

The stream closes in the following scenarios:

1. **Client Closes Connection** - Normal disconnect (browser closed, page navigated)
2. **Inactivity Timeout** - No activity for 5 minutes (connection kept with heartbeats)
3. **Server Shutdown** - Clean disconnect with final message
4. **Invalid User** - User deleted or banned during stream

**Reconnection Strategy:**

Clients should implement exponential backoff:
- 1st attempt: 1 second
- 2nd attempt: 2 seconds
- 3rd attempt: 4 seconds
- 4th+ attempts: 30 seconds (max)

---

## Complete Example: Score Update Flow

This example demonstrates the complete flow from score update to real-time broadcast.

### 1. Client Score Update Request

```javascript
// Client-side code
const token = localStorage.getItem('jwt_token');
const response = await fetch('/api/scores', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Idempotency-Key': generateUUID()
  },
  body: JSON.stringify({
    userId: 'user-123',
    actionId: 'complete-quest'
  })
});

const result = await response.json();
console.log('Score updated:', result.data);
```

### 2. Server Processing

```
1. Validate JWT token (extract userId, check expiry)
2. Validate userId matches token claim
3. Validate actionId is in allowed list
4. Look up points for actionId in PostgreSQL
5. Update user score atomically in Redis (ZINCRBY)
6. Update score in PostgreSQL (Prisma)
7. Fetch new rank from Redis (ZREVRANK)
8. Publish update event to Redis channel: leaderboard:updates
9. Return response with new score and rank
```

### 3. Real-Time Broadcast

```
1. All SSE clients listening to /api/leaderboard/stream receive:
   - Event type: "update"
   - Payload: { userId, newScore, rank, pointsEarned, timestamp }

2. If rank changed (entered/exited top 10):
   - Additional event type: "rank-change"
   - Payload: { userId, oldRank, newRank, enteredTop10 }

3. UI updates automatically without page refresh
```

### 4. Leaderboard Read

```
1. Client calls GET /api/leaderboard (or from initial SSE snapshot)
2. Server checks Redis cache (key: "leaderboard:top10")
3. If cache hit (TTL 5s):
   - Return immediately with cacheStatus: "HIT"
4. If cache miss:
   - Query PostgreSQL with LIMIT 10 ORDER BY score DESC
   - Enrich with user metadata
   - Cache result in Redis for 5 seconds
   - Return with cacheStatus: "MISS"
```

---

## HTTP Status Codes Reference

| Code | Meaning | When Used |
|------|---------|-----------|
| `200 OK` | Request succeeded | All successful requests |
| `400 Bad Request` | Invalid request format/params | Malformed JSON, invalid actionId, etc. |
| `401 Unauthorized` | Missing/invalid auth | Invalid JWT token, token expired |
| `403 Forbidden` | Authenticated but not authorized | User trying to update another user's score |
| `404 Not Found` | Resource not found | userId doesn't exist |
| `429 Too Many Requests` | Rate limit exceeded | User exceeded quota |
| `500 Internal Server Error` | Unexpected error | Unhandled exceptions |
| `503 Service Unavailable` | Service down | DB/Redis unavailable |

---

## Security Considerations

### Token Validation

Every POST request to `/api/scores` must include a valid JWT token:

```
Authorization: Bearer <token>
```

The token must:
- Be properly signed with the server's secret key
- Not be expired (check `exp` claim)
- Have correct audience (check `aud` claim equals "scoreboard-api")
- Contain user ID in `sub` claim

### Request Validation

All inputs are validated using Zod schemas:

```typescript
// Pseudo-code
const scoreUpdateSchema = z.object({
  userId: z.string().max(50),
  actionId: z.string().max(100)
});

const validated = scoreUpdateSchema.parse(requestBody);
```

### Server-Side Scoring

**Critical:** Point values are NEVER taken from client input.

```typescript
// Always look up points server-side
const points = ACTION_POINTS[actionId]; // Pre-configured in server
user.score += points;
```

### Rate Limiting

Uses Redis for distributed rate limiting:

```
Key: "rate_limit:{userId}:{endpoint}"
Value: request count
TTL: 60 seconds for /api/scores
```

When limit reached (e.g., > 10 for /api/scores):
- Return 429 Too Many Requests
- Include X-RateLimit-* headers
- Log attempt for security audit

### SQL Injection Prevention

All database queries use Prisma's parameterized queries:

```typescript
// Safe - parameterized
await prisma.user.findUnique({ where: { id: userId } });

// NEVER use raw SQL without parameterization
```

---

## Monitoring and Observability

### Key Metrics to Monitor

- **Request Rate** - Requests per second for each endpoint
- **Latency** - p50, p95, p99 response times
- **Error Rate** - Percentage of failed requests (5xx, 4xx)
- **Active SSE Connections** - Current count of open streams
- **Cache Hit Rate** - Percentage of cache hits for /api/leaderboard
- **Token Validation Rate** - Authentication success/failure ratio

### Suggested CloudWatch Alarms

```
- Alert if error rate > 5% for 5 minutes
- Alert if p95 latency > 500ms
- Alert if SSE connections > 8000 per instance
- Alert if cache hit rate < 80%
- Alert if Redis connection pool > 80% utilization
```

### Logging

Recommended fields for each request:

```json
{
  "timestamp": "2025-12-11T15:30:45Z",
  "requestId": "req-12345abc",
  "method": "POST",
  "path": "/api/scores",
  "statusCode": 200,
  "durationMs": 45,
  "userId": "user-123",
  "actionId": "complete-quest",
  "cacheStatus": "HIT"
}
```

---

## Deployment Checklist

Before deploying to production:

- [ ] JWT secret key configured in AWS Secrets Manager
- [ ] Database migrations applied
- [ ] Redis cluster running with replication
- [ ] Rate limiting configuration deployed
- [ ] CloudWatch alarms configured
- [ ] SSL/TLS certificates installed
- [ ] CORS headers properly configured
- [ ] Request logging enabled
- [ ] Error tracking (Sentry/similar) configured
- [ ] Load tests passed (100 updates/sec, 10K concurrent SSE)
- [ ] Security audit completed
- [ ] Documentation reviewed by team

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-11 | Initial specification |

---

**Document Status:** Production Ready
**Last Updated:** 2025-12-11
**Maintained By:** Backend Engineering Team
