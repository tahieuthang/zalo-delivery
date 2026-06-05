import 'dotenv/config';
import { io as connectSocket } from 'socket.io-client';
import { redis } from '@infra/redis/redis-client';
import { prisma } from '@infra/database/prisma-client';
import { getRoute } from '@infra/osrm/osrm-client';
import { runConsumer } from '@infra/kafka/consumer';
import { KAFKA_TOPICS } from '@infra/kafka/topics';
import { OrderAssignedEventSchema } from '@modules/dispatcher/dispatcher.dto';
import logger from '@shared/logger/logger';
import { env } from '@config/env.config';

const SOCKET_URL = `http://localhost:${env.PORT}/tracking`;
const SIMULATION_INTERVAL_MS = 2000; // 2 seconds

// Map to track active intervals for each order: orderId -> Interval
const activeSimulations = new Map<string, NodeJS.Timeout>();

// Connect Socket.io client
logger.info({ url: SOCKET_URL }, 'Connecting to Socket.io server...');
const socket = connectSocket(SOCKET_URL, {
  auth: {
    token: env.SOCKET_TOKEN,
  },
  reconnection: true,
});

socket.on('connect', () => {
  logger.info({ socketId: socket.id }, 'Connected to Socket.io /tracking namespace successfully');
});

socket.on('connect_error', (err) => {
  logger.error({ err }, 'Socket.io connection error');
});

// Simple Haversine distance formula
function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Route interpolation helper to smooth movement
function interpolateRoute(coords: [number, number][], spacingMeters = 30): [number, number][] {
  if (coords.length < 2) return coords;
  const result: [number, number][] = [coords[0]];

  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i];
    const end = coords[i + 1];
    const dist = getHaversineDistance(start[1], start[0], end[1], end[0]);

    if (dist > spacingMeters) {
      const steps = Math.ceil(dist / spacingMeters);
      for (let j = 1; j < steps; j++) {
        const fraction = j / steps;
        const lng = start[0] + (end[0] - start[0]) * fraction;
        const lat = start[1] + (end[1] - start[1]) * fraction;
        result.push([lng, lat]);
      }
    }
    result.push(end);
  }
  return result;
}

// Start simulation process for an assigned order
async function startShipperSimulation(orderId: string, shipperId: string) {
  // Clear any existing simulation for this order
  if (activeSimulations.has(orderId)) {
    clearInterval(activeSimulations.get(orderId)!);
    activeSimulations.delete(orderId);
  }

  logger.info({ orderId, shipperId }, 'Starting shipper journey simulation');

  try {
    // 1. Fetch order details from DB
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      logger.error({ orderId }, 'Order not found in DB, skipping simulation');
      return;
    }

    // 2. Fetch shipper location from Redis Geo (fallback if not set)
    let shipperLng = 106.695; // District 1 center default
    let shipperLat = 10.775;
    const pos = await redis.geopos('shipper:locations', shipperId);
    if (pos && pos[0] && pos[0][0] && pos[0][1]) {
      shipperLng = parseFloat(pos[0][0]);
      shipperLat = parseFloat(pos[0][1]);
    }

    // 3. Get routing legs
    logger.info({ orderId }, 'Fetching route legs from OSRM...');

    // Leg 1: Shipper -> Pickup
    const leg1 = await getRoute(
      { lng: shipperLng, lat: shipperLat },
      { lng: order.pickupLng!, lat: order.pickupLat! }
    );

    // Leg 2: Pickup -> Delivery
    const leg2 = await getRoute(
      { lng: order.pickupLng!, lat: order.pickupLat! },
      { lng: order.deliveryLng!, lat: order.deliveryLat! }
    );

    // Combine route coordinates (explicitly injecting target coordinates to guarantee geofence trigger)
    const combinedCoords: [number, number][] = [
      ...leg1.coordinates,
      [order.pickupLng!, order.pickupLat!],
      ...leg2.coordinates,
      [order.deliveryLng!, order.deliveryLat!],
    ];

    // Interpolate path coordinates for realistic movement representation
    const interpolatedCoords = interpolateRoute(combinedCoords, 30);
    logger.info(
      { orderId, rawPointsCount: combinedCoords.length, interpolatedCount: interpolatedCoords.length },
      'Route loaded and interpolated successfully'
    );

    let currentIndex = 0;

    // Join order room to trace connection
    socket.emit('join_order', { orderId });

    // Set interval to publish location
    const intervalId = setInterval(() => {
      if (currentIndex >= interpolatedCoords.length) {
        logger.info({ orderId, shipperId }, 'Shipper completed the journey simulation. Stopping simulation.');
        clearInterval(intervalId);
        activeSimulations.delete(orderId);
        return;
      }

      const [lng, lat] = interpolatedCoords[currentIndex];

      // Emit update via WS
      socket.emit('shipper:location_update', {
        shipperId,
        orderId,
        lat,
        lng,
      });

      logger.info(
        { orderId, shipperId, progress: `${currentIndex + 1}/${interpolatedCoords.length}`, lat, lng },
        '🎯 Simulated shipper location transmitted'
      );

      currentIndex++;
    }, SIMULATION_INTERVAL_MS);

    activeSimulations.set(orderId, intervalId);

  } catch (err) {
    logger.error({ err, orderId, shipperId }, 'Failed to initialize shipper simulation');
  }
}

// Start Kafka consumer to listen for order.assigned
async function run() {
  await redis.connect();

  const groupId = `shipper-simulator-${Math.random().toString(36).substring(2, 9)}`;
  logger.info({ topic: KAFKA_TOPICS.ORDER_ASSIGNED, groupId }, 'Registering simulator Kafka consumer');

  await runConsumer(groupId, KAFKA_TOPICS.ORDER_ASSIGNED, async (message) => {
    try {
      const validatedEvent = OrderAssignedEventSchema.parse(message);
      const { orderId, shipperId } = validatedEvent.payload;

      logger.info(
        { orderId, shipperId, correlationId: validatedEvent.metadata.correlationId },
        'Received order.assigned event. Triggering simulator...'
      );

      await startShipperSimulation(orderId, shipperId);
    } catch (err) {
      logger.error({ err, message }, 'Error processing order.assigned event inside simulator');
    }
  });
}

run().catch((err) => {
  logger.error({ err }, 'Simulator failed to start');
  process.exit(1);
});

// Handle graceful shutdown
const cleanup = async () => {
  logger.info('Shutting down simulator...');
  for (const [orderId, intervalId] of activeSimulations.entries()) {
    clearInterval(intervalId);
  }
  activeSimulations.clear();
  socket.disconnect();
  await redis.quit();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
