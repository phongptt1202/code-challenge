import app from './app';
import { env } from './config/env';
import prisma from './config/database';
import { logger } from './utils/logger.util';

const PORT = env.PORT || 3000;

let server: any;

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info({ msg: 'Graceful shutdown initiated', signal });

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await prisma.$disconnect();
        logger.info('Database connection closed');
        process.exit(0);
      } catch (error) {
        logger.error({ msg: 'Error during graceful shutdown', err: error });
        process.exit(1);
      }
    });
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }
};

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected');

    // Start HTTP server
    server = app.listen(PORT, () => {
      logger.info({
        msg: 'Server started',
        port: PORT,
        environment: env.NODE_ENV,
        healthCheck: `http://localhost:${PORT}/health`,
        apiDocs: `http://localhost:${PORT}/api-docs`,
      });
    });

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error({ msg: 'Failed to start server', err: error });
    await prisma.$disconnect();
    process.exit(1);
  }
};

startServer();
