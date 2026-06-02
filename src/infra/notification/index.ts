import { env } from '@config/env.config';
import { INotificationService } from '@infra/notification/notification.interface';
import { ConsoleNotificationService } from '@infra/notification/console.notification';
import { ZaloOaNotificationService } from '@infra/notification/zalo-oa.notification';

export * from '@infra/notification/notification.interface';

export function createNotificationService(): INotificationService {
  if (env.NOTIFICATION_PROVIDER === 'zalo') {
    return new ZaloOaNotificationService();
  }
  return new ConsoleNotificationService();
}

export const notificationService = createNotificationService();
