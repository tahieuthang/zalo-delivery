import http from 'http';
import { createApp } from './app';
import { env } from '@config/env.config';
import logger from '@shared/logger/logger';
import { prisma } from '@infra/database/prisma-client';
import { redis } from '@infra/redis/redis-client';
import { connectProducer, disconnectProducer } from '@infra/kafka/producer';

export async function createServer() {
  const app = createApp();
  const server = http.createServer(app);

  // Connect infrastructure
  await prisma.$connect();
  logger.info('Database connected');

  await redis.connect();

  await connectProducer();

  return { app, server };
}

export async function gracefulShutdown(server: http.Server) {
  logger.info('Shutting down gracefully...');

  server.close(() => {
    logger.info('HTTP server closed');
  });

  await disconnectProducer();
  await redis.quit();
  await prisma.$disconnect();

  logger.info('Shutdown complete');
}
