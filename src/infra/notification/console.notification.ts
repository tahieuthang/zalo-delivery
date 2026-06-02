import { Shipper, Order } from '@prisma/client';
import { INotificationService } from '@infra/notification/notification.interface';
import logger from '@shared/logger/logger';

export class ConsoleNotificationService implements INotificationService {
  async sendOrderOffer(shipper: Shipper, order: Order & { distance?: number; duration?: number }): Promise<void> {
    const distStr = order.distance ? `${(order.distance / 1000).toFixed(1)}km` : 'unknown distance';
    const durStr = order.duration ? `${Math.ceil(order.duration / 60)} mins` : 'unknown duration';
    logger.info(
      `[NOTIFICATION] [SHIPPED TO: ${shipper.name} (${shipper.phone})] 📦 Đơn mới: ${order.deliveryAddress} — ${distStr} (~${durStr}). Bạn có 30 giây để phản hồi.`
    );
  }

  async sendAcceptConfirm(shipper: Shipper, order: Order): Promise<void> {
    logger.info(
      `[NOTIFICATION] [SHIPPED TO: ${shipper.name} (${shipper.phone})] ✅ Đã nhận đơn #${order.id}. Lấy hàng tại: ${order.pickupAddress}. Giao đến: ${order.deliveryAddress}`
    );
  }

  async sendRejectConfirm(shipper: Shipper, orderId: string): Promise<void> {
    logger.info(
      `[NOTIFICATION] [SHIPPED TO: ${shipper.name} (${shipper.phone})] ❌ Đã từ chối đơn #${orderId} — Treo 15 phút.`
    );
  }

  async sendTimeoutNotice(shipper: Shipper, orderId: string): Promise<void> {
    logger.info(
      `[NOTIFICATION] [SHIPPED TO: ${shipper.name} (${shipper.phone})] ⏰ Hết hạn phản hồi đơn #${orderId}`
    );
  }

  async sendDeliveringStatus(shipper: Shipper, orderId: string): Promise<void> {
    logger.info(
      `[NOTIFICATION] [SHIPPED TO: ${shipper.name} (${shipper.phone})] 🚚 Đơn #${orderId} đang được giao...`
    );
  }

  async sendSuccessStatus(shipper: Shipper, orderId: string): Promise<void> {
    logger.info(
      `[NOTIFICATION] [SHIPPED TO: ${shipper.name} (${shipper.phone})] 🎉 Giao thành công đơn #${orderId}`
    );
  }
}
