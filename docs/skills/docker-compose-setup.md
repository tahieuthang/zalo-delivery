# Skill: docker-compose-setup

## Description
Setup hoặc cập nhật `docker-compose.yml` cho các infrastructure services của dự án: PostgreSQL, Redis, Kafka (KRaft mode, không cần Zookeeper), và OSRM. Bao gồm healthcheck và volume persistence.

---

## Trigger
Khi cần thêm, sửa, hoặc khởi tạo infrastructure services trong môi trường development.

---

## Template hoàn chỉnh

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    ports: ['5432:5432']
    environment:
      POSTGRES_DB: zalo_delivery
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - redisdata:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  kafka:
    image: apache/kafka:3.8.0
    ports: ['9092:9092']
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_LOG_DIRS: /tmp/kraft-logs
      CLUSTER_ID: 'zalo-delivery-cluster-001'
    healthcheck:
      test: ['CMD-SHELL', '/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092']
      interval: 10s
      timeout: 10s
      retries: 5

  osrm:
    image: osrm/osrm-backend
    ports: ['5000:5000']
    volumes:
      - ./osrm-data:/data
    command: osrm-routed --algorithm mld /data/vietnam-latest.osrm
    # Lưu ý: chạy osrm-extract + partition + customize trước (xem skill osrm-route.md)

volumes:
  pgdata:
  redisdata:
```

---

## Thêm service mới

Khi thêm service mới vào `docker-compose.yml`, luôn thêm:
1. `healthcheck` để các service phụ thuộc biết khi nào sẵn sàng
2. `volumes` nếu cần persist data
3. Update `.env.example` với biến kết nối tương ứng

Ví dụ thêm Kafka UI (Kafdrop):
```yaml
  kafdrop:
    image: obsidiandynamics/kafdrop:latest
    ports: ['9000:9000']
    environment:
      KAFKA_BROKERCONNECT: kafka:9092
    depends_on:
      kafka:
        condition: service_healthy
```

---

## Checklist
- [ ] Mọi service có `healthcheck`
- [ ] Data volume được đặt tên (không dùng bind mount cho data)
- [ ] Kafka dùng KRaft mode (không có Zookeeper)
- [ ] Biến môi trường kết nối được update trong `.env.example`
- [ ] `docker compose up -d && docker compose ps` → tất cả `healthy`
