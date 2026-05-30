# Skill: add-kafka-event

## Description
Thêm luồng event communication bất đồng bộ giữa các module qua Kafka. Bao gồm định nghĩa schema event (Zod), đăng ký topic, viết producer trong service và consumer trong module nhận.

---

## Trigger
Khi cần thêm giao tiếp async giữa hai module (ví dụ: order → dispatcher, tracking → revenue).

---

## Steps

1. Định nghĩa event schema trong `{module}.dto.ts` của module phát event:
   ```typescript
   // src/modules/order/order.dto.ts
   import { z } from 'zod';

   export const OrderCreatedEventSchema = z.object({
     version: z.literal(1),
     eventType: z.literal('order.created'),
     payload: z.object({
       orderId: z.string(),
       pickupLat: z.number(),
       pickupLng: z.number(),
       deliveryLat: z.number(),
       deliveryLng: z.number(),
       createdAt: z.string().datetime(),
     }),
     metadata: z.object({
       correlationId: z.string(),
       timestamp: z.string().datetime(),
     }),
   });

   export type OrderCreatedEvent = z.infer<typeof OrderCreatedEventSchema>;
   ```

2. Đăng ký topic name trong `src/infra/kafka/topics.ts`:
   ```typescript
   export const KAFKA_TOPICS = {
     ORDER_CREATED: 'order.created',
     ORDER_ASSIGNED: 'order.assigned',
     ORDER_COMPLETED: 'order.completed',
     // thêm topic mới ở đây
   } as const;
   ```

3. Publish event trong `{module}.service.ts` của module phát:
   ```typescript
   // src/modules/order/order.service.ts
   import { producer } from '@infra/kafka/producer';
   import { KAFKA_TOPICS } from '@infra/kafka/topics';
   import { ulid } from '@shared/utils/id-generator';

   await producer.send({
     topic: KAFKA_TOPICS.ORDER_CREATED,
     messages: [{
       key: orderId,
       value: JSON.stringify({
         version: 1,
         eventType: 'order.created',
         payload: { orderId, pickupLat, pickupLng, deliveryLat, deliveryLng, createdAt },
         metadata: { correlationId: ulid(), timestamp: new Date().toISOString() },
       }),
     }],
   });
   ```

4. Tạo `{module}.consumer.ts` trong module nhận:
   ```typescript
   // src/modules/dispatcher/dispatcher.consumer.ts
   import { createConsumer } from '@infra/kafka/consumer';
   import { KAFKA_TOPICS } from '@infra/kafka/topics';
   import { OrderCreatedEventSchema } from '@modules/order/order.dto';
   import * as dispatcherService from './dispatcher.service';
   import logger from '@shared/logger/logger';

   export async function startDispatcherConsumer() {
     const consumer = createConsumer('dispatcher-service');
     await consumer.subscribe({ topic: KAFKA_TOPICS.ORDER_CREATED });

     await consumer.run({
       eachMessage: async ({ message }) => {
         const raw = JSON.parse(message.value!.toString());
         const event = OrderCreatedEventSchema.parse(raw);
         await dispatcherService.assignOrder(event.payload);
       },
     });
   }
   ```

5. Gọi consumer trong `index.ts` của module nhận:
   ```typescript
   // src/modules/dispatcher/index.ts
   import { startDispatcherConsumer } from './dispatcher.consumer';

   export async function initModule() {
     await startDispatcherConsumer();
   }
   ```

6. Cấu hình DLQ handler cho topic: `{original-topic}.dlq`

---

## Checklist
- [ ] Event schema có `version` field và `eventType` literal
- [ ] Topic đã được đăng ký trong `src/infra/kafka/topics.ts`
- [ ] Schema được import từ module phát (không duplicate)
- [ ] Consumer thuộc consumer group `{module}-service`
- [ ] Consumer idempotent (xử lý được message trùng)
- [ ] DLQ topic được cấu hình: `{topic}.dlq`
- [ ] `initModule()` gọi `startConsumer()`
