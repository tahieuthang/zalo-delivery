import 'dotenv/config';
import { kafka } from '@infra/kafka/kafka-client';
import { KAFKA_TOPICS } from '@infra/kafka/topics';

async function test() {
  const producer = kafka.producer();
  console.log('Connecting producer...');
  await producer.connect();
  console.log('Producer connected. Sending message...');
  
  const dummyEvent = {
    version: 1,
    eventType: 'order.assigned',
    payload: {
      orderId: 'order-real-demo',
      shipperId: 'shipper-real-demo-4',
      distanceMeters: 500,
      durationSeconds: 60,
      assignedAt: new Date().toISOString(),
    },
    metadata: {
      correlationId: 'test-corr-id',
      timestamp: new Date().toISOString(),
    },
  };

  await producer.send({
    topic: KAFKA_TOPICS.ORDER_ASSIGNED,
    messages: [
      {
        key: 'order-real-demo',
        value: JSON.stringify(dummyEvent),
      },
    ],
  });

  console.log('Message sent successfully!');
  await producer.disconnect();
}

test().catch(console.error);
