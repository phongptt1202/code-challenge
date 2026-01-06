import bcrypt from 'bcrypt';
import prisma from '../config/database';
import { ConflictError, UnauthorizedError } from '../utils/error.util';
import { generateToken } from '../utils/jwt.util';
import { logger } from '../utils/logger.util';

const SALT_ROUNDS = 10;

export interface RegisterDto {
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
  };
}

export const authService = {
  async register(data: RegisterDto): Promise<AuthResponse> {
    logger.info({ msg: 'User registration attempt', email: data.email });

    // Check if user already exists
    const existingUser = await prisma.apiUser.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      logger.warn({ msg: 'Registration failed - email already exists', email: data.email });
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Create user
    const user = await prisma.apiUser.create({
      data: {
        email: data.email,
        password: hashedPassword,
      },
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    logger.info({ msg: 'User registered successfully', userId: user.id, email: user.email });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  },

  async login(data: LoginDto): Promise<AuthResponse> {
    logger.info({ msg: 'User login attempt', email: data.email });

    // Find user
    const user = await prisma.apiUser.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      logger.warn({ msg: 'Login failed - user not found', email: data.email });
      throw new UnauthorizedError('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(data.password, user.password);

    if (!isPasswordValid) {
      logger.warn({ msg: 'Login failed - invalid password', email: data.email });
      throw new UnauthorizedError('Invalid credentials');
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    logger.info({ msg: 'User logged in successfully', userId: user.id, email: user.email });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  },
};
