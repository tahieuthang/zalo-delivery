import { Router, Request, Response, NextFunction } from 'express';
import { ZaloWebhookPayloadSchema } from '@modules/webhook/webhook.dto';
import * as webhookService from '@modules/webhook/webhook.service';

export const webhookRouter = Router();

/**
 * Zalo OA Webhook Endpoint
 * POST /api/webhooks/zalo
 */
webhookRouter.post(
  '/zalo',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allowedEvents = ['user_send_text', 'follow'];
      if (req.body && !allowedEvents.includes(req.body.event_name)) {
        res.status(200).json({
          data: { processed: false, reason: 'ignored_event' },
        });
        return;
      }

      const parseResult = ZaloWebhookPayloadSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
        return;
      }

      const payload = parseResult.data;
      const signature = (req.headers['x-zevent-signature'] || '') as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      try {
        const result = await webhookService.processWebhook(payload, rawBody, signature);
        res.status(200).json({ data: result });
      } catch (err: any) {
        if (err && err.statusCode === 403) {
          res.status(403).json({ error: err.message, code: err.errorCode });
        } else {
          // Log parsing/processing failures but return 200 OK to prevent Zalo from deactivating webhook
          res.status(200).json({
            data: { processed: false, reason: err.message || 'processing_failed' },
          });
        }
      }
    } catch (err) {
      next(err);
    }
  },
);
