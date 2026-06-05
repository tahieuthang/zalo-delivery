# 🛵 Hướng dẫn Kiểm thử Tích hợp (Phase 3 & Phase 4)

Tài liệu này hướng dẫn cách vận hành bộ script kiểm thử tích hợp thực tế cho luồng điều phối, phản hồi của shipper, mô phỏng hành trình GPS thời gian thực và kích hoạt hàng rào địa lý (geofencing) để tự động hoàn thành đơn hàng.

---

## 🛠️ Yêu cầu chuẩn bị

1. **Khởi động các dịch vụ Docker** (PostgreSQL, Redis, Kafka, OSRM):
   ```bash
   docker compose up -d
   ```
2. **Đảm bảo cấu trúc cơ sở dữ liệu đã khớp**:
   ```bash
   npx prisma db push
   ```

---

## 🚀 Trình tự thực hiện Kiểm thử

### Bước 1: Chạy API Server (Terminal 1)
Khởi chạy Express server tích hợp cổng giao tiếp Socket.io và Kafka Consumer:
```bash
npm run dev
```

### Bước 2: Chạy Shipper Simulator (Terminal 2)
Trình giả lập shipper sẽ lắng nghe sự kiện `order.assigned` từ Kafka và stream dữ liệu tọa độ GPS qua Socket.io:
```bash
npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/shipper-simulator.ts
```

### Bước 3: Vận hành kịch bản kiểm thử (Terminal 3)
Chạy script để nạp trạng thái shipper, phát hành đơn hàng mẫu và tự động/thủ công gửi phản hồi.
```bash
npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/demo-integration-confirmation.ts
```

Chúng ta có 3 kịch bản kiểm thử chính thông qua việc truyền tham số dòng lệnh `--action`:

#### Kịch bản A: Shipper chấp nhận đơn hàng (ACCEPT)
Tài xế chấp nhận đơn hàng, kích hoạt mô phỏng di chuyển thực tế từ OSRM, đi qua điểm lấy hàng và kết thúc tại điểm giao hàng để hoàn thành đơn.
```bash
npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/demo-integration-confirmation.ts --action=accept
```

#### Kịch bản B: Shipper từ chối đơn hàng (REJECT)
Tài xế gần nhất từ chối đơn hàng, bị đưa vào trạng thái Cooldown (chờ 15 phút), hệ thống tự động tìm và chuyển lời mời cho tài xế gần thứ nhì.
```bash
npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/demo-integration-confirmation.ts --action=reject
```

#### Kịch bản C: Hết hạn xác nhận đơn hàng (TIMEOUT)
Tài xế không phản hồi trong 30 giây, hệ thống tự động hủy lời mời và chuyển sang đề xuất cho tài xế tiếp theo.
```bash
npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/demo-integration-confirmation.ts --action=timeout
```

*Mẹo: Nếu chạy không kèm tham số `--action`, script sẽ in ra các dòng lệnh `curl` và `Powershell` tương ứng để bạn copy-paste gửi phản hồi thủ công.*

---

## 📊 Các lệnh kiểm tra & Xác thực

Sau khi chạy xong kịch bản, bạn có thể kiểm tra trạng thái lưu trữ qua các lệnh sau:

### 1. Kiểm tra trạng thái đơn hàng trong Database
```bash
docker exec zalo-delivery-postgres-1 psql -U postgres -d zalo_delivery -c "SELECT status, completed_at FROM orders WHERE id='order-real-demo';"
```
* Trạng thái mong muốn sau khi chạy xong kịch bản **ACCEPT**: `status: SUCCESS` và có điền mốc thời gian `completed_at`.
* Trạng thái sau kịch bản **REJECT / TIMEOUT** (với tài xế cuối cùng): `status: NO_SHIPPER`.

### 2. Kiểm tra Tọa độ & Vị trí di chuyển của Shipper (Thời gian thực & Lịch sử hành trình)

#### A. Kiểm tra vị trí LIVE thời gian thực trên Redis Geo
Khi tài xế simulator đang chạy di chuyển, tọa độ liên tục được đẩy lên Redis. Bạn có thể truy vấn:
* Lấy vị trí thời gian thực của tài xế cụ thể:
  ```bash
  docker exec zalo-delivery-redis-1 redis-cli GEOPOS shipper:locations shipper-real-demo-4
  ```
* Tìm kiếm các tài xế xung quanh tọa độ cụ thể:
  ```bash
  docker exec zalo-delivery-redis-1 redis-cli GEOSEARCH shipper:locations FROMLONLAT 106.699066 10.779786 BYRADIUS 5 km WITHCOORD WITHDIST
  ```

#### B. Kiểm tra Lịch sử hành trình lưu trong PostgreSQL (Trajectory)
Hệ thống tự động gom cụm lưu lịch sử hành trình (cứ mỗi 10 điểm tọa độ sẽ ghi hàng loạt xuống DB một lần):
```bash
docker exec zalo-delivery-postgres-1 psql -U postgres -d zalo_delivery -c "SELECT order_id, shipper_id, lat, lng, created_at FROM trajectory_points ORDER BY created_at DESC LIMIT 10;"
```

### 3. Kiểm tra thông điệp hoàn thành đơn trên Kafka (`order.completed`)
Khi đơn hàng hoàn tất, sự kiện doanh thu sẽ được xuất bản sang Kafka:
```bash
docker exec zalo-delivery-kafka-1 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic order.completed --from-beginning --max-messages 5
```

### 4. Kiểm tra danh sách topic hiện có trong Kafka
```bash
docker exec zalo-delivery-kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
```
