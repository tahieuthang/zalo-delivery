import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { router } from './routes';
import { errorHandler } from '@shared/middleware/error-handler';
import { requestLogger } from '@shared/middleware/request-logger';

export function createApp() {
  const app = express();

  // Security headers middleware
  app.use(helmet());

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

  // Webhook rate limiter (max 100 requests per 1 minute)
  const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again after a minute' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });

  // Apply rate limiter to webhook endpoint paths
  app.use('/api/webhooks', webhookLimiter);

  // Zalo Domain Verification Route (Dynamic)
  app.get('/zalo_verifier:token.html', (req, res) => {
    const { token } = req.params;
    res.setHeader('Content-Type', 'text/html');
    res.send(token);
  });

  // Root route for alive check & Zalo meta verification
  app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="zalo-platform-site-verification" content="Sz6GDeNzA6zwwuPeczWJS4tkmrMXc1O3DZ8v" />
          <title>Zalo Delivery System</title>
        </head>
        <body>
          <h1>Zalo Delivery System Online</h1>
        </body>
      </html>
    `);
  });

  // Routes
  app.use('/api', router);

  // Global error handler — MUST be last
  app.use(errorHandler);

  return app;
}
