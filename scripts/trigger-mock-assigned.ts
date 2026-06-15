import 'dotenv/config';
import { kafka } from '../src/infra/kafka/kafka-client';
import { KAFKA_TOPICS } from '../src/infra/kafka/topics';

async function test() {
  const producer = kafka.producer();
  console.log('Connecting producer...');
  await producer.connect();
  console.log('Producer connected. Sending message...');
  
  const dummyEvent = {
    version: 1,
    eventType: 'order.assigned',
    payload: {
      orderId: '01KV5WMXD63HV9XF4T2311XC87',
      shipperId: 'shipper-real-demo',
      distanceMeters: 500,
      durationSeconds: 60,
      assignedAt: new Date().toISOString(),
    },
    metadata: {
      correlationId: 'test-corr-id-manual',
      timestamp: new Date().toISOString(),
    },
  };

  await producer.send({
    topic: KAFKA_TOPICS.ORDER_ASSIGNED,
    messages: [
      {
        key: '01KV5WMXD63HV9XF4T2311XC87',
        value: JSON.stringify(dummyEvent),
      },
    ],
  });

  console.log('Message sent successfully!');
  await producer.disconnect();
}

test().catch(console.error);
