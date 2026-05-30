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
      const parseResult = ZaloWebhookPayloadSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        // If event is not user_send_text, ignore it safely without returning 400 error
        if (req.body && req.body.event_name !== 'user_send_text') {
          res.status(200).json({
            data: { processed: false, reason: 'ignored_event' },
          });
          return;
        }
        
        // Otherwise return validation error to caller
        res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        });
        return;
      }

      const payload = parseResult.data;
      const signature = (req.headers['x-zevent-signature'] || '') as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      const result = await webhookService.processWebhook(payload, rawBody, signature);
      
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);
