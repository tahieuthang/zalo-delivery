import 'dotenv/config';
import { redis } from '../src/infra/redis/redis-client';
import { prisma } from '../src/infra/database/prisma-client';
import * as dispatcherService from '../src/modules/dispatcher/dispatcher.service';
import { addShipperLocation, markShipperFree } from '../src/infra/redis/geo.service';
import { getRoute } from '../src/infra/osrm/osrm-client';

/**
 * =====================================================================================
 * HƯỚNG DẪN CHẠY KỊCH BẢN KIỂM THỬ TÍCH HỢP THỰC TẾ (DEMO INTEGRATION CONFIRMATION)
 * =====================================================================================
 *
 * Kịch bản này tạo ra 4 shipper online ở các vị trí khác nhau quanh Quận 1, TPHCM.
 * Khi chạy điều phối, hệ thống sẽ tự động gọi shipper gần nhất qua OSRM:
 *
 * 1. Khởi động môi trường Docker (Postgres, Redis, Kafka):
 *    docker compose up -d
 *
 * 2. Cập nhật cơ sở dữ liệu:
 *    npx prisma db push
 *
 * 3. Chạy Server ở cửa sổ terminal khác:
 *    npm run dev
 *
 * 4. Chạy script nạp trạng thái và tạo đơn hàng:
 *    npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/demo-integration-confirmation.ts
 *
 * 5. Thực hiện phản hồi qua API (Gửi trong vòng 30 giây để tránh timeout):
 *
 *    👉 TRÊN WINDOWS POWERSHELL:
 *       - Chấp nhận đơn (ACCEPT):
 *         Invoke-RestMethod -Uri "http://localhost:3000/api/dispatcher/respond" -Method Post -Headers @{"Content-Type"="application/json"} -Body '{"orderId": "order-real-demo", "shipperId": "shipper-real-demo", "action": "accept"}'
 *       hoặc gửi bằng Postman http://localhost:3000/api/dispatcher/respond
 *       body (json):
 *          {
 *            "orderId": "order-real-demo",
 *            "shipperId": "shipper-real-demo",
 *            "action": "accept"
 *          }
 *
 *       - Từ chối đơn (REJECT):
 *         Invoke-RestMethod -Uri "http://localhost:3000/api/dispatcher/respond" -Method Post -Headers @{"Content-Type"="application/json"} -Body '{"orderId": "order-real-demo", "shipperId": "shipper-real-demo", "action": "reject"}'
 *       hoặc gửi bằng Postman http://localhost:3000/api/dispatcher/respond
 *       body (json):
 *          {
 *            "orderId": "order-real-demo",
 *            "shipperId": "shipper-real-demo",
 *            "action": "reject"
 *          }
 *
 *    👉 TRÊN CMD / BASH / LINUX (CURL):
 *       - Chấp nhận đơn (ACCEPT):
 *         curl -X POST http://localhost:3000/api/dispatcher/respond -H "Content-Type: application/json" -d "{\"orderId\": \"order-real-demo\", \"shipperId\": \"shipper-real-demo\", \"action\": \"accept\"}"
 *
 *       - Từ chối đơn (REJECT):
 *         curl -X POST http://localhost:3000/api/dispatcher/respond -H "Content-Type: application/json" -d "{\"orderId\": \"order-real-demo\", \"shipperId\": \"shipper-real-demo\", \"action\": \"reject\"}"
 *
 * =====================================================================================
 */

