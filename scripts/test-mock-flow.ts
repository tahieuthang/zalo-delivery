import 'dotenv/config';
import { prisma } from '../src/infra/database/prisma-client';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const url = 'http://localhost:3000/api/webhooks/zalo';

  console.log('=== BƯỚC 1: GIẢ LẬP SỰ KIỆN SHIPPER FOLLOW ZALO OA ===');
  const followPayload = {
    app_id: '3512689380793092386',
    event_name: 'follow',
    timestamp: '1781969988010',
    follower: { id: 'shipper-zalo-id-999' }
  };

  const followRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(followPayload),
  });
  const followData = await followRes.json();
  console.log('Response từ Webhook:', JSON.stringify(followData, null, 2));

  // Kiểm tra database xem có shipper nào đã được liên kết zaloUserId = shipper-zalo-id-999 chưa
  const shipper = await prisma.shipper.findFirst({
    where: { zaloUserId: 'shipper-zalo-id-999' }
  });
  if (shipper) {
    console.log(`\u2705 Thành công: Shipper [${shipper.name}] (ID: ${shipper.id}) đã được liên kết với Zalo ID: shipper-zalo-id-999`);
  } else {
    console.log('\u274c Cảnh báo: Không tìm thấy Shipper được liên kết trong DB. (Có thể tất cả Shipper đã được liên kết trước đó, hoặc DB chưa có Shipper mẫu nào).');
  }

  await delay(1000);

  console.log('\n=== BƯỚC 2: GIẢ LẬP KHÁCH HÀNG NHẮN TIN ĐẶT ĐƠN ===');
  const orderPayload = {
    app_id: '3512689380793092386',
    event_name: 'user_send_text',
    timestamp: '1781969988010',
    sender: { id: 'customer-zalo-id-111' },
    message: {
      msg_id: 'msg-order-' + Date.now(),
      text: 'Tên: Trần Thị B\nSĐT: 0987654321\nĐịa chỉ: Chung cư Đại Thanh, Thanh Trì, Hà Nội\nMón: 1 Cơm tấm sườn'
    }
  };

  const orderRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload),
  });
  const orderData: any = await orderRes.json();
  console.log('Response từ Webhook:', JSON.stringify(orderData, null, 2));

  const orderId = orderData.data?.orderId;
  if (!orderId) {
    console.error('\u274c Lỗi: Không thể lấy được Order ID từ phản hồi Webhook.');
    process.exit(1);
  }
  console.log(`\u2705 Đơn hàng được tạo thành công! Order ID: ${orderId}`);

  // Đợi 2 giây để Dispatcher Service xử lý điều phối (tìm kiếm shipper gần nhất và gửi đề nghị)
  console.log('\u23f3 Chờ 2 giây để hệ thống điều phối...');
  await delay(2000);

  // Tìm shipper được hệ thống gửi đề nghị (trong order_offer_logs)
  const activeOffer = await prisma.orderOfferLog.findFirst({
    where: { orderId },
    orderBy: { createdAt: 'desc' }
  });

  if (activeOffer) {
    console.log(`\u2139 Tìm thấy shipper được gửi offer: ${activeOffer.shipperId}. Tiến hành liên kết Zalo ID với shipper này...`);
    // Gỡ liên kết Zalo ID khỏi các shipper khác để tránh lỗi unique constraint
    await prisma.shipper.updateMany({
      where: { zaloUserId: 'shipper-zalo-id-999' },
      data: { zaloUserId: null }
    });
    // Gán Zalo ID cho shipper nhận offer
    await prisma.shipper.update({
      where: { id: activeOffer.shipperId },
      data: { zaloUserId: 'shipper-zalo-id-999' }
    });
    console.log(`\u2705 Liên kết thành công shipper ID [${activeOffer.shipperId}] với Zalo ID: shipper-zalo-id-999`);
  } else {
    console.log('\u26a0\ufe0f Cảnh báo: Không tìm thấy offer nào được gửi cho đơn hàng này.');
  }

  console.log('\n=== BƯỚC 3: GIẢ LẬP SHIPPER CHẤP NHẬN ĐƠN (ACCEPT) ===');
  const acceptPayload = {
    app_id: '3512689380793092386',
    event_name: 'user_send_text',
    timestamp: '1781969988010',
    sender: { id: 'shipper-zalo-id-999' },
    message: {
      msg_id: 'msg-accept-' + Date.now(),
      text: `#accept:${orderId}`
    }
  };

  const acceptRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(acceptPayload),
  });
  const acceptData = await acceptRes.json();
  console.log('Response từ Webhook:', JSON.stringify(acceptData, null, 2));

  await delay(1000);

  // Truy vấn lại đơn hàng trong database để kiểm tra trạng thái mới
  const updatedOrder = await prisma.order.findUnique({
    where: { id: orderId }
  });
  console.log('\n=== KẾT QUẢ CUỐI CÙNG TRONG DATABASE ===');
  console.log(`- Trạng thái Đơn hàng: ${updatedOrder?.status}`);
  console.log(`- Shipper được gán: ${updatedOrder?.shipperId || 'Chưa gán'}`);
  const statusStr = String(updatedOrder?.status);
  if (statusStr === 'ASSIGNED' || statusStr === 'DELIVERING' || updatedOrder?.shipperId) {
    console.log('\ud83c\udf89 GIẢ LẬP THÀNH CÔNG RỰC RỠ! Đơn hàng đã được shipper nhận giao.');
  } else {
    console.log('\u26a0\ufe0f Trạng thái đơn chưa đổi. (Điều này bình thường nếu thuật toán điều phối chọn shipper khác gần hơn hoặc shipper chưa được phân phối, hãy kiểm tra logs backend để biết thêm chi tiết).');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
