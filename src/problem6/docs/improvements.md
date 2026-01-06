# Improvements and Future Enhancements

> Comprehensive roadmap for scaling, optimizing, and extending the Real-Time Scoreboard API

**Document Version:** 1.0
**Last Updated:** 2025-12-11
**Priority Levels:** P0 (Critical), P1 (High), P2 (Medium), P3 (Low)

---

## Executive Summary

This document outlines a strategic roadmap for improving the Real-Time Scoreboard API across three implementation phases:

- **Phase 1 (Immediate):** Foundation stability and core optimizations (1-2 sprints)
- **Phase 2 (Medium-term):** Feature expansion and advanced capabilities (2-4 sprints)
- **Phase 3 (Long-term):** Enterprise-scale architecture and next-generation features (4+ sprints)

Total estimated effort: 3-4 months for full implementation. Each phase can be deployed independently.

---

## Phase 1: Immediate Improvements (1-2 Sprints)

### Priority: P0 - Critical Foundation

These improvements ensure production stability, data integrity, and foundational scalability.

#### 1.1 Idempotency for Score Updates (P0)

**Problem:** Duplicate score submissions from network retries or client errors can result in inflated scores.

**Solution:** Implement idempotent score updates with request deduplication.

**Impact:** Prevents score inflation; critical for fair competition.

**Implementation:**

```typescript
// Add idempotency key tracking
interface ScoreUpdate {
  idempotencyKey: string; // UUID from client
  userId: string;
  actionId: string;
  timestamp: number;
}

// Database schema addition
model ScoreAudit {
  id String @id
  idempotencyKey String @unique // Prevents duplicates
  userId String
  actionId String
  score Int
  processedAt DateTime @default(now())
  status String // 'pending', 'completed', 'failed'
}
```

**Testing:** Add idempotency tests with duplicate submissions.

**Effort:** 2-3 days

---

#### 1.2 Database Denormalization (P0)

**Problem:** Current schema requires JOINs to retrieve score data, reducing query performance.

**Solution:** Denormalize frequently accessed data in Redis and PostgreSQL.

**Impact:** Reduce p99 latency from ~100ms to <10ms for leaderboard queries.

**Implementation:**

```sql
-- Add denormalized leaderboard table
CREATE TABLE LeaderboardCache (
  id SERIAL PRIMARY KEY,
  userId VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  score INT NOT NULL,
  rank INT NOT NULL,
  lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rank (rank),
  INDEX idx_score (score DESC)
);

-- Update trigger for automatic cache refresh
CREATE OR REPLACE FUNCTION update_leaderboard_cache()
RETURNS TRIGGER AS $$
BEGIN
  -- Update cache when scores change
  UPDATE LeaderboardCache SET score = NEW.score WHERE userId = NEW.userId;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Cache Strategy:**
- TTL-based: 5-10 second refresh window
- Event-driven: Update on score changes
- Batch updates: Aggregate changes every 1 second

**Effort:** 3-4 days

---

#### 1.3 Connection Pool Optimization (P1)

**Problem:** Default connection pools may be insufficient for peak loads.

**Solution:** Implement dynamic connection pooling with monitoring.

**Implementation:**

```typescript
// Prisma connection pool configuration
const prisma = new PrismaClient({
  errorFormat: 'pretty',
  log: ['error', 'warn'],
});

