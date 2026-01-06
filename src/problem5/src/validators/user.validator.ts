import { z } from 'zod';

// Base user schema
export const userSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100, 'First name must be at most 100 characters'),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name must be at most 100 characters'),
  age: z.number().int().min(1, 'Age must be at least 1').max(150, 'Age must be at most 150'),
});

// Create user validation
export const createUserSchema = z.object({
  body: userSchema,
});

// Update user validation (PUT - all fields required)
export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
  body: userSchema,
});

// Partial update user validation (PATCH - all fields optional)
export const patchUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
  body: userSchema.partial(),
});

// Get user by ID validation
export const getUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

// Delete user validation
export const deleteUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID format'),
  }),
});

// List users with filters validation
export const listUsersSchema = z.object({
  query: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    minAge: z.string().regex(/^\d+$/, 'minAge must be a number').optional().transform(val => val ? parseInt(val, 10) : undefined),
    maxAge: z.string().regex(/^\d+$/, 'maxAge must be a number').optional().transform(val => val ? parseInt(val, 10) : undefined),
    limit: z.string().regex(/^\d+$/, 'limit must be a number').optional().transform(val => {
      if (!val) return 50;
      const num = parseInt(val, 10);
      return Math.min(num, 100); // Max 100
    }),
    offset: z.string().regex(/^\d+$/, 'offset must be a number').optional().transform(val => val ? parseInt(val, 10) : 0),
  }).optional(),
});
