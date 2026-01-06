# Deployment Guide: Real-Time Scoreboard API

> Comprehensive AWS deployment instructions and operational guidelines for the Real-Time Scoreboard system

**Document Version:** 1.0
**Last Updated:** 2025-12-11
**Audience:** DevOps Engineers, System Administrators, Infrastructure Team

---

## Table of Contents

1. [AWS Infrastructure Architecture](#aws-infrastructure-architecture)
2. [Environment Variables](#environment-variables)
3. [Local Development Setup](#local-development-setup)
4. [Production Deployment](#production-deployment)
5. [Scaling Configuration](#scaling-configuration)
6. [Monitoring and Observability](#monitoring-and-observability)
7. [Troubleshooting](#troubleshooting)
8. [Runbooks](#runbooks)

---

## AWS Infrastructure Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Account                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐                                            │
│  │   Route 53       │ (DNS Management)                           │
│  │  scoreboard.io   │                                            │
│  └────────┬─────────┘                                            │
│           │                                                       │
│  ┌────────▼──────────────────────────────────────────┐           │
│  │         CloudFront (CDN)                          │           │
│  │  Cache static assets, compress responses         │           │
│  └────────┬──────────────────────────────────────────┘           │
│           │                                                       │
│  ┌────────▼──────────────────────────────────────────┐           │
│  │    Application Load Balancer (ALB)                │           │
│  │    - Health checks                               │           │
│  │    - SSL/TLS termination                         │           │
│  │    - Sticky sessions (SSE connections)           │           │
│  └────────┬──────────────────────────────────────────┘           │
│           │                                                       │
│  ┌────────▼──────────────────────────────────────────┐           │
│  │   ECS Cluster (Auto-Scaling)                      │           │
│  │  ┌─────────────────────────────────────────┐     │           │
│  │  │ ECS Task 1 (Node.js API)                │     │           │
│  │  │ - CPU: 512, Memory: 1024                │     │           │
│  │  │ - Port: 3000                            │     │           │
│  │  └─────────────────────────────────────────┘     │           │
│  │  ┌─────────────────────────────────────────┐     │           │
│  │  │ ECS Task 2 (Node.js API)                │     │           │
│  │  │ - CPU: 512, Memory: 1024                │     │           │
│  │  └─────────────────────────────────────────┘     │           │
│  │  ... (N tasks based on load)                     │           │
│  └────────┬──────────────────────────────────────────┘           │
│           │                                                       │
│  ┌────────┼──────────────────────────────────────────┐           │
│  │        │         VPC (Private Subnets)           │           │
│  │        │                                          │           │
│  │  ┌─────▼─────┐  ┌──────────────┐  ┌───────────┐ │           │
│  │  │ RDS Multi │  │ ElastiCache  │  │   SNS/   │ │           │
│  │  │ AZ        │  │   Redis      │  │   SQS    │ │           │
│  │  │PostgreSQL │  │   Cluster    │  │ (Events) │ │           │
│  │  │ (Primary) │  │   (3 nodes)  │  │          │ │           │
│  │  └───────────┘  └──────────────┘  └───────────┘ │           │
│  │                                                  │           │
│  │  ┌──────────────┐  ┌──────────────────────────┐ │           │
│  │  │ RDS Read     │  │ Secrets Manager          │ │           │
│  │  │ Replicas     │  │ - DB credentials        │ │           │
│  │  │ (2x us-east) │  │ - JWT secrets           │ │           │
│  │  └──────────────┘  │ - API keys              │ │           │
│  │                    └──────────────────────────┘ │           │
│  └────────────────────────────────────────────────────┘           │
│           │                                                       │
│  ┌────────▼──────────────────────────────────────────┐           │
│  │    CloudWatch & Monitoring                        │           │
│  │    - Logs, Metrics, Alarms                       │           │
│  │    - Dashboard, Log Insights                     │           │
│  └────────────────────────────────────────────────────┘           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Details

#### 1. **Route 53 (DNS)**
- Primary domain: `scoreboard-api.example.com`
- Health checks for ALB endpoints
- Failover policy if primary region unavailable

#### 2. **CloudFront (CDN)**
- Distribution for static assets (UI)
- Cache policy: 1 hour for HTML, 24 hours for versioned assets
- Compress responses (Gzip, Brotli)
- WAF rules for basic attack prevention

#### 3. **Application Load Balancer (ALB)**
- Target group: ECS service
- Health check: `GET /health` (interval: 30s, timeout: 5s)
- SSL/TLS certificate from ACM (auto-renewal)
- Sticky sessions enabled (STICKINESS_TYPE: lb_cookie, duration: 1 day)
- Security group: Allow 443 (HTTPS), 80 (HTTP → HTTPS redirect)

#### 4. **ECS Cluster**
- Launch type: Fargate (serverless)
- Cluster name: `scoreboard-prod`
- VPC: Private subnets across 2 AZs
- Task definition:
  - Image: `{ECR_ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/scoreboard-api:latest`
  - CPU: 512 (0.5 vCPU)
  - Memory: 1024 MB
  - Port mappings: 3000 → 3000
  - Log driver: awslogs (CloudWatch)
  - Essential container: true

#### 5. **RDS PostgreSQL**
- Instance type: `db.t4g.large` (production)
- Multi-AZ deployment: Yes
- Storage: 100 GB, GP3, auto-scaling enabled
- Backups: Automated daily, 30-day retention
- Read replicas: 2 in different AZs
- Parameter group: `custom-postgres15`
  - `max_connections = 200` (for connection pooling)
  - `shared_preload_libraries = 'pg_stat_statements'` (query monitoring)
- Enhanced monitoring: 60-second granularity
- Deletion protection: Enabled

#### 6. **ElastiCache Redis**
- Engine version: 7.0.x
- Node type: `cache.r7g.large`
- Cluster mode: Disabled (single-shard, 3 replicas)
- Automatic failover: Enabled
- Backup: Daily snapshots, 30-day retention
- Parameter group: `default.redis7`
- Encryption:
  - In-transit: TLS enabled
  - At-rest: KMS encryption enabled
- Network: Private subnets, security group restricted to ECS

#### 7. **Secrets Manager**
- Stores credentials:
  - `scoreboard/db/password`
  - `scoreboard/jwt/secret`
  - `scoreboard/api/keys`
- Auto-rotation: 30 days
- Access policy: Restricted to ECS task role

#### 8. **CloudWatch Monitoring**
- Log groups:
  - `/ecs/scoreboard-prod` (application logs)
  - `/ecs/scoreboard-prod-access` (access logs)
- Metrics: Custom and standard ECS metrics
- Alarms: High error rate, latency, resource utilization
- Dashboard: Real-time performance visualization

---

## Environment Variables

### Structure by Environment

Environment variables are managed through multiple layers:

1. **Secrets Manager** (sensitive data)
2. **Parameter Store** (non-sensitive configuration)
3. **Task Definition** (environment-specific overrides)
4. **Local .env file** (development only)

### Complete Variable Reference

#### Database Configuration

```bash
# Database Connection
DATABASE_URL="postgresql://user:password@rds-endpoint:5432/scoreboard_db?schema=public"
DATABASE_REPLICA_URL="postgresql://user:password@read-replica:5432/scoreboard_db?schema=public"
DATABASE_POOL_MIN="5"
DATABASE_POOL_MAX="20"
DATABASE_IDLE_TIMEOUT="30000"  # milliseconds

# Prisma
PRISMA_SKIP_VALIDATION_WARNING="true"
```

#### Redis Configuration

```bash
# Redis Connection
REDIS_HOST="elasticache-endpoint.aws"
REDIS_PORT="6379"
REDIS_PASSWORD="<from-secrets-manager>"
REDIS_TLS_ENABLED="true"
REDIS_DB="0"
REDIS_POOL_MIN="2"
REDIS_POOL_MAX="50"

# Redis Keys
REDIS_KEY_LEADERBOARD="leaderboard:top10"
REDIS_KEY_SCORE_PREFIX="score:"
REDIS_KEY_RATE_LIMIT_PREFIX="ratelimit:"
REDIS_TTL_LEADERBOARD="3600"  # 1 hour
```

#### Authentication & Security

```bash
# JWT Configuration
JWT_SECRET="<from-secrets-manager>"
JWT_EXPIRY="24h"
JWT_ALGORITHM="HS256"

# Rate Limiting
RATE_LIMIT_WINDOW_MS="60000"     # 1 minute
RATE_LIMIT_MAX_REQUESTS="10"     # 10 updates/min per user

# CORS
CORS_ORIGIN="https://scoreboard.example.com"
CORS_CREDENTIALS="true"

# API Keys (for admin operations)
ADMIN_API_KEY="<from-secrets-manager>"
```

#### Application Configuration

```bash
# Server
NODE_ENV="production"
PORT="3000"
LOG_LEVEL="info"
LOG_FORMAT="json"  # Use JSON for CloudWatch Logs Insights

# Application
APP_NAME="scoreboard-api"
APP_VERSION="1.0.0"
API_BASE_PATH="/api"

# SSE Configuration
SSE_HEARTBEAT_INTERVAL="30000"  # 30 seconds
SSE_MAX_CLIENTS_PER_INSTANCE="10000"
SSE_MESSAGE_TIMEOUT="5000"       # milliseconds

# Timeouts
REQUEST_TIMEOUT="30000"
SHUTDOWN_GRACE_PERIOD="30000"
```

#### Monitoring & Observability

```bash
# CloudWatch
CLOUDWATCH_REGION="us-east-1"
CLOUDWATCH_NAMESPACE="Scoreboard/API"

# X-Ray Tracing
XRAY_ENABLED="true"
XRAY_CONTEXT_MISSING="LOG_ERROR"

# Application Performance Monitoring
APM_ENABLED="true"
APM_ENVIRONMENT="production"
APM_SERVICE_VERSION="1.0.0"
```

### Environment-Specific Values

#### Development (Local)

```bash
# .env.local
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scoreboard_dev
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
PORT=3000
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=dev-secret-key-not-for-production
```

#### Staging

```bash
# Secrets Manager: scoreboard/staging/*
NODE_ENV=staging
DATABASE_URL=postgresql://user:pass@staging-rds:5432/scoreboard_staging
REDIS_HOST=staging-elasticache.aws
PORT=3000
LOG_LEVEL=info
```

#### Production

```bash
# Secrets Manager: scoreboard/production/*
NODE_ENV=production
DATABASE_URL=<from-secrets-manager>
REDIS_HOST=prod-elasticache.aws
PORT=3000
LOG_LEVEL=info
CLOUDWATCH_ENABLED=true
XRAY_ENABLED=true
```

### AWS Systems Manager Parameter Store Setup

```bash
# Non-sensitive parameters (use Parameter Store)
aws ssm put-parameter \
  --name /scoreboard/prod/app/version \
  --value "1.0.0" \
  --type "String"

aws ssm put-parameter \
  --name /scoreboard/prod/app/log-level \
  --value "info" \
  --type "String"

# Sensitive parameters (use Secrets Manager)
aws secretsmanager create-secret \
  --name scoreboard/prod/db/password \
  --secret-string "$(openssl rand -base64 32)"

aws secretsmanager create-secret \
  --name scoreboard/prod/jwt/secret \
  --secret-string "$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
```

---

## Local Development Setup

### Prerequisites

- Node.js 20.x LTS
- Docker & Docker Compose
- PostgreSQL 15.x (or Docker)
- Redis 7.x (or Docker)
- npm or yarn
- AWS CLI v2 (for credential management)

### Step 1: Clone & Install Dependencies

```bash
# Clone repository
git clone <repository-url>
cd src/problem6

# Install dependencies
npm install

# Install dev dependencies
npm install --save-dev
```

### Step 2: Setup Local Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with local settings
cat > .env << EOF
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scoreboard_dev
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
PORT=3000
LOG_LEVEL=debug
JWT_SECRET=dev-secret-key-not-for-production
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_MAX_REQUESTS=100
EOF
```

### Step 3: Start Local Services

```bash
# Start PostgreSQL and Redis using Docker Compose
docker-compose up -d

# Verify services are running
docker-compose ps

# Output should show:
# - postgres    (port 5432)
# - redis       (port 6379)
```

### Step 4: Database Setup

```bash
# Create development database
npx prisma migrate dev --name init

# (Optional) Seed database with sample data
npx prisma db seed

# Verify migrations
npx prisma migrate status
```

### Step 5: Start Development Server

```bash
# With hot reload
npm run dev

# Output should show:
# ✓ Server running on http://localhost:3000
# ✓ Connected to PostgreSQL
# ✓ Connected to Redis
# ✓ Listening for SSE connections
```

### Step 6: Verify Setup

```bash
# Health check
curl http://localhost:3000/health

# Get leaderboard
curl http://localhost:3000/api/leaderboard

# Check logs
docker-compose logs -f postgres redis
```

### Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: scoreboard_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

---

## Production Deployment

### Step 1: Build Docker Image

```bash
# Build image locally
docker build \
  --tag scoreboard-api:1.0.0 \
  --build-arg NODE_ENV=production \
  .

# Verify image
docker images scoreboard-api

# Run locally to test
docker run -p 3000:3000 \
  --env NODE_ENV=production \
  scoreboard-api:1.0.0
```

### Step 2: Push to AWS ECR

```bash
# Get AWS credentials
aws configure

# Create ECR repository (one-time)
aws ecr create-repository \
  --repository-name scoreboard-api \
  --region us-east-1

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

# Tag image for ECR
docker tag scoreboard-api:1.0.0 \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/scoreboard-api:1.0.0

docker tag scoreboard-api:1.0.0 \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/scoreboard-api:latest

# Push to ECR
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/scoreboard-api:1.0.0
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/scoreboard-api:latest

# Verify push
aws ecr describe-images \
  --repository-name scoreboard-api \
  --region us-east-1
```

### Step 3: Create/Update Infrastructure

#### Option A: Using Terraform

```bash
cd infrastructure

# Initialize Terraform
terraform init

# Plan changes
terraform plan -out=tfplan

# Review plan output

# Apply changes
terraform apply tfplan

# Output AWS resource IDs
terraform output -json > outputs.json
```

#### Option B: Using AWS CloudFormation

```bash
# Validate template
aws cloudformation validate-template \
  --template-body file://infrastructure/cloudformation.yaml

# Create stack
aws cloudformation create-stack \
  --stack-name scoreboard-prod \
  --template-body file://infrastructure/cloudformation.yaml \
  --parameters \
      ParameterKey=EnvironmentName,ParameterValue=production \
      ParameterKey=ImageUri,ParameterValue=${ECR_IMAGE_URI}

# Monitor stack creation
aws cloudformation describe-stack-events \
  --stack-name scoreboard-prod \
  --query 'StackEvents[0:5]'

# Wait for completion
aws cloudformation wait stack-create-complete \
  --stack-name scoreboard-prod
```

### Step 4: Create ECS Task Definition

```bash
# Register task definition
aws ecs register-task-definition \
  --family scoreboard-api \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu 512 \
  --memory 1024 \
  --container-definitions file://ecs-task-definition.json \
  --execution-role-arn arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole \
  --task-role-arn arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskRole

# Output: Task definition ARN
# arn:aws:ecs:us-east-1:${AWS_ACCOUNT_ID}:task-definition/scoreboard-api:1
```

#### ECS Task Definition Template

```json
{
  "family": "scoreboard-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "scoreboard-api",
      "image": "${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/scoreboard-api:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:${AWS_ACCOUNT_ID}:secret:scoreboard/prod/db/url"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:${AWS_ACCOUNT_ID}:secret:scoreboard/prod/jwt/secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/scoreboard-prod",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ],
  "executionRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskRole"
}
```

### Step 5: Create ECS Service

```bash
# Create ECS service
aws ecs create-service \
  --cluster scoreboard-prod \
  --service-name scoreboard-api \
  --task-definition scoreboard-api:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-xxx,subnet-yyy],
    securityGroups=[sg-xxx],
    assignPublicIp=DISABLED
  }" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=scoreboard-api,containerPort=3000" \
  --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100"

# Output: Service ARN
# arn:aws:ecs:us-east-1:${AWS_ACCOUNT_ID}:service/scoreboard-prod/scoreboard-api
```

### Step 6: Run Database Migrations

```bash
# Execute migration task
aws ecs run-task \
  --cluster scoreboard-prod \
  --task-definition scoreboard-api:1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[subnet-xxx],
    securityGroups=[sg-xxx]
  }" \
  --overrides "{
    \"containerOverrides\": [{
      \"name\": \"scoreboard-api\",
      \"command\": [\"npm\", \"run\", \"migrate:deploy\"]
    }]
  }"

# Monitor migration task
aws ecs describe-tasks \
  --cluster scoreboard-prod \
  --tasks arn:aws:ecs:...

# Check logs
aws logs tail /ecs/scoreboard-prod --follow
```

### Step 7: Verify Deployment

```bash
# Get ECS service status
aws ecs describe-services \
  --cluster scoreboard-prod \
  --services scoreboard-api

# Check running tasks
aws ecs list-tasks \
  --cluster scoreboard-prod \
  --service-name scoreboard-api

# Get load balancer health
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:...

# Test API endpoint
curl -H "Authorization: Bearer <JWT_TOKEN>" \
  https://scoreboard-api.example.com/api/leaderboard

# Monitor real-time logs
aws logs tail /ecs/scoreboard-prod --follow
```

---

## Scaling Configuration

### Horizontal Scaling (ECS Auto-Scaling)

#### Setup Target Tracking

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/scoreboard-prod/scoreboard-api \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy (CPU-based)
aws application-autoscaling put-scaling-policy \
  --policy-name scoreboard-cpu-scaling \
  --service-namespace ecs \
  --resource-id service/scoreboard-prod/scoreboard-api \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration "{
    \"TargetValue\": 70.0,
    \"PredefinedMetricSpecification\": {
      \"PredefinedMetricType\": \"ECSServiceAverageCPUUtilization\"
    },
    \"ScaleOutCooldown\": 60,
    \"ScaleInCooldown\": 300
  }"

# Create scaling policy (Memory-based)
aws application-autoscaling put-scaling-policy \
  --policy-name scoreboard-memory-scaling \
  --service-namespace ecs \
  --resource-id service/scoreboard-prod/scoreboard-api \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration "{
    \"TargetValue\": 80.0,
    \"PredefinedMetricSpecification\": {
      \"PredefinedMetricType\": \"ECSServiceAverageMemoryUtilization\"
    },
    \"ScaleOutCooldown\": 60,
    \"ScaleInCooldown\": 300
  }"

# Create scaling policy (Custom: Request Count)
aws application-autoscaling put-scaling-policy \
  --policy-name scoreboard-request-scaling \
  --service-namespace ecs \
  --resource-id service/scoreboard-prod/scoreboard-api \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration "{
    \"TargetValue\": 1000.0,
    \"CustomizedMetricSpecification\": {
      \"MetricName\": \"RequestCountPerTarget\",
      \"Namespace\": \"AWS/ApplicationELB\",
      \"Statistic\": \"Sum\",
      \"Unit\": \"Count\"
    },
    \"ScaleOutCooldown\": 60,
    \"ScaleInCooldown\": 300
  }"
```

#### Scaling Thresholds

| Metric | Target | Min Tasks | Max Tasks | Scale-Out | Scale-In |
|--------|--------|-----------|-----------|-----------|----------|
| CPU    | 70%    | 2         | 10        | 60s       | 300s     |
| Memory | 80%    | 2         | 10        | 60s       | 300s     |
| Requests | 1000/min | 2     | 10        | 60s       | 300s     |

### Vertical Scaling (Task Size)

For increased per-instance performance:

```bash
# Update task definition with larger resources
aws ecs register-task-definition \
  --family scoreboard-api \
  --cpu 1024 \
  --memory 2048 \
  ... (other parameters)

# Update service to use new task definition
aws ecs update-service \
  --cluster scoreboard-prod \
  --service scoreboard-api \
  --task-definition scoreboard-api:2 \
  --force-new-deployment

# Monitor rollout
aws ecs describe-services \
  --cluster scoreboard-prod \
  --services scoreboard-api \
  --query 'services[0].deployments'
```

### Database Read Replicas

```bash
# Create read replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier scoreboard-db-read-1 \
  --source-db-instance-identifier scoreboard-db \
  --db-instance-class db.t4g.large

# Monitor replica
aws rds describe-db-instances \
  --db-instance-identifier scoreboard-db-read-1 \
  --query 'DBInstances[0].DBInstanceStatus'

# Configure application to use replica for reads
# Update DATABASE_REPLICA_URL environment variable
```

### Redis Cluster Mode

```bash
# Create Redis cluster (multi-shard)
aws elasticache create-replication-group \
  --replication-group-description "Production Redis Cluster" \
  --engine redis \
  --engine-version 7.0 \
  --cache-node-type cache.r7g.xlarge \
  --num-cache-clusters 3 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --replication-group-id scoreboard-redis-cluster

# Monitor cluster
aws elasticache describe-replication-groups \
  --replication-group-id scoreboard-redis-cluster
```

---

## Monitoring and Observability

### CloudWatch Metrics Setup

#### Application Metrics

```bash
# Create custom namespace
NAMESPACE="Scoreboard/API"

# Configure metric collection in application
# See src/monitoring/metrics.ts for implementation

# Key metrics to track:
# - scoreboard-api.requests.total (counter)
# - scoreboard-api.requests.duration (histogram, ms)
# - scoreboard-api.scores.updates (counter)
# - scoreboard-api.leaderboard.queries (counter)
# - scoreboard-api.sse.connections (gauge)
# - scoreboard-api.redis.operations (counter)
```

#### Metrics Dashboard

```bash
# Create CloudWatch Dashboard
aws cloudwatch put-dashboard \
  --dashboard-name scoreboard-prod \
  --dashboard-body file://monitoring/dashboard.json
```

Dashboard JSON template:

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ECS", "CPUUtilization", {"stat": "Average"}],
          ["AWS/ECS", "MemoryUtilization", {"stat": "Average"}],
          ["AWS/ApplicationELB", "TargetResponseTime", {"stat": "Average"}],
          ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", {"stat": "Sum"}],
          ["AWS/RDS", "CPUUtilization"],
          ["AWS/RDS", "DatabaseConnections"],
          ["AWS/ElastiCache", "CacheHits"],
          ["AWS/ElastiCache", "CacheMisses"]
        ],
        "period": 60,
        "stat": "Average",
        "region": "us-east-1",
        "title": "System Health Overview"
      }
    }
  ]
}
```

### CloudWatch Alarms

```bash
# ECS CPU Utilization
aws cloudwatch put-metric-alarm \
  --alarm-name scoreboard-ecs-cpu-high \
  --alarm-description "Alert when ECS CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:${AWS_ACCOUNT_ID}:scoreboard-alerts

