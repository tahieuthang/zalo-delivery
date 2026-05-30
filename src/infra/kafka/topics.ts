// Kafka topic constants
// Pattern: {module}.{event}
export const KAFKA_TOPICS = {
  ORDER_CREATED: 'order.created',
  ORDER_ASSIGNED: 'order.assigned',
  ORDER_COMPLETED: 'order.completed',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
