import { Shipper, Order } from '@prisma/client';

export interface INotificationService {
  sendOrderOffer(shipper: Shipper, order: Order & { distance?: number; duration?: number }): Promise<void>;
  sendAcceptConfirm(shipper: Shipper, order: Order): Promise<void>;
  sendRejectConfirm(shipper: Shipper, orderId: string): Promise<void>;
  sendTimeoutNotice(shipper: Shipper, orderId: string): Promise<void>;
  sendDeliveringStatus(shipper: Shipper, orderId: string): Promise<void>;
  sendSuccessStatus(shipper: Shipper, orderId: string): Promise<void>;
}