# Application Error Rate
aws cloudwatch put-metric-alarm \
  --alarm-name scoreboard-error-rate-high \
  --alarm-description "Alert when error rate > 5%" \
  --metric-name ErrorRate \
  --namespace Scoreboard/API \
  --statistic Average \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:${AWS_ACCOUNT_ID}:scoreboard-alerts

# RDS Connection Pool
aws cloudwatch put-metric-alarm \
  --alarm-name scoreboard-db-connections-high \
  --alarm-description "Alert when DB connections > 150" \
  --metric-name DatabaseConnections \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 150 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:${AWS_ACCOUNT_ID}:scoreboard-alerts

# Redis Connection Pool
aws cloudwatch put-metric-alarm \
  --alarm-name scoreboard-redis-connections-high \
  --alarm-description "Alert when Redis connections > 400" \
  --metric-name ConnectionCount \
  --namespace AWS/ElastiCache \
  --statistic Average \
  --period 300 \
  --threshold 400 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:${AWS_ACCOUNT_ID}:scoreboard-alerts

# ALB Target Unhealthy
aws cloudwatch put-metric-alarm \
  --alarm-name scoreboard-alb-unhealthy-targets \
  --alarm-description "Alert when unhealthy targets > 0" \
  --metric-name UnHealthyHostCount \
  --namespace AWS/ApplicationELB \
  --statistic Sum \
  --period 60 \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:${AWS_ACCOUNT_ID}:scoreboard-alerts
