import { Router } from 'express';

export const router = Router();

export async function initModule(): Promise<void> {
  // Tracking module (Socket.io handlers and geofencing) initialized
}

export * from './tracking.service';
