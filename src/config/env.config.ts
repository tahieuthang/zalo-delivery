import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // PostgreSQL
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),

  // Kafka
  KAFKA_BROKER: z.string().default('localhost:9092'),

  // OSRM
  OSRM_URL: z.string().url().default('http://localhost:5000'),

  // Geocoding
  GOONG_API_KEY: z.string().optional(),

  // Zalo
  ZALO_OA_ID: z.string().optional(),
  ZALO_APP_ID: z.string().optional(),
  ZALO_APP_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