```

### Log Aggregation (CloudWatch Logs Insights)

#### Common Queries

```sql
-- Top 10 slowest requests
fields @timestamp, @duration, method, path
| stats avg(@duration) as avg_duration by method, path
| sort avg_duration desc
| limit 10

-- Error rate by endpoint
fields @timestamp, method, path, @message
| filter @message like /error|exception|error_code/i
| stats count() as error_count by method, path
| sort error_count desc

-- Top 10 users by request volume
fields userId
| stats count() as request_count by userId
| sort request_count desc
| limit 10

-- SSE connection lifecycle
fields @timestamp, event_type, client_id
| filter event_type in ["sse_connected", "sse_disconnected"]
| stats count() as total_events by event_type, client_id

-- Database query performance
fields @timestamp, query_type, @duration
| filter @duration > 100
| stats avg(@duration) as avg_duration, max(@duration) as max_duration by query_type
```

### AWS X-Ray Tracing

```bash
# Enable X-Ray daemon in ECS
# Add to task definition:
{
  "name": "xray-daemon",
  "image": "public.ecr.aws/xray/aws-xray-daemon:latest",
  "cpu": 32,
  "memory": 256,
  "portMappings": [
    {
      "containerPort": 2000,
      "protocol": "udp"
    }
  ]
}

