import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Tạo shippers mẫu
  const shippers = [
    { id: ulid(), name: 'Nguyễn Văn An', phone: '0901111111', vehicleType: 'motorbike' },
    { id: ulid(), name: 'Trần Thị Bình', phone: '0902222222', vehicleType: 'motorbike' },
    { id: ulid(), name: 'Lê Văn Cường', phone: '0903333333', vehicleType: 'bicycle' },
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
