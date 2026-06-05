import { Server, Socket } from 'socket.io';
import http from 'http';
import { env } from '@config/env.config';
import logger from '@shared/logger/logger';
import { addShipperLocation } from '@infra/redis/geo.service';
import { prisma } from '@infra/database/prisma-client';
import { ulid } from '@shared/utils/id-generator';
import { processGeofencing } from '@modules/tracking/tracking.service';

let io: Server | null = null;

// In-memory buffer for trajectory points
let trajectoryBuffer: Array<{
  id: string;
  orderId: string;
  shipperId: string;
  lat: number;
  lng: number;
}> = [];

export function initSocketServer(server: http.Server): Server {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  logger.info('Socket.io server initialized');

  const trackingNamespace = io.of('/tracking');

  // Auth middleware
  trackingNamespace.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    
    if (token !== env.SOCKET_TOKEN) {
      logger.warn({ socketId: socket.id }, 'Socket connection rejected: Invalid token');
      return next(new Error('Authentication error'));
    }
    
    next();
  });

  trackingNamespace.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Client connected to /tracking namespace');

    // Join room for a specific order
    socket.on('join_order', ({ orderId }: { orderId: string }) => {
      if (!orderId) return;
      const room = `order:${orderId}`;
      socket.join(room);
      logger.info({ socketId: socket.id, room }, 'Client joined order tracking room');
    });

    // Handle location updates from shipper
    socket.on('shipper:location_update', async (data: {
      shipperId: string;
      orderId: string;
      lat: number;
      lng: number;
    }) => {
      const { shipperId, orderId, lat, lng } = data;
      if (!shipperId || !orderId || lat === undefined || lng === undefined) {
        logger.warn({ data }, 'Received invalid shipper:location_update payload');
        return;
      }

      logger.debug(
        { shipperId, orderId, lat, lng },
        'Received location update from shipper via WebSocket'
      );

      try {
        // 1. Update Redis Geo
        await addShipperLocation(shipperId, lng, lat);

        // 2. Broadcast to order room
        const room = `order:${orderId}`;
        trackingNamespace.to(room).emit('shipper:location_updated', {
          shipperId,
          orderId,
          lat,
          lng,
          timestamp: new Date().toISOString(),
        });

        // 3. Buffer trajectory point for batch insert
        trajectoryBuffer.push({
          id: ulid(),
          orderId,
          shipperId,
          lat,
          lng,
        });

        if (trajectoryBuffer.length >= 10) {
          await flushTrajectoryBuffer();
        }

        // 4. Run geofencing check
        await processGeofencing(shipperId, orderId, lat, lng);
      } catch (err) {
        logger.error({ err, shipperId, orderId }, 'Error processing shipper location update');
      }
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Client disconnected from /tracking namespace');
    });
  });

  return io;
}

export function getSocketIO(): Server {
  if (!io) {
    throw new Error('Socket.io is not initialized yet');
  }
  return io;
}

export async function flushTrajectoryBuffer(): Promise<void> {
  if (trajectoryBuffer.length === 0) return;

  const pointsToWrite = [...trajectoryBuffer];
  trajectoryBuffer = [];

  logger.info({ count: pointsToWrite.length }, 'Flushing trajectory points to PostgreSQL');

  try {
    await prisma.trajectoryPoint.createMany({
      data: pointsToWrite,
    });
  } catch (err) {
    logger.error({ err, pointsToWrite }, 'Failed to flush trajectory points to database');
  }
}

/**
 * Emit event to tracking room from other modules.
 */
export function emitToOrderRoom(orderId: string, event: string, payload: any): void {
  if (!io) return;
  io.of('/tracking').to(`order:${orderId}`).emit(event, payload);
}