# Configure X-Ray in application
# - Initialize AWS SDK with X-Ray
# - Wrap HTTP clients and database connections
# - Track custom segments for business logic
```

### Application Performance Monitoring (APM)

```javascript
// Datadog integration (example)
const tracer = require('dd-trace').init({
  env: process.env.NODE_ENV,
  service: 'scoreboard-api',
  version: process.env.APP_VERSION,
  logInjection: true,
});

// Send custom metrics
tracer.gauge('scoreboard.sse_connections', activeConnections);
tracer.histogram('scoreboard.update_latency', duration);
```

---

## Troubleshooting

### Common Issues & Solutions

#### 1. High CPU Utilization

**Symptoms:**
- ECS tasks CPU > 80%
- Slow API responses
- Auto-scaling triggering frequently

**Investigation:**

```bash
# Check task CPU usage
aws ecs list-tasks --cluster scoreboard-prod --service-name scoreboard-api | \
  xargs -I {} aws ecs describe-tasks --cluster scoreboard-prod --tasks {} \
  --query 'tasks[].{TaskArn:taskArn,CPU:cpu,Memory:memory}'

# Check application logs for slow operations
aws logs tail /ecs/scoreboard-prod --follow | grep -E "SLOW|PERFORMANCE|ERROR"

# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

