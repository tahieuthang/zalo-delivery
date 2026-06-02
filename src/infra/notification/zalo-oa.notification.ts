import { Shipper, Order } from '@prisma/client';
import { INotificationService } from '@infra/notification/notification.interface';
import logger from '@shared/logger/logger';

export class ZaloOaNotificationService implements INotificationService {
  async sendOrderOffer(shipper: Shipper, order: Order & { distance?: number; duration?: number }): Promise<void> {
    logger.warn(
      `[ZALO OA] Gửi offer đơn #${order.id} tới shipper ${shipper.name} (${shipper.phone}) qua Zalo OA API (Mock/Placeholder)`
    );
  }

  async sendAcceptConfirm(shipper: Shipper, order: Order): Promise<void> {
    logger.warn(
      `[ZALO OA] Gửi xác nhận accept đơn #${order.id} tới shipper ${shipper.name} qua Zalo OA API (Mock/Placeholder)`
    );
  }

  async sendRejectConfirm(shipper: Shipper, orderId: string): Promise<void> {
    logger.warn(
      `[ZALO OA] Gửi từ chối đơn #${orderId} tới shipper ${shipper.name} qua Zalo OA API (Mock/Placeholder)`
    );
  }

  async sendTimeoutNotice(shipper: Shipper, orderId: string): Promise<void> {
    logger.warn(
      `[ZALO OA] Gửi hết hạn đơn #${orderId} tới shipper ${shipper.name} qua Zalo OA API (Mock/Placeholder)`
    );
  }

  async sendDeliveringStatus(shipper: Shipper, orderId: string): Promise<void> {
    logger.warn(
      `[ZALO OA] Gửi trạng thái DELIVERING đơn #${orderId} tới shipper ${shipper.name} qua Zalo OA API (Mock/Placeholder)`
    );
  }

  async sendSuccessStatus(shipper: Shipper, orderId: string): Promise<void> {
    logger.warn(
      `[ZALO OA] Gửi trạng thái SUCCESS đơn #${orderId} tới shipper ${shipper.name} qua Zalo OA API (Mock/Placeholder)`
    );
  }
}
