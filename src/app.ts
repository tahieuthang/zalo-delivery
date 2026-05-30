import express from 'express';
import cors from 'cors';
import { router } from './routes';
import { errorHandler } from '@shared/middleware/error-handler';
import { requestLogger } from '@shared/middleware/request-logger';

export function createApp() {
  const app = express();

  // Core middleware
  app.use(cors());
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString();
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Routes
  app.use('/api', router);

  // Global error handler — MUST be last
  app.use(errorHandler);

  return app;
}