// .env configuration
DATABASE_URL="postgresql://user:pass@localhost:5432/scoreboard?schema=public&connection_limit=20&pool_timeout=45"
REDIS_MAX_CONNECTIONS=50
REDIS_MIN_IDLE=10
```

**Monitoring:**
- Track active connections
- Alert on pool exhaustion (>90%)
- Auto-scale in AWS RDS

**Effort:** 2 days

---

#### 1.4 Graceful Shutdown & Connection Draining (P0)

**Problem:** Abrupt server termination can drop connections and lose in-flight requests.

**Solution:** Implement graceful shutdown with connection draining.

**Implementation:**

```typescript
// server.ts
const gracefulShutdown = async () => {
  console.log('🔴 Graceful shutdown initiated...');

  // Stop accepting new connections
  server.close();

  // Wait for in-flight requests (max 30 seconds)
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Close Redis connection
  await redis.quit();

  // Close database connection
  await prisma.$disconnect();

  console.log('✅ Graceful shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

**Testing:** Kill container during load test; verify no data loss.

**Effort:** 2 days

---

#### 1.5 Comprehensive Input Validation Enhancement (P0)

**Problem:** Current Zod schemas may miss edge cases (negative scores, overflow).

**Solution:** Expand validation to cover all security scenarios.

**Implementation:**

```typescript
// Enhanced Zod schemas
const ScoreUpdateSchema = z.object({
  idempotencyKey: z.string().uuid('Invalid idempotency key'),
  userId: z.string().min(1).max(255).regex(/^[\w-]+$/),
  actionId: z.string().min(1).max(255),
  timestamp: z.number().int().min(0).max(Date.now() + 5000), // Allow 5s clock skew
});

const RangeValidation = z.object({
  score: z.number().int().min(0).max(2147483647), // 32-bit int max
});
```

**Test Coverage:** 50+ test cases covering boundary conditions.

**Effort:** 2-3 days

---

#### 1.6 Enhanced Error Handling & Recovery (P1)

**Problem:** Partial failures during cascade operations aren't gracefully handled.

**Solution:** Implement transactional error recovery with circuit breakers.

**Implementation:**

```typescript
// Transactional score update with rollback
const updateScoreWithRecovery = async (userId: string, points: number) => {
  const tx = await prisma.$transaction(async (tx) => {
    // Update score
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { score: { increment: points } }
    });

    // Log audit trail
    await tx.scoreAudit.create({
      data: {
        userId,
        points,
        actionId: generateId(),
        status: 'completed'
      }
    });

    return updatedUser;
  }, {
    timeout: 10000,
    maxWait: 5000,
  });

  return tx;
};

// Circuit breaker for Redis
const redisCircuitBreaker = new CircuitBreaker(
  async (key, value) => redis.set(key, value),
  {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  }
);
```

**Effort:** 3-4 days

---

### Phase 1 Summary Table

| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| Idempotency Keys | P0 | 2-3d | Prevents score inflation | Implementation Ready |
| DB Denormalization | P0 | 3-4d | 10x latency improvement | Implementation Ready |
| Connection Pooling | P1 | 2d | Stability at scale | Implementation Ready |
| Graceful Shutdown | P0 | 2d | Zero-downtime deployments | Implementation Ready |
| Enhanced Validation | P0 | 2-3d | Reduced attack surface | Implementation Ready |
| Error Recovery | P1 | 3-4d | Improved reliability | Implementation Ready |
| **Phase 1 Total** | - | **14-19 days** | **Production-Ready** | - |

---

## Phase 2: Medium-Term Enhancements (2-4 Sprints)

### Priority: P1-P2 - Feature Expansion

These improvements add capabilities and operational visibility.

#### 2.1 Advanced Leaderboard Filtering (P2)

**Problem:** Only top 10 global leaderboard; no filtering by region, guild, or time period.

**Solution:** Multi-dimensional leaderboard queries with time-windowed rankings.

**Implementation:**

```typescript
// Leaderboard service enhancements
interface LeaderboardQuery {
  limit: number;
  offset: number;
  filterBy?: {
    region?: string;      // 'na', 'eu', 'apac'
    guild?: string;       // user's guild/team
    timeWindow?: string;  // 'daily', 'weekly', 'monthly', 'allTime'
    minScore?: number;
  };
}

// Redis sorted set organization
// top10:global
// top10:daily:2025-12-11
// top10:region:na
// top10:guild:{guildId}

const getFilteredLeaderboard = async (query: LeaderboardQuery) => {
  const key = buildLeaderboardKey(query);
  return redis.zrevrange(key, query.offset, query.offset + query.limit - 1);
};
```

**Backend Storage:**
- Use composite Redis keys for different dimensions
- Schedule daily snapshot generation
- Keep 7-day rolling window in PostgreSQL

**API Enhancement:**
```http
GET /api/leaderboard?limit=10&timeWindow=daily&region=na
GET /api/leaderboard?filterBy=guild&guildId=guild-123
GET /api/leaderboard?filterBy=region&region=eu&minScore=1000
```

**Database Changes:**
```sql
CREATE TABLE LeaderboardSnapshot (
  id SERIAL PRIMARY KEY,
  dimension VARCHAR(50),    -- 'global', 'region', 'guild', 'daily'
  dimensionValue VARCHAR(50), -- 'na', 'guild-123', etc
  rank INT,
  userId VARCHAR(255),
  score INT,
  snapshotDate DATE,
  INDEX idx_dimension (dimension, dimensionValue, snapshotDate)
);
```

**Effort:** 5-7 days

---

#### 2.2 User Achievement/Badge System (P2)

**Problem:** No progression/achievement system; limited player engagement.

**Solution:** Milestone-based achievements and badges.

**Implementation:**

```typescript
interface Achievement {
  id: string;
  name: string;
  description: string;
  condition: {
    type: 'score_threshold' | 'streak' | 'ranking';
    value: number;
  };
  reward?: {
    points: number;
    multiplier: number;
  };
}

// Database schema
model Achievement {
  id String @id
  userId String
  achievementId String
  earnedAt DateTime @default(now())
  unlockedAt DateTime?

  @@unique([userId, achievementId])
}

// Trigger to check achievements after score update
const checkAchievements = async (userId: string, newScore: number) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  const achievements = [
    { id: 'beginner', condition: newScore >= 100 },
    { id: 'novice', condition: newScore >= 500 },
    { id: 'expert', condition: newScore >= 5000 },
    { id: 'legend', condition: newScore >= 50000 },
  ];

  for (const achievement of achievements) {
    if (achievement.condition) {
      await unlockAchievement(userId, achievement.id);
      // Broadcast achievement event via SSE
      broadcastAchievement(userId, achievement.id);
    }
  }
};
```

**Frontend Integration:**
- Display badges on leaderboard
- Show achievement progress
- Celebrate milestones with animations

**Effort:** 5-6 days

---

#### 2.3 Real-Time User Statistics Dashboard (P2)

**Problem:** No visibility into individual player stats and trends.

**Solution:** Per-user statistics service with trend analysis.

**Implementation:**

```typescript
interface UserStats {
  userId: string;
  currentScore: number;
  rank: number;
  rankPercentile: number;

  // Daily stats
  dailyScore: number;
  dailyActions: number;
  dailyStreak: number;

  // Trend analysis
  weeklyTrend: 'up' | 'stable' | 'down';
  scoreVelocity: number; // points/day
  lastUpdateTime: string;

  // Achievements
  achievementCount: number;
  nextMilestone: string;
}

// Efficient computation
const computeUserStats = async (userId: string): Promise<UserStats> => {
  // Use Redis for real-time stats
  const rankData = await redis.zrevrank('leaderboard:global', userId);
  const scoreData = await redis.zscore('leaderboard:global', userId);

  // Aggregated stats
  const dailyScore = await getDailyScore(userId);
  const streak = await calculateStreak(userId);

  return {
    userId,
    currentScore: scoreData,
    rank: rankData + 1,
    // ... other stats
  };
};

// API Endpoint
app.get('/api/users/:userId/stats', async (req, res) => {
  const stats = await computeUserStats(req.params.userId);
  res.json(stats);
});
```

**Data Storage:**
- Real-time: Redis hashes for current stats
- Historical: PostgreSQL for trend analysis
- TTL: 5-minute cache for computed percentiles

**Effort:** 4-5 days

---

#### 2.4 Rate Limiting Enhancement (P1)

**Problem:** Current simple rate limit doesn't handle distributed scenarios or burst traffic.

**Solution:** Implement sliding window rate limiting with Redis.

**Implementation:**

```typescript
import RedisRateLimiter from 'redis-rate-limiter';

const rateLimiter = new RedisRateLimiter({
  redis: redisClient,
  window: 60000,      // 60 second window
  limit: 10,          // max 10 requests
  keyPrefix: 'rate:',
});

// Middleware
app.use(async (req, res, next) => {
  const key = `${req.user.id}:score-update`;
  const allowed = await rateLimiter.increment(key);

  if (!allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: await rateLimiter.getResetTime(key),
    });
  }

  next();
});

// Advanced: Per-action rate limiting
const actionLimits = {
  'complete-quest': { window: 60000, limit: 10 },
  'daily-bonus': { window: 86400000, limit: 1 },  // 24 hours
  'PvP-match': { window: 3600000, limit: 5 },     // 1 hour
};
```

**Monitoring:**
- Track limit violations
- Alert on sustained high rates
- Adaptive limits based on load

**Effort:** 2-3 days

---

#### 2.5 Comprehensive Audit Logging (P1)

**Problem:** Limited audit trail for regulatory compliance and debugging.

**Solution:** Structured audit logging for all score changes.

**Implementation:**

```typescript
interface AuditLog {
  id: string;
  timestamp: DateTime;
  userId: string;
  action: string;
  actionDetails: {
    points: number;
    reason: string;
    source: string;
  };
  result: 'success' | 'failure' | 'rejected';
  metadata: {
    ipAddress: string;
    userAgent: string;
    sessionId: string;
  };
}

// Write to both PostgreSQL and centralized logging
const logAudit = async (event: AuditLog) => {
  // Persistent audit trail
  await prisma.auditLog.create({
    data: event,
  });

  // Centralized logging (CloudWatch, ELK)
  logger.info('Score Update', {
    userId: event.userId,
    points: event.actionDetails.points,
    timestamp: event.timestamp,
    result: event.result,
  });
};

// Query audit logs
app.get('/api/admin/audit-logs', async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    where: {
      userId: req.query.userId,
      timestamp: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { timestamp: 'desc' },
    take: 1000,
  });

  res.json(logs);
});
```

**Retention Policy:**
- 90 days hot storage (PostgreSQL)
- 1 year cold storage (S3)
- Immutable audit log table

**Effort:** 3-4 days

---

#### 2.6 WebSocket Support for Live Notifications (P2)

**Problem:** SSE is one-way; bidirectional communication needed for real-time interactions.

**Solution:** Optional WebSocket layer for live chat, notifications, and actions.

**Implementation:**

```typescript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ server });

// Upgrade to WebSocket
wss.on('connection', (ws: WebSocket, req: Request) => {
  const userId = validateToken(req.headers.authorization);

  // Subscribe to user-specific updates
  const channel = `user:${userId}`;
  redis.subscribe(channel);

  redis.on('message', (ch, message) => {
    if (ch === channel) {
      ws.send(JSON.stringify({
        type: 'notification',
        data: JSON.parse(message),
        timestamp: new Date(),
      }));
    }
  });

  // Handle incoming messages (chat, actions)
  ws.on('message', async (data: Buffer) => {
    const message = JSON.parse(data.toString());

    if (message.type === 'action') {
      // Process user action
      await updateScore(userId, message.actionId);
    }
  });
});
```

**Benefits:**
- Lower latency than polling
- Bidirectional communication
- Real-time chat/notifications
- Maintains connection state

**Effort:** 4-5 days

---

### Phase 2 Summary Table

| Feature | Priority | Effort | Impact | Complexity |
|---------|----------|--------|--------|-----------|
| Advanced Filtering | P2 | 5-7d | Regional/Guild leaderboards | Medium |
| Achievements/Badges | P2 | 5-6d | Increased engagement | Medium |
| User Stats Dashboard | P2 | 4-5d | Player insights | Medium |
| Rate Limiting v2 | P1 | 2-3d | Distributed protection | Low |
| Audit Logging | P1 | 3-4d | Compliance ready | Low |
| WebSocket Support | P2 | 4-5d | Real-time interactions | High |
| **Phase 2 Total** | - | **23-30 days** | **Full Feature Set** | - |

---

## Phase 3: Long-Term Scaling (4+ Sprints)

### Priority: P2-P3 - Enterprise Features

These improvements support 100K+ concurrent users and advanced analytics.

#### 3.1 Microservices Architecture (P3)

**Problem:** Monolith becomes bottleneck at scale; hard to deploy independently.

**Solution:** Decompose into microservices for scoring, leaderboard, and notifications.

**Architecture:**

```
┌─────────────────────────────────────────────────────┐
│           API Gateway (Kong/Nginx)                  │
└─────────────┬───────────────────────────────────────┘
              │
    ┌─────────┼─────────┬──────────────┐
    │         │         │              │
┌───▼──┐  ┌──▼───┐  ┌──▼────┐  ┌─────▼─┐
│Score │  │Board │  │Notify │  │Auth   │
│Service   │Service   │Service   │Service│
└───┬──┘  └──┬───┘  └──┬────┘  └─────┬─┘
    │         │         │              │
    └─────────┼─────────┼──────────────┘
              │
        ┌─────▼─────────┐
        │ Message Queue │
        │ (RabbitMQ)    │
        └───────────────┘
```

**Services:**

1. **Score Service:** Score updates, validation
2. **Leaderboard Service:** Top 10, rankings, filtering
3. **Notification Service:** SSE, WebSocket, push
4. **Auth Service:** JWT validation, token generation
5. **Analytics Service:** Trends, statistics (Phase 3.2)

**Inter-Service Communication:**
- Event-driven via RabbitMQ/Kafka
- gRPC for low-latency sync calls
- Service mesh (Istio) for observability

**Effort:** 20+ days

---

#### 3.2 Analytics & Real-Time Data Pipeline (P3)

**Problem:** No real-time analytics on user behavior, scoring trends.

**Solution:** Stream analytics with aggregation and ML-ready data.

**Implementation:**

```typescript
// Event streaming
interface ScoreEvent {
  eventId: string;
  timestamp: DateTime;
  userId: string;
  actionId: string;
  points: number;
  region: string;
  metadata: Record<string, any>;
}

// Apache Kafka producer
const kafkaProducer = kafka.producer();

const publishScoreEvent = async (event: ScoreEvent) => {
  await kafkaProducer.send({
    topic: 'score-updates',
    messages: [
      {
        key: event.userId,
        value: JSON.stringify(event),
        timestamp: Date.now(),
      },
    ],
  });
};

// Real-time aggregation (Apache Flink / Spark Streaming)
// Compute: top 10, avg score, percentiles, daily trends

// Data warehouse (Redshift/BigQuery)
// Daily: User scores, actions, achievements
// Weekly: Trends, retention, churn
// Monthly: Cohort analysis
```

**Analytics Dashboard:**
```sql
-- User engagement
SELECT
  DATE(timestamp) as date,
  COUNT(DISTINCT userId) as active_users,
  SUM(points) as total_points,
  AVG(points) as avg_score
FROM score_events
GROUP BY DATE(timestamp);

-- Top actions
SELECT actionId, COUNT(*) as count
FROM score_events
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY actionId
ORDER BY count DESC;
```

**Effort:** 15-20 days

---

#### 3.3 Multi-Region Deployment (P3)

**Problem:** Latency for users in distant regions; no failover.

**Solution:** Deploy to multiple AWS regions with smart routing.

**Architecture:**

```
┌─────────────────────────────────────────────┐
│     Global Load Balancer (Route53)          │
└──────────┬──────────────┬──────────────┬────┘
           │              │              │
      ┌────▼────┐   ┌─────▼────┐  ┌────▼────┐
      │ US East │   │ EU West  │  │ APAC    │
      │ Region  │   │ Region   │  │ Region  │
      └────┬────┘   └─────┬────┘  └────┬────┘
           │              │              │
      ┌────▼────┐   ┌─────▼────┐  ┌────▼────┐
      │RDS+Redis   │RDS+Redis    │RDS+Redis  │
      │(primary)   │(secondary)  │(secondary)│
      └─────────┘   └────────────┘  └────────┘
           │              │              │
           └──────────────┼──────────────┘
                  │
            ┌─────▼──────┐
            │Global Redis │
            │Cluster     │
            └────────────┘
```

**Implementation:**

1. **Database Replication:**
   - Primary: US-East (master)
   - Secondary: EU-West, APAC (read replicas)
   - Aurora Global Database for low latency

2. **Cache Strategy:**
   - Redis Cluster across regions
   - Cross-region replication
   - TTL-based consistency

3. **Smart Routing:**
   - Route53 geolocation policy
   - Latency-based routing
   - Failover to secondary region (RTO: 30s)

**Deployment Commands:**
```bash
# Deploy to US-East (primary)
terraform apply -var="region=us-east-1"

# Deploy to EU-West (secondary)
terraform apply -var="region=eu-west-1"

# Deploy to APAC (secondary)
terraform apply -var="region=ap-southeast-1"

# Configure cross-region replication
aws rds create-db-instance-read-replica \
  --db-instance-identifier scoreboard-eu-replica \
  --source-db-instance-identifier scoreboard-us-primary \
  --db-instance-class db.r6i.xlarge \
  --source-region us-east-1
```

**Effort:** 15-20 days

---

#### 3.4 Advanced Caching Strategies (P2)

**Problem:** Cache invalidation is hard; stale data issues.

**Solution:** Implement cache-aside pattern with write-through for critical data.

**Implementation:**

```typescript
// Multi-level caching
class CacheManager {
  private l1Cache = new Map(); // In-memory
  private l2Cache = redis;      // Redis
  private db = prisma;          // PostgreSQL

  async get<T>(key: string, fetcher: () => Promise<T>, ttl: number = 300): Promise<T> {
    // L1: Memory cache (very fast, single-instance)
    if (this.l1Cache.has(key)) {
      return this.l1Cache.get(key).value;
    }

    // L2: Redis (fast, distributed)
    const cached = await this.l2Cache.get(key);
    if (cached) {
      const value = JSON.parse(cached);
      this.l1Cache.set(key, { value, expires: Date.now() + ttl * 1000 });
      return value;
    }

    // L3: Database (slow, source of truth)
    const value = await fetcher();

    // Populate caches
    await this.l2Cache.setex(key, ttl, JSON.stringify(value));
    this.l1Cache.set(key, { value, expires: Date.now() + ttl * 1000 });

    return value;
  }

  // Write-through: update all caches on write
  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    // Write to DB first
    await this.db.updateData(key, value);

    // Update caches
    await this.l2Cache.setex(key, ttl, JSON.stringify(value));
    this.l1Cache.set(key, { value, expires: Date.now() + ttl * 1000 });
  }

  // Invalidation
  async invalidate(key: string): Promise<void> {
    this.l1Cache.delete(key);
    await this.l2Cache.del(key);
  }
}

// Usage
const leaderboard = await cache.get(
  'leaderboard:top10',
  () => getTop10FromDB(),
  5 // 5 second TTL
);
```

**Cache Invalidation Patterns:**
- **TTL-based:** Automatic expiry (fast, may be stale)
- **Event-driven:** Invalidate on updates (consistent, complex)
- **Hybrid:** TTL + event invalidation (best for most cases)

**Effort:** 3-5 days

---

#### 3.5 Database Sharding (P3)

**Problem:** PostgreSQL becomes bottleneck with 1M+ users.

**Solution:** Horizontal sharding by user ID range.

**Implementation:**

```typescript
// Shard key: userId
// Shard count: 16 (power of 2)
const getShardKey = (userId: string): number => {
  const hash = parseInt(userId.charCodeAt(0).toString(16), 16);
  return hash % 16; // 16 shards
};

// Database mapping
const shardConfigs = [
  { shard: 0, host: 'shard-0.db.amazonaws.com', range: '0-999999' },
  { shard: 1, host: 'shard-1.db.amazonaws.com', range: '1000000-1999999' },
  // ... 14 more shards
];

// Route queries to correct shard
const getShardClient = (userId: string) => {
  const shardId = getShardKey(userId);
  return prismaClients[shardId];
};

// Update score on correct shard
const updateScore = async (userId: string, points: number) => {
  const shard = getShardClient(userId);

  return shard.user.update({
    where: { id: userId },
    data: { score: { increment: points } },
  });
};
```

**Challenges:**
- Leaderboard queries span shards (need aggregation)
- User lookup requires shard-aware routing
- Data rebalancing is complex

**Leaderboard Solution:**
```typescript
// Aggregate top 10 from all shards
const getTopLeaderboard = async () => {
  const results = await Promise.all(
    prismaClients.map(client =>
      client.user.findMany({
        orderBy: { score: 'desc' },
        take: 10,
      })
    )
  );

  // Merge and re-rank
  const topGlobal = results
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return topGlobal;
};
```

**Effort:** 20-25 days

---

#### 3.6 Machine Learning Integration (P3)

**Problem:** No fraud detection; no personalization.

**Solution:** ML models for cheat detection and user engagement prediction.

**Implementation:**

```typescript
// Anomaly detection
interface UserBehavior {
  userId: string;
  avgScorePerAction: number;
  actionFrequency: number;
  scoreVelocity: number;
  lastAction: DateTime;
  suspicionScore: number; // 0-1
}

// Detect unusual patterns
const detectAnomalies = async (userId: string): Promise<boolean> => {
  const stats = await getUserStats(userId);

  // Rules-based anomalies
  const isAnomalous =
    stats.scoreVelocity > 100 ||  // > 100 points/min is suspicious
    stats.actionFrequency > 1000 || // > 1000 actions/min is bot-like
    stats.avgScorePerAction > getUserMedianScore(userId) * 10;

  if (isAnomalous) {
    // Send to ML model for confirmation
    const suspicionScore = await mlModel.predict({
      behavior: stats,
      historicalData: await getUserHistory(userId),
    });

    // Trigger alert if score > 0.8
    if (suspicionScore > 0.8) {
      await logFraudAlert(userId, suspicionScore);
      return true;
    }
  }

  return false;
};

// ML Model Training
const trainAnomalyDetector = async () => {
  const historicalData = await prisma.scoreAudit.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    },
  });

  // Prepare features
  const features = historicalData.map(record => ({
    scorePerAction: record.points,
    timeBetweenActions: record.timeDiff,
    hourOfDay: new Date(record.timestamp).getHours(),
    label: record.isFraud ? 1 : 0,
  }));

  // Train Isolation Forest or LSTM
  const model = await tf.train.isolationForest(features);

  // Save model
  await model.save('s3://models/anomaly-detector');
};
```

**Integration:**
- Call ML model on score updates
- Flag suspicious accounts for review
- Auto-suspend if suspicion > 0.95

**Effort:** 15-20 days

---

### Phase 3 Summary Table

| Feature | Priority | Effort | Impact | Complexity |
|---------|----------|--------|--------|-----------|
| Microservices | P3 | 20+d | Unlimited scale | Very High |
| Analytics | P3 | 15-20d | Business insights | High |
| Multi-Region | P3 | 15-20d | Global low latency | High |
| Advanced Caching | P2 | 3-5d | 10x throughput | Medium |
| DB Sharding | P3 | 20-25d | 10M+ users | Very High |
| ML Integration | P3 | 15-20d | Fraud protection | High |
| **Phase 3 Total** | - | **88-115 days** | **Enterprise Scale** | - |

---

## Performance Optimization Tips

### Current Bottlenecks & Solutions

#### 1. Leaderboard Query Optimization

**Current:** Full table scan with sorting

**Optimization:**
```sql
-- Add covering index
CREATE INDEX idx_leaderboard_score_id
ON users (score DESC, id)
INCLUDE (username);

-- Query becomes index-only scan
EXPLAIN ANALYZE
SELECT id, username, score FROM users
ORDER BY score DESC LIMIT 10;
```

**Expected Improvement:** 100ms → 5ms

---

#### 2. Redis Memory Optimization

**Problem:** Storing full user objects bloats memory.

**Solution:** Store only essential fields.

```typescript
// Before: ~500 bytes per user
const user = {
  id: 'user-123',
  username: 'john_doe',
  email: 'john@example.com',
  avatar: 'https://...',
  joinDate: '2025-01-01',
  score: 5000,
  // ... many more fields
};

// After: ~100 bytes per user
const leaderboardEntry = {
  u: 'john_doe',      // username
  s: 5000,           // score
  r: 1,              // rank
};

// Fetch full data from PostgreSQL if needed
const getFullUser = async (userId) => {
  const cached = await redis.hget('users', userId);
  if (cached) return JSON.parse(cached);

  const full = await prisma.user.findUnique({ where: { id: userId } });
  await redis.hset('users', userId, JSON.stringify(full));
  return full;
};
```

**Memory Savings:** 50-70%

---

#### 3. Connection Pooling Tuning

**PostgreSQL:**
```
# Optimal settings for 10K concurrent users
max_connections = 500
shared_buffers = 256MB
effective_cache_size = 2GB
work_mem = 25MB
maintenance_work_mem = 64MB
```

**Redis:**
```
# Clustering for higher throughput
cluster-enabled yes
cluster-node-timeout 15000
```

---

#### 4. Batch Processing

**Problem:** Update leaderboard rank individually (slow).

**Solution:** Batch rank updates every 1 second.

```typescript
class BatchLeaderboardUpdater {
  private queue: ScoreUpdate[] = [];
  private batchSize = 100;
  private flushInterval = 1000; // 1 second

  constructor() {
    setInterval(() => this.flush(), this.flushInterval);
  }

  add(update: ScoreUpdate) {
    this.queue.push(update);

    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  async flush() {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.batchSize);

    // Batch update Redis
    const multi = redis.multi();

    for (const update of batch) {
      multi.zadd('leaderboard:global', update.score, update.userId);
    }

    await multi.exec();

    // Publish single event instead of many
    await redis.publish('leaderboard-update', JSON.stringify({
      count: batch.length,
      timestamp: new Date(),
    }));
  }
}
```

**Performance Gain:** 1000 updates/sec → 10K updates/sec

---

#### 5. Query Result Caching

**Problem:** Repeated queries for same leaderboard.

**Solution:** Cache query results with smart TTL.

```typescript
const getLeaderboardCached = memoize(
  async (limit: number, offset: number) => {
    return redis.zrevrange('leaderboard:global', offset, offset + limit - 1);
  },
  {
    maxAge: 5000,          // 5 seconds
    resolver: (limit, offset) => `leaderboard:${limit}:${offset}`,
  }
);
```

---

#### 6. HTTP Compression

**Problem:** Large JSON responses consume bandwidth.

**Solution:** Enable gzip compression.

```typescript
import compression from 'compression';

app.use(compression({
  level: 6,                    // Balance speed/compression
  threshold: 1024,            // Only compress > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));
```

**Bandwidth Savings:** 70-80% on JSON payloads

---

#### 7. Database Query Optimization

**N+1 Query Problem:**

```typescript
// BAD: N+1 queries
const users = await prisma.user.findMany({ take: 10 });
for (const user of users) {
  user.achievements = await prisma.achievement.findMany({
    where: { userId: user.id },
  });
}

// GOOD: Single query with relations
const users = await prisma.user.findMany({
  take: 10,
  include: { achievements: true },
});
```

**Query Time:** 100ms → 10ms

---

#### 8. Load Testing & Monitoring

**Load Test Setup:**
```bash
# k6 load test script
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up
    { duration: '5m', target: 1000 },  // Stay at peak
    { duration: '2m', target: 0 },     // Ramp down
  ],
};

export default function () {
  const score = Math.floor(Math.random() * 100);
  const response = http.post('http://localhost:3000/api/scores', {
    actionId: 'quest-' + __VU,
    userId: 'user-' + __VU,
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 100ms': (r) => r.timings.duration < 100,
  });
}
```

**Run Load Test:**
```bash
k6 run loadtest.js
```

---

## Performance Benchmarks

### Target Metrics

| Metric | Current | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|---------|
| **Latency (p95)** | 100ms | 50ms | 20ms | 10ms |
| **Throughput** | 100 updates/sec | 500/sec | 5K/sec | 50K/sec |
| **Concurrent SSE** | 1K users | 5K users | 50K users | 100K users |
| **Leaderboard Query** | 50ms | 10ms | 5ms | 1ms |
| **Redis Ops/sec** | 50K | 150K | 500K | 1M |
| **Cost/user/month** | $0.05 | $0.04 | $0.03 | $0.02 |

---

## Implementation Roadmap

### Timeline

```
2025 Q4 (Phase 1):
  Dec: Idempotency, Denormalization, Connection Pooling
  Dec: Graceful Shutdown, Validation, Error Recovery

2026 Q1 (Phase 2):
  Jan: Advanced Filtering, Achievements
  Feb: User Stats, Rate Limiting v2, Audit Logging
  Mar: WebSocket Support

2026 Q2-Q3 (Phase 3):
  Apr-May: Microservices, Analytics, Multi-Region
  Jun-Jul: Sharding, ML Integration, Advanced Caching
```

### Resource Allocation

- **Phase 1:** 2-3 engineers, 2-3 weeks
- **Phase 2:** 3-4 engineers, 4-6 weeks
- **Phase 3:** 5-6 engineers, 16-20 weeks

---

## Risk Mitigation

### Potential Issues & Solutions

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Data loss during migration | Low | Critical | Backup before each phase, test on staging |
| Performance regression | Medium | High | Load test after each change, rollback plan |
| Service downtime | Low | Critical | Blue-green deployment, canary releases |
| Cache inconsistency | Medium | Medium | Event-driven invalidation, versioning |
| Shard rebalancing failure | Low | High | Plan sharding carefully, gradual rollout |

---

## Conclusion

This three-phase roadmap provides a clear path to scale the Real-Time Scoreboard API from 100 to 100K+ concurrent users while maintaining performance and reliability.

**Key Takeaways:**
- Phase 1 (2-3 weeks): Foundation stability
- Phase 2 (4-6 weeks): Feature completeness
- Phase 3 (16-20 weeks): Enterprise scale

Each phase can be deployed independently and provides measurable value.

---

**Document Version:** 1.0
**Last Updated:** 2025-12-11
**Author:** Architecture Team
**Review Cycle:** Quarterly
