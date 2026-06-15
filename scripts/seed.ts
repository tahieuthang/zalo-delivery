import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Tạo shippers mẫu
  const shippers = [
    { id: ulid(), name: 'Nguyễn Văn An (Ngõ 186 Đ. Phan Trọng Tuệ, Huỳnh Cung, Thanh Trì, Hà Nội, Việt Nam)', phone: '0977044573', vehicleType: 'motorbike' },
    { id: ulid(), name: 'Trần Thị Bình (XR5F+H3V, P. Bằng Liệt, Khu đô thị Tây Nam Linh Đàm, Hoàng Liệt, Hà Nội, Việt Nam)', phone: '0977044573', vehicleType: 'motorbike' },
    { id: ulid(), name: 'Lê Văn Cường (32 P. Linh Đường, Hoàng Liệt, Hà Nội, Việt Nam)', phone: '0977044573', vehicleType: 'bicycle' },
  ];

  for (const shipper of shippers) {
    await prisma.shipper.upsert({
      where: { phone: shipper.phone },
      update: {},
      create: shipper,
    });
  }

  console.log(`✅ Created ${shippers.length} shippers`);
  console.log('🎉 Seed complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
