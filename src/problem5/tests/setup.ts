import { exec } from 'child_process';
import { promisify } from 'util';
import prisma from '../src/config/database';

const execAsync = promisify(exec);

beforeAll(async () => {
  // Set test environment
  process.env.DATABASE_URL = 'file:./test.db';
  process.env.JWT_SECRET = 'test-secret-key-minimum-32-characters-long-for-testing';
  process.env.NODE_ENV = 'test';

  // Run migrations for test database
  try {
    await execAsync('npx prisma migrate deploy');
  } catch (error) {
    console.error('Migration error:', error);
  }
});

afterEach(async () => {
  // Clean up database after each test
  await prisma.user.deleteMany();
  await prisma.apiUser.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
