# Kiến Trúc Kỹ Thuật Phase 2.5 — Shipper Confirmation Flow

Tài liệu này trình bày chi tiết về luồng nghiệp vụ **Shipper Confirmation (Xác nhận đơn hàng)** và vai trò của các công nghệ trong kiến trúc hệ thống của **Phase 2.5** thuộc dự án Zalo Delivery Backend.

---

## 🏗️ Luồng Xử Lý Chi Tiết Từng Bước (Step-by-Step Flow)

Quy trình gán đơn tự động (Auto-Assign) của Phase 2 được nâng cấp thành luồng chào đơn kèm cơ chế xác nhận/từ chối từ shipper (Accept/Reject/Timeout). Luồng xử lý diễn ra chi tiết qua các bước sau:

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
        D->>R: Thiết lập khóa Lock 30s (order:pending_accept:{orderId} = shipperId)
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

---

## 🛠️ Vai Trò Của Các Tech Stack Chính Trong Phase 2.5

Mỗi công nghệ được sử dụng đóng vai trò quan trọng trong việc xây dựng luồng nghiệp vụ tin cậy, không nghẽn và có độ bền bỉ cao:

### 1. Redis (Cache, State Sets, Locks & TTL)
Redis đóng vai trò là **trung tâm quản lý trạng thái động và đồng bộ hóa thời gian thực** (Real-time State & Synchronization Hub):
*   **Atomic Lock (`order:pending_accept:{orderId}`)**: Sử dụng TTL 30 giây làm chốt khóa nguyên tử. Nó đảm bảo **chỉ duy nhất một shipper** có quyền phản hồi đơn hàng tại một thời điểm, ngăn chặn tuyệt đối lỗi race condition (nhiều shipper cùng nhận một đơn).
*   **Candidates Cache Queue (`order:candidates:{orderId}`)**: Lưu trữ danh sách ứng viên tiềm năng dạng JSON. Khi shipper trước từ chối, dispatcher chỉ việc pop ứng viên tiếp theo từ Redis thay vì phải quét lại Geo và gọi lại OSRM API, giúp **giảm thiểu 80% độ trễ (latency)** và tiết kiệm tài nguyên mạng.
*   **State Tracker (`shipper:busy`)**: Theo dõi các shipper đang làm việc để loại trừ khỏi danh sách tìm kiếm.
*   **Cooldown Manager (`shipper:cooldown:{shipperId}`)**: Sử dụng khóa tự động phân rã với TTL 900 giây (15 phút) làm bộ nhớ tạm, giúp hệ thống **tự động bỏ qua** shipper vừa từ chối đơn hàng mà không cần thực hiện truy vấn DB phức tạp.

### 2. PostgreSQL & Prisma ORM
Đóng vai trò là **Nguồn dữ liệu chuẩn duy nhất (Single Source of Truth)**:
*   Đảm bảo tính nhất quán dữ liệu giao dịch của đơn hàng khi thay đổi trạng thái chuyển tiếp (`PENDING` ➔ `WAITING_ACCEPTANCE` ➔ `ASSIGNED`).
*   Lưu trữ trường định danh duy nhất `zaloUserId` của shipper để phục vụ việc mapping và giao tiếp thật với Zalo OA ở các phase sau.

### 3. Kafka (Event-driven Messaging)
Đóng vai trò là **Bộ truyền tin phi liên kết (Decoupling & Event Pipeline)**:
*   Khi shipper accept đơn hàng, hệ thống phát sự kiện `order.assigned` lên Kafka. Các module ăn theo (Geofencing, Live Simulator, Revenue) sẽ tiêu thụ sự kiện này một cách bất đồng bộ. Điều này giúp dispatcher giải phóng tài nguyên cực nhanh, phản hồi HTTP cho shipper trong vòng vài mili-giây mà không bị block bởi các tiến trình xử lý sau đó.

### 4. OSRM (Open Source Routing Machine)
Đóng vai trò là **Bộ não tính toán lộ trình tối ưu**:
*   Tính toán khoảng cách di chuyển thực tế trên bản đồ đường bộ Việt Nam cùng thời gian lái xe dự kiến thay vì tính theo đường chim bay thẳng, mang lại độ chính xác tuyệt đối khi phân phối đơn.

### 5. Strategy Pattern (TypeScript Architecture)
Đóng vai trò là **Khung thiết kế trừu tượng linh hoạt**:
*   Tách biệt hoàn toàn tầng giao tiếp tin nhắn thông qua `INotificationService`.
*   Giúp dự án phát triển theo mô hình **Mock-first** tin cậy: toàn bộ core logic nghiệp vụ phức tạp được viết và unit test kỹ càng trên máy local thông qua Console Provider mà không cần phụ thuộc hay chờ đợi kết nối mạng / tài khoản Zalo OA thật của doanh nghiệp.

---
