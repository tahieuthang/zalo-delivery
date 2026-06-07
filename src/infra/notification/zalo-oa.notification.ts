import { Shipper, Order } from '@prisma/client';
import { INotificationService } from '@infra/notification/notification.interface';
import { sendOaMessage } from '@infra/zalo/zalo-oa-client';
import logger from '@shared/logger/logger';

export class ZaloOaNotificationService implements INotificationService {
  private getFallbackLog(shipper: Shipper, message: string): void {
    logger.warn(
      `[ZALO OA FALLBACK] [SHIPPED TO: ${shipper.name} (${shipper.phone})] ${message}`
    );
  }

  async sendOrderOffer(
    shipper: Shipper,
    order: Order & { distance?: number; duration?: number }
  ): Promise<void> {
    const distStr = order.distance ? `${(order.distance / 1000).toFixed(1)}km` : 'unknown distance';
    const durStr = order.duration ? `${Math.ceil(order.duration / 60)} mins` : 'unknown duration';
    
    const textMessage = `📦 Đơn hàng mới!\nGiao đến: ${order.deliveryAddress}\nKhoảng cách: ${distStr} (~${durStr})\nBạn có 30 giây để phản hồi.`;

    if (!shipper.zaloUserId) {
      this.getFallbackLog(shipper, `${textMessage} (No Zalo UID set)`);
      return;
    }

    const payload = {
      recipient: { user_id: shipper.zaloUserId },
      message: {
        text: textMessage,
        attachment: {
          type: 'template',
          payload: {
            buttons: [
              {
                title: '✅ Nhận đơn',
                type: 'oa.query.hide',
                payload: `#accept:${order.id}`,
              },
              {
                title: '❌ Từ chối',
                type: 'oa.query.hide',
                payload: `#reject:${order.id}`,
              },
            ],
          },
        },
      },
    };

    try {
      await sendOaMessage(payload);
    } catch (err) {
      logger.error({ err, shipperId: shipper.id, orderId: order.id }, 'Failed to send Zalo OA order offer');
    }
  }

  async sendAcceptConfirm(shipper: Shipper, order: Order): Promise<void> {
    const message = `✅ Đã nhận đơn #${order.id}.\nLấy hàng tại: ${order.pickupAddress}\nGiao đến: ${order.deliveryAddress}`;

    if (!shipper.zaloUserId) {
      this.getFallbackLog(shipper, message);
      return;
    }

    const payload = {
      recipient: { user_id: shipper.zaloUserId },
      message: { text: message },
    };

    try {
      await sendOaMessage(payload);
    } catch (err) {
      logger.error({ err, shipperId: shipper.id, orderId: order.id }, 'Failed to send Zalo OA accept confirmation');
    }
  }

  async sendRejectConfirm(shipper: Shipper, orderId: string): Promise<void> {
    const message = `❌ Đã từ chối đơn #${orderId} — Bạn sẽ bị tạm dừng nhận đơn mới trong 15 phút.`;

    if (!shipper.zaloUserId) {
      this.getFallbackLog(shipper, message);
      return;
    }

    const payload = {
      recipient: { user_id: shipper.zaloUserId },
      message: { text: message },
    };

    try {
      await sendOaMessage(payload);
    } catch (err) {
      logger.error({ err, shipperId: shipper.id, orderId }, 'Failed to send Zalo OA reject confirmation');
    }
  }

  async sendTimeoutNotice(shipper: Shipper, orderId: string): Promise<void> {
    const message = `⏰ Hết hạn phản hồi đơn #${orderId}. Đơn đã được chuyển cho shipper khác.`;

    if (!shipper.zaloUserId) {
      this.getFallbackLog(shipper, message);
      return;
    }

    const payload = {
      recipient: { user_id: shipper.zaloUserId },
      message: { text: message },
    };

    try {
      await sendOaMessage(payload);
    } catch (err) {
      logger.error({ err, shipperId: shipper.id, orderId }, 'Failed to send Zalo OA timeout notice');
    }
  }

  async sendDeliveringStatus(shipper: Shipper, orderId: string): Promise<void> {
    const message = `🚚 Đơn hàng #${orderId} đang được giao. Vui lòng di chuyển đến điểm giao hàng.`;

    if (!shipper.zaloUserId) {
      this.getFallbackLog(shipper, message);
      return;
    }

    const payload = {
      recipient: { user_id: shipper.zaloUserId },
      message: { text: message },
    };

    try {
      await sendOaMessage(payload);
    } catch (err) {
      logger.error({ err, shipperId: shipper.id, orderId }, 'Failed to send Zalo OA delivering status update');
    }
  }

  async sendSuccessStatus(shipper: Shipper, orderId: string): Promise<void> {
    const message = `🎉 Chúc mừng! Đơn hàng #${orderId} đã giao thành công. Tiền cước đã được cộng vào tài khoản của bạn.`;

    if (!shipper.zaloUserId) {
      this.getFallbackLog(shipper, message);
      return;
    }

    const payload = {
      recipient: { user_id: shipper.zaloUserId },
      message: { text: message },
    };

    try {
      await sendOaMessage(payload);
    } catch (err) {
      logger.error({ err, shipperId: shipper.id, orderId }, 'Failed to send Zalo OA success status update');
    }
  }
}