async function main() {
  console.log('\n============================================================');
  console.log('🚀 DEMO REAL TIME: SHIPPER CONFIRMATION FLOW (OSRM + REDIS REAL)');
  console.log('============================================================');

  // 1. Kiểm tra kết nối tới các dịch vụ thực tế
  try {
    await redis.ping();
    console.log('✅ Kết nối thành công tới Redis!');
  } catch (err) {
    console.error('❌ Lỗi kết nối Redis. Vui lòng mở Docker Desktop và chạy `docker compose up -d`');
    process.exit(1);
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Kết nối thành công tới PostgreSQL!');
  } catch (err) {
    console.error('❌ Lỗi kết nối PostgreSQL. Vui lòng mở Docker Desktop và chạy `docker compose up -d` và `npx prisma db push`');
    process.exit(1);
  }

  // 2. Định nghĩa tọa độ thực tại Trường THCS Tam Hiệp, Thanh Trì, Hà Nội
  // Điểm lấy hàng: Trường Trung học cơ sở Tam Hiệp (Huỳnh Cung, Đại Thanh, Hà Nội)
  const pickup = { lat: 20.950203, lng: 105.830421, address: 'Trường Trung học cơ sở Tam Hiệp (Huỳnh Cung, Đại Thanh, Hà Nội)' };

  // Điểm giao hàng: Chung cư Đại Thanh
  const delivery = { lat: 20.957108, lng: 105.806646, address: 'Chung cư Đại Thanh, Thanh Trì, Hà Nội' };

  // Danh sách 4 tài xế online tại khu vực lân cận quanh shop
  const testShippers = [
    {
      id: 'shipper-real-demo',
      name: 'Trần Minh Quân (Sân bóng Huỳnh Cung)',
      phone: '0988888888',
      lat: 20.9512,
      lng: 105.8295,
    },
    {
      id: 'shipper-real-demo-2',
      name: 'Phạm Bình Minh (UBND Xã Tam Hiệp)',
      phone: '0988888882',
      lat: 20.9490,
      lng: 105.8315,
    },
    {
      id: 'shipper-real-demo-3',
      name: 'Lê Hoàng Nam (Chùa Huỳnh Cung)',
      phone: '0988888883',
      lat: 20.9520,
      lng: 105.8325,
    },
    {
      id: 'shipper-real-demo-4',
      name: 'Nguyễn Tuấn Kiệt (Ngã ba Phan Trọng Tuệ)',
      phone: '0988888884',
      lat: 20.9480,
      lng: 105.8285,
    },
  ];

  console.log('\n🗺️  TỌA ĐỘ VÀ ĐỊA ĐIỂM THỬ NGHIỆM:');
  console.log(`📍 Điểm lấy hàng: ${pickup.address} (${pickup.lat}, ${pickup.lng})`);
  console.log(`📍 Điểm giao hàng: ${delivery.address} (${delivery.lat}, ${delivery.lng})`);
  console.log('\n🛵 Danh sách Shipper Online đã chuẩn bị:');
  testShippers.forEach((s, idx) => {
    console.log(`   ${idx + 1}. [${s.id}] ${s.name} (${s.lat}, ${s.lng})`);
  });

  // 3. Khởi tạo dữ liệu mẫu trong DB & Redis
  const testOrderId = 'order-real-demo';

  console.log('\n🧹 Đang dọn dẹp và nạp dữ liệu sạch vào Database & Redis...');

  // Xóa sạch trạng thái cũ của đơn
  await redis.del(`order:pending_accept:${testOrderId}`);
  await redis.del(`order:candidates:${testOrderId}`);
  await redis.del(`order:offer_meta:${testOrderId}`);
  await redis.del(`tracking:route:${testOrderId}`);
  await redis.del(`order:retry:${testOrderId}`);

  // Dọn dẹp trạng thái cho từng tài xế
  for (const s of testShippers) {
    await redis.del(`shipper:cooldown:${s.id}`);
    await markShipperFree(s.id);

    // Tạo/Cập nhật shipper trong DB
    await prisma.shipper.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        phone: s.phone,
        status: 'ONLINE',
        vehicleType: 'motorbike',
      },
      create: {
        id: s.id,
        name: s.name,
        phone: s.phone,
        status: 'ONLINE',
        vehicleType: 'motorbike',
      },
    });

    // Đăng ký vị trí GPS vào Redis Geo
    await addShipperLocation(s.id, s.lng, s.lat);
  }
  console.log('✅ Đã nạp và cập nhật thành công 4 shipper lên DB & Redis Geo!');

  // Tạo đơn hàng mới ở trạng thái PENDING
  const order = await prisma.order.upsert({
    where: { id: testOrderId },
    update: {
      status: 'PENDING',
      pickupAddress: pickup.address,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      deliveryAddress: delivery.address,
      deliveryLat: delivery.lat,
      deliveryLng: delivery.lng,
      customerId: 'customer-demo-id',
      items: [
        { name: 'Phở Bò Tái Nạm', quantity: 2, note: 'Ít bánh, nhiều hành' },
        { name: 'Gỏi Cuốn Tôm Thịt', quantity: 1, note: 'Không lấy nước tương' },
        { name: 'Trà Đào Cam Sả', quantity: 2, note: 'Ít ngọt' }
      ]
    },
    create: {
      id: testOrderId,
      status: 'PENDING',
      pickupAddress: pickup.address,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      deliveryAddress: delivery.address,
      deliveryLat: delivery.lat,
      deliveryLng: delivery.lng,
      customerId: 'customer-demo-id',
      items: [
        { name: 'Phở Bò Tái Nạm', quantity: 2, note: 'Ít bánh, nhiều hành' },
        { name: 'Gỏi Cuốn Tôm Thịt', quantity: 1, note: 'Không lấy nước tương' },
        { name: 'Trà Đào Cam Sả', quantity: 2, note: 'Ít ngọt' }
      ]
    },
  });
  console.log(`✅ Đơn hàng #${order.id} được tạo thành công ở trạng thái PENDING`);

  // 4. Khởi chạy tìm kiếm Shipper bằng Redis GeoSearch
  console.log('\n============================================================');
  console.log('🔍 THỬ NGHIỆM: Tìm kiếm tài xế gần nhất qua Redis Geo...');
  console.log('============================================================');
  const rawNearby = await redis.geosearch(
    'shipper:locations',
    'FROMLONLAT',
    pickup.lng,
    pickup.lat,
    'BYRADIUS',
    3,
    'km',
    'WITHDIST',
    'WITHCOORD',
    'ASC'
  ) as [string, string, [string, string]][];

  console.log(`✅ Tìm thấy ${rawNearby.length} tài xế trong bán kính 3km:`);
  for (const item of rawNearby) {
    const [shipperId, distance, [lng, lat]] = item;
    const shipperDb = testShippers.find(s => s.id === shipperId);
    console.log(`   🛵 [${shipperId}] ${shipperDb?.name || 'Tài xế'} - Khoảng cách chim bay: ${parseFloat(distance).toFixed(2)} km (Tọa độ: ${lat}, ${lng})`);
  }

  // 5. Chạy luồng Dispatcher thực tế (GeoSearch + OSRM + Redis locks)
  console.log('\n============================================================');
  console.log('⚡ KHỞI CHẠY BỘ ĐIỀU PHỐI (DISPATCHER) CHẠY THỰC TẾ...');
  console.log('============================================================');

  const mockKafkaEvent = {
    version: 1,
    eventType: 'order.created',
    payload: {
      orderId: testOrderId,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
    },
  };

  await dispatcherService.dispatchOrder(mockKafkaEvent);

  // 6. Kiểm tra sự thay đổi trạng thái trong DB & Redis sau khi dispatch
  const updatedOrder = await prisma.order.findUnique({ where: { id: testOrderId } });
  console.log(`\n📊 TRẠNG THÁI HỆ THỐNG HIỆN TẠI (ĐANG CHỜ PHẢN HỒI):`);
  console.log(`🔹 DB Order Status: ${updatedOrder?.status} (Đúng chuẩn: WAITING_ACCEPTANCE)`);

  const pendingLock = await redis.get(`order:pending_accept:${testOrderId}`);
  console.log(`🔹 Redis Pending Accept Lock (Tài xế đang giữ chốt): "${pendingLock}"`);

  const offerMeta = await redis.get(`order:offer_meta:${testOrderId}`);
  console.log(`🔹 Redis Active Offer Meta: ${offerMeta}`);

  const candidates = await redis.get(`order:candidates:${testOrderId}`);
  console.log(`🔹 Redis Candidates Queue (Ứng viên xếp hàng còn lại): ${candidates}`);

  if (pendingLock) {
    console.log('\n============================================================');
    console.log(`💡 HƯỚNG DẪN TEST PHẢN HỒI CHO SHIPPER HIỆN TẠI [${pendingLock}]:`);
    console.log('============================================================');
    console.log('👉 TRÊN WINDOWS POWERSHELL (ACCEPT):');
    console.log(`Invoke-RestMethod -Uri "http://localhost:3000/api/dispatcher/respond" -Method Post -Headers @{"Content-Type"="application/json"} -Body '{"orderId": "${testOrderId}", "shipperId": "${pendingLock}", "action": "accept"}'`);

    console.log('\n👉 TRÊN WINDOWS POWERSHELL (REJECT):');
    console.log(`Invoke-RestMethod -Uri "http://localhost:3000/api/dispatcher/respond" -Method Post -Headers @{"Content-Type"="application/json"} -Body '{"orderId": "${testOrderId}", "shipperId": "${pendingLock}", "action": "reject"}'`);

    console.log('\n👉 TRÊN CMD / BASH / LINUX (ACCEPT):');
    console.log(`curl -X POST http://localhost:3000/api/dispatcher/respond -H "Content-Type: application/json" -d "{\\"orderId\\": \\"${testOrderId}\\", \\"shipperId\\": \\"${pendingLock}\\", \\"action\\": \\"accept\\"}"`);

    console.log('\n👉 TRÊN CMD / BASH / LINUX (REJECT):');
    console.log(`curl -X POST http://localhost:3000/api/dispatcher/respond -H "Content-Type: application/json" -d "{\\"orderId\\": \\"${testOrderId}\\", \\"shipperId\\": \\"${pendingLock}\\", \\"action\\": \\"reject\\"}"`);

    // 7. Hỗ trợ tự động phản hồi qua các tham số dòng lệnh
    // CLI Args: --action=accept hoặc --action=reject hoặc --action=timeout
    const actionArg = process.argv.find(arg => arg.startsWith('--action='));
    const selectedAction = actionArg ? actionArg.split('=')[1] : null;

    if (selectedAction === 'accept' || selectedAction === 'reject') {
      console.log(`\n⏳ [TỰ ĐỘNG] Đang chờ 3 giây rồi gửi hành động ${selectedAction.toUpperCase()}...`);
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        const response = await fetch('http://localhost:3000/api/dispatcher/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: testOrderId,
            shipperId: pendingLock,
            action: selectedAction
          })
        });
        const data = await response.json();
        console.log(`✅ [TỰ ĐỘNG] Kết quả phản hồi từ API:`, data);
      } catch (err: any) {
        console.error(`❌ [TỰ ĐỘNG] Lỗi khi gửi phản hồi:`, err.message);
      }
    } else if (selectedAction === 'timeout') {
      console.log(`\n⏰ [TIMEOUT MOCK] Đang chờ 32 giây để xem luồng timeout tự chuyển sang shipper tiếp theo...`);
      await new Promise(resolve => setTimeout(resolve, 32000));

      const finalOrder = await prisma.order.findUnique({ where: { id: testOrderId } });
      const finalLock = await redis.get(`order:pending_accept:${testOrderId}`);
      const finalCandidates = await redis.get(`order:candidates:${testOrderId}`);
      console.log(`\n📊 TRẠNG THÁI HỆ THỐNG SAU KHI TIMEOUT:`);
      console.log(`🔹 DB Order Status: ${finalOrder?.status}`);
      console.log(`🔹 Redis Pending Accept Lock (Tài xế mới giữ chốt): "${finalLock}"`);
      console.log(`🔹 Redis Candidates Queue còn lại: ${finalCandidates}`);
    } else {
      console.log('\n💡 Tip: Bạn có thể chạy kèm tham số tự động phản hồi:');
      console.log('   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/demo-integration-confirmation.ts --action=accept');
      console.log('   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/demo-integration-confirmation.ts --action=reject');
      console.log('   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/demo-integration-confirmation.ts --action=timeout');
    }
  }
}

main()
  .catch(console.error)
  .finally(() => {
    // Đóng connection để script kết thúc ngay lập tức mà không treo event loop
    prisma.$disconnect();
    redis.disconnect();
  });