**Solutions:**
- Increase task CPU allocation (vertical scaling)
- Optimize database queries (check slow query logs)
- Enable query caching in Redis
- Implement request rate limiting
- Review algorithm efficiency (leaderboard sorting)

#### 2. Database Connection Exhaustion

**Symptoms:**
- "Too many connections" errors
- Long query waits
- Intermittent 503 errors

**Investigation:**

```bash
# Check active connections
psql -h <rds-endpoint> -U postgres -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# Check connection pool status
psql -h <rds-endpoint> -U postgres -c "SELECT * FROM pg_stat_activity WHERE datname = 'scoreboard_db';"

# Check CloudWatch RDS metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=scoreboard-db \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum
```

**Solutions:**
- Increase `max_connections` in RDS parameter group
- Increase connection pool size: `DATABASE_POOL_MAX=30`
- Implement connection pooling middleware (pgBouncer)
- Review long-running queries and optimize
- Consider read replicas for scaling read capacity

#### 3. Redis Connection Issues

**Symptoms:**
- Redis timeouts
- Cache misses increasing
- "Connection refused" errors

**Investigation:**

```bash
# Check Redis connectivity
redis-cli -h <elasticache-endpoint> -p 6379 --tls ping

# Check Redis memory usage
redis-cli -h <elasticache-endpoint> info memory

# Check connected clients
redis-cli -h <elasticache-endpoint> info clients

# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name EngineCPUUtilization \
  --dimensions Name=CacheClusterId,Value=scoreboard-redis-001 \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average
```

