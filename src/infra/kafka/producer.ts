import { kafka } from './kafka-client';
import logger from '@shared/logger/logger';

const _producer = kafka.producer();
let _connected = false;

export async function connectProducer(): Promise<void> {
  if (!_connected) {
    await _producer.connect();
    _connected = true;
    logger.info('Kafka producer connected');
  }
}

export async function disconnectProducer(): Promise<void> {
  if (_connected) {
    await _producer.disconnect();
    _connected = false;
  }
}

export const producer = _producer;
