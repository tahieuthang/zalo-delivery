import { z } from 'zod';

export const CreateShipperDto = z.object({
  name: z.string().min(2, 'Tên shipper phải từ 2 ký tự trở lên'),
  phone: z.string().regex(/^(?:\+84|84|0)[35789](?:[\s.-]?\d){8}\b/, 'Số điện thoại không hợp lệ'),
  vehicleType: z.string().min(1, 'Loại xe không được để trống'),
});

export const UpdateShipperDto = CreateShipperDto.partial();

export const ToggleShipperStatusDto = z
  .object({
    status: z.enum(['ONLINE', 'OFFLINE']),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine(
    (data) => {
      if (data.status === 'ONLINE') {
        return data.lat !== undefined && data.lng !== undefined;
      }
      return true;
    },
    {
      message: 'Tọa độ lat và lng là bắt buộc khi chuyển sang ONLINE',
      path: ['lat', 'lng'],
    },
  );

export const ShipperResponseDto = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  vehicleType: z.string(),
  status: z.enum(['ONLINE', 'OFFLINE']),
  totalEarnings: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
