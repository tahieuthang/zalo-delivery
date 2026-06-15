import 'dotenv/config';
import { geocode } from '../src/infra/geocoding/geocoding.service';

async function main() {
  const address = 'Huỳnh Cung, Tam Hiệp, Thanh Trì, Hà Nội';
  console.log(`Geocoding address: "${address}"...`);
  const result = await geocode(address);
  console.log('Result:', result);
}

main().catch(console.error);
