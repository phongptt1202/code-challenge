# Real-Time Scoreboard API

> Production-ready specification for a real-time leaderboard system with live score updates

## Overview

This module provides a real-time scoreboard system that displays the top 10 users by score with live updates. Users complete actions to earn points, and all connected clients see changes instantly without page refresh.

### Core Features

✅ **Real-time updates** - Live scoreboard using Server-Sent Events (SSE)
✅ **Top 10 leaderboard** - Fast ranking with Redis sorted sets
✅ **Secure scoring** - JWT authentication + rate limiting + server-side validation
✅ **Scalable architecture** - Handles 100-10K concurrent users, 10-100 updates/sec
✅ **Production-ready** - Complete AWS deployment specification

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev

# Run tests
npm test
```

## Documentation Structure

This specification is organized into focused documents for easy navigation:

### 📋 Core Documentation

1. **[API Specification](docs/api-specification.md)** - Complete API reference
   - Endpoints (POST /api/scores, GET /api/leaderboard, SSE stream)
   - Request/response schemas
   - Error codes and handling
   - Authentication requirements

2. **[Architecture & Flows](docs/architecture.md)** - System design and diagrams
   - High-level architecture diagram
   - Technology stack and rationale
   - Execution flow diagrams (Mermaid)
   - Architecture patterns and decisions

3. **[Database Schema](docs/database-schema.md)** - Data models and storage
   - PostgreSQL table definitions
   - Redis data structures
   - Indexes and optimization
   - Sample queries

4. **[Security Implementation](docs/security.md)** - Authentication and protection
   - JWT validation middleware
   - Rate limiting implementation
   - Input validation (Zod schemas)
   - Anti-cheat measures
   - Code examples

5. **[Deployment Guide](docs/deployment.md)** - AWS infrastructure and setup
   - AWS architecture (ECS, RDS, ElastiCache)
   - Environment configuration
   - Scaling strategy
   - Monitoring and observability
   - Troubleshooting

6. **[Improvements & Future Work](docs/improvements.md)** - Enhancement roadmap
   - Immediate improvements (Phase 1)
   - Medium-term enhancements (Phase 2)
   - Long-term scaling (Phase 3)
   - Performance optimization tips

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js 20.x LTS | JavaScript runtime |
| Language | TypeScript 5.x | Type-safe development |
| Framework | Express.js 4.18.x | REST API framework |
| Database | PostgreSQL 15.x | Persistent storage |
| Cache | Redis 7.0.x | Leaderboard + Pub/Sub |
| ORM | Prisma 5.x | Database access |
| Auth | jsonwebtoken 9.x | JWT validation |
| Validation | Zod 3.x | Input validation |
| Cloud | AWS | ECS, RDS, ElastiCache |

## Architecture at a Glance

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Client    │────────▶│   API Server     │────────▶│ PostgreSQL  │
│  (Browser)  │  POST   │   (Node.js)      │  Write  │   (RDS)     │
└─────────────┘         └──────────────────┘         └─────────────┘
       │                        │                            │
       │ SSE                    │ Pub/Sub                    │
       │ Stream                 │                            │
       │                 ┌──────▼──────┐                     │
       └─────────────────│    Redis    │◀────────────────────┘
                         │ (Cache +    │         Read
                         │  Pub/Sub)   │
                         └─────────────┘
```

**Key Design Decisions:**
- **Monolithic REST API** - Simple deployment, sufficient for medium scale
- **Redis Sorted Sets** - O(log N) performance for leaderboard operations
- **Server-Sent Events** - One-way streaming, simpler than WebSockets
- **Redis Pub/Sub** - Broadcast updates across multiple server instances
- **JWT Authentication** - Stateless, secure token validation

## API Endpoints Summary

### 1. Update Score
```http
POST /api/scores
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "actionId": "complete-quest",
  "userId": "user-123"
}
```

### 2. Get Leaderboard
```http
GET /api/leaderboard
```

### 3. Real-Time Stream
```http
GET /api/leaderboard/stream
Accept: text/event-stream
```

👉 **[Full API documentation →](docs/api-specification.md)**

## Security Features

- ✅ **JWT Authentication** - All score updates require valid tokens
- ✅ **Rate Limiting** - Max 10 updates/min per user
- ✅ **Input Validation** - Zod schemas validate all requests
- ✅ **Server-Side Scoring** - Never trust client-provided scores
- ✅ **SQL Injection Prevention** - Prisma parameterized queries
- ✅ **Secrets Management** - AWS Secrets Manager integration

👉 **[Full security guide →](docs/security.md)**

## Performance Characteristics

**Latency:**
- Score update: < 50ms (p95)
- Leaderboard query: < 10ms (Redis cache)
- SSE broadcast: < 100ms to all clients

**Capacity:**
- 10,000 concurrent SSE connections per instance
- 100 score updates per second
- Redis handles 100K+ ops/sec

**Scalability:**
- Horizontal: Add more ECS tasks (auto-scaling)
- Database: Read replicas for queries
- Redis: Cluster mode for higher throughput

## Development Workflow

```bash
# Start local services (PostgreSQL + Redis)
docker-compose up -d

# Run migrations
npx prisma migrate dev

# Start dev server with hot reload
npm run dev

# Run tests
npm test                    # Unit + integration tests
npm run test:e2e           # End-to-end tests
npm run test:load          # Load testing

# Lint and format
npm run lint
npm run format

# Build for production
npm run build
```

## Project Structure

```
src/problem6/
├── README.md                   # This file
├── docs/                       # Detailed documentation
│   ├── api-specification.md
│   ├── architecture.md
│   ├── database-schema.md
│   ├── security.md
│   ├── deployment.md
│   └── improvements.md
├── src/
│   ├── routes/                # Express routes
│   ├── controllers/           # Request handlers
│   ├── services/              # Business logic
│   ├── repositories/          # Database access
│   ├── middleware/            # Auth, validation, etc.
│   ├── models/                # Prisma models
│   └── utils/                 # Helpers
├── tests/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── infrastructure/            # Terraform/IaC
└── package.json
```

## Testing Strategy

- **Unit Tests** - Service logic, repositories, utilities
- **Integration Tests** - API endpoints with test DB
- **E2E Tests** - Full workflows including SSE
- **Load Tests** - 10K concurrent connections, 100 updates/sec

**Coverage Target:** 80%+ for critical paths (score updates, leaderboard ranking)

## Deployment

Production deployment to AWS:

```bash
# Build Docker image
docker build -t scoreboard-api .

# Push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin <ecr-url>
docker push <ecr-url>/scoreboard-api:latest

# Deploy infrastructure
cd infrastructure
terraform apply

# Run migrations
npm run migrate:deploy
```

👉 **[Full deployment guide →](docs/deployment.md)**

## Monitoring

**Key Metrics:**
- Request rate and latency (CloudWatch)
- Active SSE connections
- Score update throughput
- Redis cache hit rate
- Database connection pool

**Alarms:**
- Error rate > 5% for 5 minutes
- P95 latency > 500ms
- Database connections > 80%

## Contributing

1. Read the [Architecture documentation](docs/architecture.md)
2. Review [Security requirements](docs/security.md)
3. Follow the coding standards (TypeScript, ESLint, Prettier)
4. Write tests for new features
5. Update relevant documentation

## License

[Your License Here]

## Support

For questions or issues:
- Review the [Troubleshooting section](docs/deployment.md#troubleshooting)
- Check the [Improvements document](docs/improvements.md) for known limitations
- Contact the backend engineering team

