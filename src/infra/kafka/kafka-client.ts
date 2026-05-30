import { Kafka } from 'kafkajs';
import { env } from '@config/env.config';

export const kafka = new Kafka({
  clientId: 'zalo-delivery',
  brokers: [env.KAFKA_BROKER],
  retry: {
    initialRetryTime: 500,
    retries: 5,
  },
});
