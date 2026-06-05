import { createNotificationService } from '../src/infra/notification';

/**
 * =====================================================================================
 * HƯỚNG DẪN CHẠY KỊCH BẢN MÔ PHỎNG IN-MEMORY (DEMO MOCK/IN-MEMORY CONFIRMATION)
 * =====================================================================================
 *
 * 1. Đây là tệp kiểm thử độc lập (Stand-alone simulation) KHÔNG cần kết nối Docker,
 *    không cần chạy PostgreSQL, Redis hay OSRM thật. Nó giả lập toàn bộ hành vi của 
 *    hệ thống trực tiếp trên bộ nhớ (In-memory Map).
 *
 * 2. Lệnh thực thi:
 *    npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/demo-inmemory-confirmation.ts
 *
 * =====================================================================================
 */

// Mock DB and Redis State
const mockDB = {
  order: {
    id: 'order-101',
    status: 'PENDING',
    pickupAddress: '123 Lê Lợi, Quận 1',
    deliveryAddress: '456 Nguyễn Huệ, Quận 1',
    shipperId: null as string | null,
  },
  shipper: {
    id: 'shipper-1',
    name: 'Nguyễn Văn Hùng',
    phone: '0912345678',
    zaloUserId: 'zalo-hung-123',
    status: 'ONLINE',
  },
};

const mockRedis = new Map<string, string>();
const notificationService = createNotificationService();

function printHeader(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`🔥 DEMO: ${title}`);
  console.log('='.repeat(60));
}

async function runDemo() {
  printHeader('BƯỚC 1: HỆ THỐNG PHÁT HIỆN ĐƠN MỚI & TÌM SHIPPER GẦN NHẤT');
  console.log(`[DATABASE] Đơn hàng #${mockDB.order.id} được tạo ở trạng thái: ${mockDB.order.status}`);
  console.log(`[GEOSEARCH] Đang tìm shipper trong bán kính 3km...`);
  console.log(`[OSRM] Đang tính toán quãng đường tối ưu...`);
  
  // Giả lập tìm được Nguyễn Văn Hùng cách 1.2km
  const distance = 1200; // 1.2km
  const duration = 240; // 4 phút
  console.log(`🎯 Đã chọn shipper tối ưu nhất: ${mockDB.shipper.name} (Cách ${distance}m, di chuyển ~${Math.round(duration / 60)} phút)`);

  printHeader('BƯỚC 2: GỬI OFFER ĐỀ NGHỊ NHẬN ĐƠN (WAITING_ACCEPTANCE)');
  // Chuyển status đơn
  mockDB.order.status = 'WAITING_ACCEPTANCE';
  console.log(`[DATABASE] Cập nhật đơn hàng #${mockDB.order.id} sang trạng thái: ${mockDB.order.status}`);
  
  // Set lock 30s trong Redis
  const pendingKey = `order:pending_accept:${mockDB.order.id}`;
  mockRedis.set(pendingKey, mockDB.shipper.id);
  console.log(`[REDIS] Đã thiết lập Lock Key: "${pendingKey}" = "${mockDB.shipper.id}" (TTL: 30s)`);
  
  // Cache candidates
  const candidatesKey = `order:candidates:${mockDB.order.id}`;
  mockRedis.set(candidatesKey, JSON.stringify([mockDB.shipper.id]));
  console.log(`[REDIS] Đã cache candidates list vào: "${candidatesKey}"`);

  // Bắn tin nhắn đề nghị
  await notificationService.sendOrderOffer(mockDB.shipper as any, {
    ...mockDB.order,
    distance,
    duration,
  } as any);
  
  console.log(`⏰ [SYSTEM] Khởi động bộ đếm thời gian 30 giây...`);

  printHeader('BƯỚC 3.1: GIẢ LẬP SHIPPER CHỌN "ACCEPT"');
  console.log(`[ACTION] Shipper ${mockDB.shipper.name} nhấn nút [✅ Nhận đơn] trên màn hình Zalo OA`);
  
  // Kiểm tra lock trong Redis
  const lockedShipper = mockRedis.get(pendingKey);
  if (lockedShipper === mockDB.shipper.id) {
    console.log(`[REDIS] Xác thực thành công: Shipper khớp với Lock Key (Đang được offer)`);
    
    // Giải phóng lock
    mockRedis.delete(pendingKey);
    mockRedis.delete(candidatesKey);
    console.log(`[REDIS] Đã giải phóng Lock Key "${pendingKey}" và danh sách cache`);
    
    // Cập nhật Database
    mockDB.order.status = 'ASSIGNED';
    mockDB.order.shipperId = mockDB.shipper.id;
    console.log(`[DATABASE] Cập nhật đơn #${mockDB.order.id} thành công sang: ${mockDB.order.status} (Shipper: ${mockDB.shipper.name})`);
    
    // Đánh dấu shipper bận
    console.log(`[REDIS] Đánh dấu shipper busy: SADD shipper:busy ${mockDB.shipper.id}`);
    
    // Publish Kafka
    console.log(`[KAFKA] Đã publish event "order.assigned" thành công lên Kafka topic: order.assigned`);
    
    // Bắn tin nhắn xác nhận
    await notificationService.sendAcceptConfirm(mockDB.shipper as any, mockDB.order as any);
  } else {
    console.log(`❌ [ERROR] Offer đã hết hạn hoặc shipper không hợp lệ!`);
  }

  // Reset đơn hàng về trạng thái để test Case Reject
  mockDB.order.status = 'WAITING_ACCEPTANCE';
  mockDB.order.shipperId = null;
  mockRedis.set(pendingKey, mockDB.shipper.id);

  printHeader('BƯỚC 3.2: GIẢ LẬP SHIPPER CHỌN "REJECT" HOẶC QUÁ 30S TIMEOUT');
  console.log(`[ACTION] Shipper ${mockDB.shipper.name} từ chối đơn hàng hoặc không đưa ra phản hồi sau 30 giây`);
  
  const lockedShipperReject = mockRedis.get(pendingKey);
  if (lockedShipperReject === mockDB.shipper.id) {
    console.log(`[REDIS] Xác thực thành công cho yêu cầu reject`);
    
    // Giải phóng lock
    mockRedis.delete(pendingKey);
    
    // Cooldown shipper 15 phút
    const cooldownKey = `shipper:cooldown:${mockDB.shipper.id}`;
    mockRedis.set(cooldownKey, '1');
    console.log(`[REDIS] Đã cooldown shipper ${mockDB.shipper.name} trong 15 phút: Key "${cooldownKey}" = "1"`);
    
    // Bắn tin nhắn từ chối
    await notificationService.sendRejectConfirm(mockDB.shipper as any, mockDB.order.id);
    
    // Đi tìm shipper tiếp theo
    console.log(`[SYSTEM] Lấy shipper tiếp theo từ Redis candidates list...`);
    console.log(`[SYSTEM] Không còn shipper nào khác gần đây. Kích hoạt logic tự động retry sau 30s.`);
  }

  printHeader('DEMO KẾT THÚC THÀNH CÔNG 🎉');
}

runDemo().catch(console.error);
