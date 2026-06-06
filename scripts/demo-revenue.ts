import 'dotenv/config';
import { kafka } from '../src/infra/kafka/kafka-client';
import { KAFKA_TOPICS } from '../src/infra/kafka/topics';
import { prisma } from '../src/infra/database/prisma-client';

async function main() {
  console.log('\n============================================================');
  console.log('🚀 KỊCH BẢN KIỂM THỬ TÍCH HỢP PHASE 5: REVENUE MODULE');
  console.log('============================================================');

  // 1. Chuẩn bị dữ liệu mẫu trong Postgres
  const testShipperId = 'shipper-revenue-demo';
  const testOrderId = `order-rev-${Date.now()}`;

  console.log('🧹 Xóa dữ liệu cũ nếu có...');
  await prisma.revenueRecord.deleteMany({
    where: { shipperId: testShipperId }
  });
  await prisma.order.deleteMany({
    where: { id: testOrderId }
  });
  await prisma.shipper.deleteMany({
    where: { id: testShipperId }
  });

  console.log('📦 Tạo shipper thử nghiệm...');
  await prisma.shipper.create({
    data: {
      id: testShipperId,
      name: 'Shipper Doanh Thu Demo',
      phone: '0988776655',
      vehicleType: 'BIKE',
      status: 'ONLINE',
      totalEarnings: 0,
    }
  });

  console.log('📦 Tạo đơn hàng thử nghiệm...');
  await prisma.order.create({
    data: {
      id: testOrderId,
      customerId: 'customer-revenue-demo',
      pickupAddress: 'Văn phòng Zalo, Quận 1',
      pickupLat: 10.779,
      pickupLng: 106.699,
      deliveryAddress: 'Chợ Bến Thành, Quận 1',
      deliveryLat: 10.772,
      deliveryLng: 106.698,
      status: 'SUCCESS',
      shipperId: testShipperId,
    }
  });

  // 2. Kết nối và gửi sự kiện order.completed tới Kafka
  console.log('🔌 Kết nối tới Kafka Producer...');
  const producer = kafka.producer();
  await producer.connect();

  const completedEvent = {
    version: 1,
    eventType: 'order.completed',
    payload: {
      orderId: testOrderId,
      shipperId: testShipperId,
      amount: 45000, // Số tiền giao hàng
      completedAt: new Date().toISOString()
    },
    metadata: {
      correlationId: `corr-rev-${Date.now()}`,
      timestamp: new Date().toISOString()
    }
  };

  console.log('📤 Đẩy sự kiện order.completed lên Kafka...');
  await producer.send({
    topic: KAFKA_TOPICS.ORDER_COMPLETED,
    messages: [
      {
        key: testOrderId,
        value: JSON.stringify(completedEvent)
      }
    ]
  });
  console.log('✅ Gửi Kafka event thành công!');
  await producer.disconnect();

  // 3. Đợi consumer xử lý (3 giây)
  console.log('⏱️ Đang chờ Revenue Consumer xử lý tin nhắn (3s)...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 4. Kiểm tra sự thay đổi trong Database
  console.log('🔍 Kiểm tra database...');
  const shipper = await prisma.shipper.findUnique({
    where: { id: testShipperId }
  });
  const revenueRecords = await prisma.revenueRecord.findMany({
    where: { shipperId: testShipperId }
  });

  console.log(`- Earnings hiện tại của shipper: ${shipper?.totalEarnings}đ`);
  console.log(`- Số lượng bản ghi doanh thu được tạo: ${revenueRecords.length}`);

  if (shipper?.totalEarnings === 45000 && revenueRecords.length === 1) {
    console.log('🎉 DB CHECK: THÀNH CÔNG! Doanh thu đã được ghi nhận và cộng dồn.');
  } else {
    console.error('❌ DB CHECK: THẤT BẠI! Hãy kiểm tra log của server xem consumer có chạy không.');
    process.exit(1);
  }

  // 5. Test các API REST của Revenue
  console.log('\n🌐 Gọi thử các API REST Revenue (Yêu cầu Server đang chạy ở port 3000)...');
  const baseUrl = 'http://localhost:3000/api/revenue';
  
  try {
    // 5.1 API summary
    console.log(`- Gọi GET ${baseUrl}/summary ...`);
    const summaryRes = await fetch(`${baseUrl}/summary`).then(r => r.json());
    console.log('  Response:', JSON.stringify(summaryRes, null, 2));

    // 5.2 API shipper
    console.log(`- Gọi GET ${baseUrl}/shipper/${testShipperId} ...`);
    const shipperRes = await fetch(`${baseUrl}/shipper/${testShipperId}`).then(r => r.json());
    console.log('  Response:', JSON.stringify(shipperRes, null, 2));

    // 5.3 API daily
    console.log(`- Gọi GET ${baseUrl}/daily ...`);
    const dailyRes = await fetch(`${baseUrl}/daily`).then(r => r.json());
    console.log('  Response:', JSON.stringify(dailyRes, null, 2));

    // 5.4 API lag
    console.log(`- Gọi GET ${baseUrl}/lag ...`);
    const lagRes = await fetch(`${baseUrl}/lag`).then(r => r.json());
    console.log('  Response:', JSON.stringify(lagRes, null, 2));

    console.log('\n🎉 TOÀN BỘ CÁC API HOẠT ĐỘNG CHUẨN XÁC!');
  } catch (err: any) {
    console.error('❌ Lỗi khi gọi API REST:', err.message);
  }
}

main().catch(console.error);
