import http from 'http';
import { createApp } from './app';
import { env } from '@config/env.config';
import logger from '@shared/logger/logger';
import { prisma } from '@infra/database/prisma-client';
import { redis } from '@infra/redis/redis-client';
import { connectProducer, disconnectProducer } from '@infra/kafka/producer';
import { initModules } from './routes';
import { initSocketServer, flushTrajectoryBuffer } from '@infra/socket';

export async function createServer() {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.io Server
  initSocketServer(server);

  // Connect infrastructure
  await prisma.$connect();
  logger.info('Database connected');

  await redis.connect();

  await connectProducer();

  // Initialize all business modules
  await initModules();
  logger.info('Business modules initialized');

  return { app, server };
}

export async function gracefulShutdown(server: http.Server) {
  logger.info('Shutting down gracefully...');

  // Flush any remaining trajectory points before exit
  try {
    await flushTrajectoryBuffer();
  } catch (err) {
    logger.error({ err }, 'Error flushing trajectory buffer during shutdown');
  }

  server.close(() => {
    logger.info('HTTP server closed');
  });

  await disconnectProducer();
  await redis.quit();
  await prisma.$disconnect();

  logger.info('Shutdown complete');
}
