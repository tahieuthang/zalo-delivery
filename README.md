# Zalo-Delivery Backend

Backend service cho hệ thống giao hàng tích hợp Zalo, bao gồm webhook parser, dispatcher với OSRM routing, real-time tracking và revenue management.

## Stack

| Thành phần | Công nghệ |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | ExpressJS |
| Database | PostgreSQL 16 (Prisma ORM) |
| Cache / Geo | Redis 7 |
| Message Queue | Kafka (KRaft mode) |
| Routing Engine | OSRM (self-hosted, map data VN) |
| Real-time | Socket.io |
| Geocoding | Goong.io |

## Kiến trúc

Module Architecture thuần túy — mỗi module trong `src/modules/` tự quản lý `controller`, `service`, `repository`, `dto`, `types`, `index.ts`.

```
src/
├── config/       # Env config (Zod-validated)
├── shared/       # Errors, middleware, logger, utils
├── infra/        # DB, Redis, Kafka, OSRM clients
├── modules/      # webhook | order | dispatcher | shipper | tracking | revenue
└── routes/       # Route aggregator
```

## Khởi động nhanh

```bash
# Cài dependencies
pnpm install

# Khởi động infrastructure
docker compose up -d

# Dev server
pnpm dev
```

## Scripts

```bash
pnpm dev        # Development server (ts-node-dev)
pnpm build      # Compile TypeScript
pnpm start      # Run production build
pnpm lint       # ESLint
pnpm format     # Prettier
pnpm test       # Vitest
```

## Biến môi trường

Copy `.env.example` thành `.env` và điền giá trị:

```bash
cp .env.example .env
```

## Tài liệu

- [docs/project_structure.md](./docs/project_structure.md) — Cấu trúc thư mục chi tiết
- [docs/rules.md](./docs/rules.md) — Coding rules & conventions
- [docs/implementation_plan.md](./docs/implementation_plan.md) — Kế hoạch triển khai
- [docs/skills/](./docs/skills/) — Skills hướng dẫn cho AI agent