**Solutions:**
- Check ElastiCache security group rules
- Verify VPC and subnet configuration
- Increase Redis node type (e.g., cache.r7g.xlarge)
- Enable cluster mode for higher throughput
- Implement connection pooling in application

#### 4. Slow Leaderboard Queries

**Symptoms:**
- `/api/leaderboard` latency > 100ms
- Redis misses on leaderboard key
- High CPU in Redis node

**Investigation:**

```bash
# Monitor Redis commands
redis-cli -h <elasticache-endpoint> monitor

# Check key sizes
redis-cli -h <elasticache-endpoint> --bigkeys

# Analyze key patterns
redis-cli -h <elasticache-endpoint> info keyspace

# Check Prisma query plan
EXPLAIN ANALYZE SELECT * FROM scores ORDER BY score DESC LIMIT 10;
```

**Solutions:**
- Ensure leaderboard is properly cached in Redis
- Increase Redis TTL for leaderboard
- Implement incremental cache updates (don't recompute on every update)
- Add database index on scores table: `CREATE INDEX idx_scores_user_score ON scores(user_id, score);`
- Consider materialized views for complex leaderboards

#### 5. SSE Connection Drops

**Symptoms:**
- Clients losing real-time updates
- "Connection reset" errors
- High bandwidth usage

**Investigation:**

```bash
# Check SSE connections per task
curl http://<ecs-task-ip>:3000/metrics | grep sse_connections

# Monitor CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace Scoreboard/API \
  --metric-name sse_connections \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average,Maximum

# Check ALB connection handling
aws elbv2 describe-load-balancers | grep scoreboard
```

**Solutions:**
- Enable sticky sessions in ALB (already configured)
- Increase ALB idle timeout: `idle_timeout.timeout_seconds = 60`
- Implement heartbeat pings: `SSE_HEARTBEAT_INTERVAL = 30000`
- Add retry logic in client with exponential backoff
- Monitor and gracefully handle connection disconnections

#### 6. Deployment Failures

**Symptoms:**
- Tasks won't start
- Container exits immediately
- CloudWatch logs show no output

**Investigation:**

```bash
# Check task definition
aws ecs describe-task-definition --task-definition scoreboard-api:1

# Check running tasks
aws ecs describe-tasks \
  --cluster scoreboard-prod \
  --tasks $(aws ecs list-tasks --cluster scoreboard-prod --service-name scoreboard-api | jq -r '.taskArns[0]')

# Check ECS service events
aws ecs describe-services \
  --cluster scoreboard-prod \
  --services scoreboard-api \
  --query 'services[0].events' | head -10

# Check CloudWatch logs
aws logs describe-log-streams --log-group-name /ecs/scoreboard-prod
aws logs get-log-events --log-group-name /ecs/scoreboard-prod --log-stream-name ecs/scoreboard-api/...
```

**Solutions:**
- Verify Docker image exists in ECR
- Check task execution role permissions (Secrets Manager, ECR)
- Verify environment variables and secrets are set
- Check container healthcheck configuration
- Review application startup logs

#### 7. High Error Rate

**Symptoms:**
- HTTP 5xx errors increasing
- Application exceptions in logs
- Alarms triggering frequently

**Investigation:**

```bash
# Get recent errors from logs
aws logs filter-log-events \
  --log-group-name /ecs/scoreboard-prod \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000

# Check specific error types
aws logs filter-log-events \
  --log-group-name /ecs/scoreboard-prod \
  --filter-pattern "INVALID_TOKEN"

# CloudWatch Logs Insights
aws logs start-query \
  --log-group-name /ecs/scoreboard-prod \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string "fields @timestamp, @message, error_code | filter error_code != '' | stats count() as error_count by error_code"
```

**Solutions:**
- Review error logs for root cause
- Check database connectivity
- Verify JWT secret rotation
- Check rate limiting thresholds
- Review recent code deployments

### Health Checks

```bash
# Comprehensive health check script
#!/bin/bash

echo "=== Scoreboard API Health Check ==="

# API Health
echo -n "API Health: "
curl -s https://scoreboard-api.example.com/health | jq .

# Database connectivity
echo -n "Database Status: "
psql -h <rds-endpoint> -U postgres -c "SELECT 1;" && echo "OK" || echo "FAILED"

# Redis connectivity
echo -n "Redis Status: "
redis-cli -h <elasticache-endpoint> ping

# ALB health
echo -n "ALB Targets: "
aws elbv2 describe-target-health --target-group-arn arn:... | jq '.TargetHealthDescriptions[] | {Target: .Target.Id, State: .TargetHealth.State}'

# ECS service
echo -n "ECS Service Status: "
aws ecs describe-services --cluster scoreboard-prod --services scoreboard-api | \
  jq '.services[0] | {DesiredCount, RunningCount, PendingCount}'

echo "=== Health Check Complete ==="
```

---

## Runbooks

### Blue-Green Deployment

```bash
#!/bin/bash
# Minimal-downtime deployment using blue-green strategy

set -e

CLUSTER="scoreboard-prod"
SERVICE="scoreboard-api"
NEW_IMAGE="$1"  # ECR image URI

if [ -z "$NEW_IMAGE" ]; then
  echo "Usage: ./deploy.sh <ecr-image-uri>"
  exit 1
fi

echo "Starting blue-green deployment..."
echo "New image: $NEW_IMAGE"

# Step 1: Get current task definition
CURRENT_TASK_DEF=$(aws ecs describe-services \
  --cluster $CLUSTER \
  --services $SERVICE \
  --query 'services[0].taskDefinition' \
  --output text)

echo "Current task definition: $CURRENT_TASK_DEF"

# Step 2: Create new task definition revision
NEW_TASK_DEF=$(aws ecs describe-task-definition \
  --task-definition $CURRENT_TASK_DEF \
  --query 'taskDefinition' | \
  jq ".containerDefinitions[0].image = \"$NEW_IMAGE\" | del(.taskDefinitionArn, .revision, .status, .requiresAttributes)")

REGISTERED=$(aws ecs register-task-definition \
  --cli-input-json "$(echo $NEW_TASK_DEF | jq '.' | jq '.family = "scoreboard-api"')" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

echo "New task definition: $REGISTERED"

# Step 3: Update service (blue-green transition)
aws ecs update-service \
  --cluster $CLUSTER \
  --service $SERVICE \
  --task-definition $REGISTERED \
  --force-new-deployment

echo "Service update initiated..."

# Step 4: Wait for deployment to complete
echo "Waiting for deployment..."
aws ecs wait services-stable \
  --cluster $CLUSTER \
  --services $SERVICE

echo "Deployment complete!"

# Step 5: Verify health
RUNNING=$(aws ecs describe-services \
  --cluster $CLUSTER \
  --services $SERVICE \
  --query 'services[0].runningCount' \
  --output text)

DESIRED=$(aws ecs describe-services \
  --cluster $CLUSTER \
  --services $SERVICE \
  --query 'services[0].desiredCount' \
  --output text)

if [ "$RUNNING" == "$DESIRED" ]; then
  echo "✓ Deployment successful! All tasks running."
else
  echo "✗ Deployment issue: Only $RUNNING/$DESIRED tasks running"
  exit 1
fi
```

### Emergency Rollback

```bash
#!/bin/bash
# Rollback to previous version

set -e

CLUSTER="scoreboard-prod"
SERVICE="scoreboard-api"

echo "Rolling back to previous deployment..."

# Get previous task definition
TASK_DEFS=$(aws ecs list-task-definitions \
  --family-prefix scoreboard-api \
  --sort NONE \
  --query 'taskDefinitionArns[-2]' \
  --output text)

PREVIOUS_TASK_DEF=$TASK_DEFS

echo "Previous task definition: $PREVIOUS_TASK_DEF"

# Update service to use previous task definition
aws ecs update-service \
  --cluster $CLUSTER \
  --service $SERVICE \
  --task-definition $PREVIOUS_TASK_DEF \
  --force-new-deployment

echo "Waiting for rollback..."
aws ecs wait services-stable \
  --cluster $CLUSTER \
  --services $SERVICE

echo "✓ Rollback complete!"
```

### Scale Service Manually

```bash
#!/bin/bash
# Manually scale service

CLUSTER="scoreboard-prod"
SERVICE="scoreboard-api"
DESIRED_COUNT="$1"

if [ -z "$DESIRED_COUNT" ]; then
  echo "Usage: ./scale.sh <desired-count>"
  exit 1
fi

echo "Scaling service to $DESIRED_COUNT tasks..."

aws ecs update-service \
  --cluster $CLUSTER \
  --service $SERVICE \
  --desired-count $DESIRED_COUNT

echo "Waiting for scaling..."
aws ecs wait services-stable \
  --cluster $CLUSTER \
  --services $SERVICE

echo "✓ Scaling complete!"
```

### Database Backup & Restore

```bash
# Create manual backup
aws rds create-db-snapshot \
  --db-instance-identifier scoreboard-db \
  --db-snapshot-identifier scoreboard-db-backup-$(date +%Y%m%d-%H%M%S)

# List recent backups
aws rds describe-db-snapshots \
  --db-instance-identifier scoreboard-db \
  --query 'DBSnapshots[].{Id:DBSnapshotIdentifier,Status:Status,Created:SnapshotCreateTime}' \
  --output table

# Restore from snapshot (creates new instance)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier scoreboard-db-restored \
  --db-snapshot-identifier scoreboard-db-backup-20251211-120000

# Monitor restore
aws rds describe-db-instances \
  --db-instance-identifier scoreboard-db-restored \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Engine:Engine,AllocatedStorage:AllocatedStorage}'
```

---

## Quick Reference

### Key Endpoints & Access

| Resource | Endpoint | Access |
|----------|----------|--------|
| API | `https://scoreboard-api.example.com` | Public (with JWT) |
| AWS Console | `https://console.aws.amazon.com` | IAM credentials |
| RDS Database | `scoreboard-db.xxxx.us-east-1.rds.amazonaws.com:5432` | VPC only |
| Redis | `scoreboard-redis-001.xxxx.ng.0001.use1.cache.amazonaws.com:6379` | VPC only |
| CloudWatch Logs | AWS Console → CloudWatch → Log Groups | IAM role |

### Useful AWS CLI Commands

```bash
# Get service status
aws ecs describe-services --cluster scoreboard-prod --services scoreboard-api

# List running tasks
aws ecs list-tasks --cluster scoreboard-prod --service-name scoreboard-api

# Get logs
aws logs tail /ecs/scoreboard-prod --follow

# Get metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --start-time <time> \
  --end-time <time> \
  --period 300 \
  --statistics Average

# Create database snapshot
aws rds create-db-snapshot \
  --db-instance-identifier scoreboard-db \
  --db-snapshot-identifier backup-$(date +%s)
```

### Emergency Contacts

- **On-call Engineer:** (phone/Slack channel)
- **AWS Support:** (case ID for enterprise support)
- **Database Administrator:** (contact info)
- **DevOps Team Slack:** #scoreboard-ops

---

**Document Version:** 1.0
**Last Updated:** 2025-12-11
**Next Review:** 2025-12-25
