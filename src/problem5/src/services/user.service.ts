import prisma from '../config/database';
import { NotFoundError } from '../utils/error.util';
import { User } from '@prisma/client';
import { logger } from '../utils/logger.util';

export interface CreateUserDto {
  firstName: string;
  lastName: string;
  age: number;
}

export interface UpdateUserDto {
  firstName: string;
  lastName: string;
  age: number;
}

export interface PatchUserDto {
  firstName?: string;
  lastName?: string;
  age?: number;
}

export interface ListUsersFilters {
  firstName?: string;
  lastName?: string;
  minAge?: number;
  maxAge?: number;
  limit?: number;
  offset?: number;
}

export const userService = {
  async create(data: CreateUserDto): Promise<User> {
    logger.info({ msg: 'Creating user', firstName: data.firstName, lastName: data.lastName });

    const user = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        age: data.age,
      },
    });

    logger.info({ msg: 'User created', userId: user.id });
    return user;
  },

  async list(filters: ListUsersFilters = {}): Promise<{ users: User[]; total: number }> {
    const {
      firstName,
      lastName,
      minAge,
      maxAge,
      limit = 50,
      offset = 0,
    } = filters;

    logger.debug({ msg: 'Listing users', filters });

    // Build where clause
    const where: any = {};

    if (firstName) {
      where.firstName = { contains: firstName };
    }

    if (lastName) {
      where.lastName = { contains: lastName };
    }

    if (minAge !== undefined || maxAge !== undefined) {
      where.age = {};
      if (minAge !== undefined) {
        where.age.gte = minAge;
      }
      if (maxAge !== undefined) {
        where.age.lte = maxAge;
      }
    }

    // Execute queries in parallel
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    logger.info({ msg: 'Users listed', count: users.length, total });
    return { users, total };
  },

  async getById(id: string): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  },

  async update(id: string, data: UpdateUserDto): Promise<User> {
    logger.info({ msg: 'Updating user', userId: id });
    // Check if user exists
    await this.getById(id);

    const user = await prisma.user.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        age: data.age,
      },
    });

    logger.info({ msg: 'User updated', userId: id });
    return user;
  },

  async patch(id: string, data: PatchUserDto): Promise<User> {
    logger.info({ msg: 'Patching user', userId: id, fields: Object.keys(data) });
    // Check if user exists
    await this.getById(id);

    const user = await prisma.user.update({
      where: { id },
      data,
    });

    logger.info({ msg: 'User patched', userId: id });
    return user;
  },

  async delete(id: string): Promise<void> {
    logger.info({ msg: 'Deleting user', userId: id });
    // Check if user exists
    await this.getById(id);

    await prisma.user.delete({
      where: { id },
    });

    logger.info({ msg: 'User deleted', userId: id });
  },
};
