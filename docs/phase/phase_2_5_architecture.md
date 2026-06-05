# 🛠️ Phase 2.5 Architecture: Shipper Confirmation Flow

Bản tài liệu này phân tích chi tiết **luồng xử lý xác nhận đơn hàng (Shipper Confirmation Flow)** của Phase 2.5 và vai trò của từng công nghệ trong **Tech Stack** để hiện thực hóa việc chào đơn hàng và nhận phản hồi chấp nhận hoặc từ chối từ tài xế.

---

## 🔄 1. Luồng xử lý dữ liệu của Phase 2.5 (End-to-End Flow)

Sự nâng cấp từ luồng tự động gán đơn sang quy trình chào đơn kèm cơ chế phản hồi (Accept/Reject/Timeout) được vận hành mượt mà nhờ sự phối hợp của các cấu phần hệ thống:

```mermaid
sequenceDiagram
    autonumber
    participant K as Kafka / Trigger API
    participant D as Dispatcher Service
    participant R as Redis Storage
    participant P as PostgreSQL (Prisma)
    participant N as Notification Service
    participant S as Shipper (Zalo/REST API)

    K->>D: Phát sự kiện order.created
    D->>R: GEOSEARCH shipper:locations (Tìm top 5 shipper gần 3km)
    R-->>D: Trả về danh sách shipper online
    D->>R: Lọc shipper bận (shipper:busy) & Cooldown (shipper:cooldown)
    D->>D: Gọi OSRM tính quãng đường & Sort shipper theo thời gian di chuyển
    D->>R: Cache danh sách ứng viên đã sắp xếp (order:candidates:{orderId})
    
    rect rgb(240, 248, 255)
        Note over D, N: Quy trình chào đơn (Offer Flow)
        D->>R: Pop lấy ứng viên đầu tiên trong cache
        D->>P: Cập nhật đơn hàng: status = WAITING_ACCEPTANCE
        D->>R: Thiết lập khóa Lock 35s (order:pending_accept:{orderId} = shipperId)
        D->>R: Lưu trữ metadata đơn (order:offer_meta:{orderId})
        D->>N: notificationService.sendOrderOffer()
        N-->>S: Gửi tin nhắn chào đơn (Mock Console / Zalo OA)
        D->>D: Khởi động Timeout 30 giây (setTimeout)
    end

    alt Kịch bản ACCEPT (Nhận đơn)
        S->>D: Gửi yêu cầu Accept (REST API / Webhook)
        D->>R: Kiểm tra Lock key (order:pending_accept:{orderId} == shipperId?)
        Note over D, R: Xác thực shipper hợp lệ & offer còn hạn
        D->>R: Hủy Lock key & xóa candidates cache list
        D->>P: Cập nhật đơn hàng: status = ASSIGNED, shipperId = X
        D->>R: Thêm shipper vào Set (shipper:busy)
        D->>K: Publish event "order.assigned" lên Kafka
        D->>N: Gửi tin nhắn xác nhận nhận đơn thành công
    else Kịch bản REJECT (Từ chối) hoặc TIMEOUT (Quá 30s)
        S->>D: Gửi yêu cầu Reject hoặc Hết 30s Lock hết hạn
        D->>R: Hủy Lock key & xóa metadata
        D->>R: Cooldown shipper 15 phút (shipper:cooldown:{shipperId} = 1, TTL 900s)
        D->>N: Gửi tin nhắn từ chối / hết hạn cho shipper
        D->>D: Tự động rút ứng viên tiếp theo trong cache & chào đơn tiếp (Quay lại Bước 7)
    end
```

### Chi tiết từng bước trong luồng:
1.  **Tính toán và lập hàng đợi ứng viên (Candidate Queue Setup)**:
    *   Khi có sự kiện `order.created`, hệ thống tìm kiếm shipper rảnh lân cận qua Redis Geo, lọc cooldown và dùng OSRM sắp xếp ứng viên theo thời gian di chuyển.
    *   Cache toàn bộ danh sách đã lọc vào Redis key `order:candidates:{orderId}` để tránh tính toán lại khi shipper từ chối.
2.  **Gửi Offer và Khóa đơn (Offer Flow & Lock)**:
    *   Rút (pop) ứng viên tốt nhất ra khỏi hàng đợi. Cập nhật trạng thái đơn sang `WAITING_ACCEPTANCE`.
    *   Tạo khóa Lock nguyên tử `order:pending_accept:{orderId}` lưu ID tài xế với TTL 35 giây (chứa 5 giây buffer tránh race condition) và kích hoạt đếm ngược 30 giây trên Node.js Event Loop.
    *   Gửi thông báo chào đơn qua `notificationService`.
3.  **Xử lý Chấp nhận (Accept Flow)**:
    *   Khi tài xế chấp nhận trong thời gian hạn định, kiểm tra tính hợp lệ của Lock key.
    *   Xóa Lock, xóa danh sách candidates cache và chuyển trạng thái đơn hàng sang `ASSIGNED`. Đánh dấu shipper bận (`shipper:busy`) và bắn sự kiện `order.assigned` lên Kafka.
4.  **Xử lý Từ chối / Hết hạn (Reject & Timeout Flow)**:
    *   Nếu tài xế từ chối hoặc hết 30 giây mà không phản hồi, Lock bị giải phóng.
    *   Tài xế nhận đơn sẽ bị đưa vào danh sách cooldown (`shipper:cooldown:{shipperId}`) trong 15 phút.
    *   Hệ thống tự động lấy ứng viên tiếp theo từ Redis candidates cache và tiếp tục gửi offer chào đơn.

---

## 💻 2. Vai trò của Tech Stack chính trong Phase 2.5

| Công nghệ | Vai trò chủ chốt trong Phase 2.5 | Tại sao lại quan trọng? |
|---|---|---|
| **Redis** | *Khóa Lock nguyên tử, Hàng đợi Candidates & Cooldown* | Khóa `order:pending_accept` đảm bảo chỉ một shipper được chấp nhận tại một thời điểm. Hàng đợi `order:candidates` lưu danh sách shipper giúp tiết kiệm **80% độ trễ** do không phải tính toán lại OSRM. Khóa `shipper:cooldown` tự phân rã bằng TTL giúp lọc shipper từ chối đơn hiệu quả. |
| **PostgreSQL & Prisma** | *Nguồn dữ liệu chuẩn (Single Source of Truth)* | Đồng bộ trạng thái đơn hàng chính xác thông qua các bước chuyển đổi (`PENDING` $\rightarrow$ `WAITING_ACCEPTANCE` $\rightarrow$ `ASSIGNED`). Quản lý trường `zaloUserId` làm căn cứ gửi tin nhắn thật qua Zalo OA. |
| **Kafka (Broker)** | *Truyền sự kiện bất đồng bộ khi gán đơn thành công* | Phát sự kiện `order.assigned` khi shipper đồng ý nhận đơn, giúp giải phóng tiến trình HTTP phản hồi nhanh cho tài xế và kích hoạt bất đồng bộ các module Geofencing, Revenue xử lý phía sau. |
| **OSRM Engine** | *Bộ tính toán và tối ưu lộ trình* | Định tuyến đường đi thực tế để sắp xếp danh sách tài xế theo thời gian di chuyển, đảm bảo thứ tự offer tài xế là tối ưu nhất. |
| **Strategy Pattern (TypeScript)** | *Kiến trúc trừu tượng cho thông báo* | Cho phép thiết lập luồng **Mock-first** qua `ConsoleNotificationService` để kiểm thử toàn bộ logic nghiệp vụ mà không cần phụ thuộc hay chờ kết nối thật đến Zalo OA API. |
