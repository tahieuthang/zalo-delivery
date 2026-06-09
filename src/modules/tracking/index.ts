import { Router } from 'express';
import { trackingRouter } from '@modules/tracking/tracking.controller';

export const router = trackingRouter;

export async function initModule(): Promise<void> {
  // Tracking module (Socket.io handlers and geofencing) initialized
}

export * from '@modules/tracking/tracking.service';
