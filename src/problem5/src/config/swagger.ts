import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'User CRUD API',
      version: '1.0.0',
      description:
        'A production-ready RESTful API for managing user resources with JWT authentication',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from /api/auth/login or /api/auth/register',
        },
      },
      schemas: {
        User: {
          type: 'object',
          required: ['firstName', 'lastName', 'age'],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Auto-generated UUID',
            },
            firstName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'User first name',
            },
            lastName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'User last name',
            },
            age: {
              type: 'integer',
              minimum: 1,
              maximum: 150,
              description: 'User age',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Auto-generated creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Auto-updated timestamp',
            },
          },
        },
        CreateUserRequest: {
          type: 'object',
          required: ['firstName', 'lastName', 'age'],
          properties: {
            firstName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              example: 'John',
            },
            lastName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              example: 'Doe',
            },
            age: {
              type: 'integer',
              minimum: 1,
              maximum: 150,
              example: 30,
            },
          },
        },
        UpdateUserRequest: {
          type: 'object',
          required: ['firstName', 'lastName', 'age'],
          properties: {
            firstName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              example: 'Jane',
            },
            lastName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              example: 'Smith',
            },
            age: {
              type: 'integer',
              minimum: 1,
              maximum: 150,
              example: 28,
            },
          },
        },
        PatchUserRequest: {
          type: 'object',
          properties: {
            firstName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              example: 'Jane',
            },
            lastName: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              example: 'Smith',
            },
            age: {
              type: 'integer',
              minimum: 1,
              maximum: 150,
              example: 28,
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              minLength: 8,
              example: 'SecurePassword123',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              example: 'SecurePassword123',
            },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'JWT token for authentication',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            user: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  format: 'uuid',
                },
                email: {
                  type: 'string',
                  format: 'email',
                },
              },
            },
          },
        },
        UserListResponse: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/User',
              },
            },
            pagination: {
              type: 'object',
              properties: {
                total: {
                  type: 'integer',
                  description: 'Total number of users matching filters',
                },
                limit: {
                  type: 'integer',
                  description: 'Maximum users per page',
                },
                offset: {
                  type: 'integer',
                  description: 'Number of users skipped',
                },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Human-readable error message',
                },
                code: {
                  type: 'string',
                  description: 'Machine-readable error code',
                },
                details: {
                  type: 'object',
                  description: 'Additional error details',
                },
              },
            },
          },
        },
      },
    },
    security: [],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
