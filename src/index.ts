import 'dotenv/config';
import { env } from '@config/env.config';
import { createServer, gracefulShutdown } from './server';
import logger from '@shared/logger/logger';

async function bootstrap() {
  const { server } = await createServer();

  server.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, nodeEnv: env.NODE_ENV },
      `🚀 Server is running at http://localhost:${env.PORT}`,
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    await gracefulShutdown(server);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
