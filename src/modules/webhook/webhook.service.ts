import crypto from 'crypto';
import { env } from '@config/env.config';
import { isNew } from '@infra/redis/dedup.service';
import { ulid } from '@shared/utils/id-generator';
import { AppError } from '@shared/errors/app-error';
import { ErrorCode } from '@shared/errors/error-codes';
import * as webhookRepo from '@modules/webhook/webhook.repository';
import type { ZaloWebhookPayload, ParsedOrder } from '@modules/webhook/webhook.types';
import * as orderService from '@modules/order/order.service';
import logger from '@shared/logger/logger';

// Default pickup address if not provided in the parsed text message
const DEFAULT_PICKUP_ADDRESS = '29 Trương Định, Bến Thành, Quận 1, Hồ Chí Minh';

/**
 * Verify webhook signature from Zalo.
 * mac = sha256(appId + data + timestamp + secretKey)
 */
export function verifySignature(
  payload: ZaloWebhookPayload,
  rawBody: string,
  signature: string,
): boolean {
  if (!env.ZALO_APP_SECRET) {
    logger.warn('ZALO_APP_SECRET is not set. Webhook signature verification is skipped.');
    return true;
  }

  const rawData = payload.app_id + rawBody + payload.timestamp + env.ZALO_APP_SECRET;
  const computedMac = crypto.createHash('sha256').update(rawData).digest('hex');

  // Direct comparison for Zalo MAC verification
  return computedMac === signature;
}

/**
 * Robust Regex Parser to extract order details (Name, Phone, Delivery Address, Pickup Address)
 * handles multi-format and labeled strings.
 */
export function parseOrderMessage(text: string): ParsedOrder {
  const normalizedText = text.trim();

  // 1. Extract phone number (VN format)
  const phoneRegex = /(?:\+84|84|0)[35789](?:[\s.-]?\d){8}\b/;
  const phoneMatch = normalizedText.match(phoneRegex);
  if (!phoneMatch) {
    throw new Error('Không tìm thấy số điện thoại hợp lệ trong tin nhắn');
  }
  const rawPhone = phoneMatch[0];
  let phone = rawPhone.replace(/[\s.-]/g, '');
  if (phone.startsWith('+84')) phone = '0' + phone.substring(3);
  else if (phone.startsWith('84') && phone.length > 9) phone = '0' + phone.substring(2);

  // Remove phone from text to avoid interference in later parsing
  let cleanText = normalizedText.replace(rawPhone, '').trim();

  // Clean extra trailing/leading/double separators from phone removal
  cleanText = cleanText
    .replace(/,\s*,/g, ',')
    .replace(/-\s*-/g, '-')
    .replace(/^[,\s.-]+|[,\s.-]+$/g, '')
    .trim();

  // 2. Look for explicit labels using precise regexes that stop at comma/period/dash/pipe/newline
  const nameLabel = /(?:tên|người nhận|nguoi nhan|khách hàng|khách|giao cho|name)\s*[:|-]\s*([^.,\n|-]+)/i;
  // For delivery address, we allow commas but stop at period/dash/pipe/newline
  const deliveryLabel = /(?:địa chỉ giao|địa chỉ|giao tại|giao tai|giao hàng|giao hang|giao đến|giao|address|delivery)\s*[:|-]\s*([^.\n|-]+)/i;
  const pickupLabel = /(?:địa chỉ lấy|lấy tại|lay tai|lấy hàng|lay hang|lấy|pickup)\s*[:|-]\s*([^.\n|-]+)/i;
  const noteLabel = /(?:ghi chú|note|lưu ý)\s*[:|-]\s*([^\n]+)/i;

  const nameMatch = cleanText.match(nameLabel);
  const deliveryMatch = cleanText.match(deliveryLabel);
  const pickupMatch = cleanText.match(pickupLabel);
  const noteMatch = cleanText.match(noteLabel);

  let name = nameMatch ? nameMatch[1].trim() : '';
  let deliveryAddress = deliveryMatch ? deliveryMatch[1].trim() : '';
  let pickupAddress = pickupMatch ? pickupMatch[1].trim() : undefined;
  let note = noteMatch ? noteMatch[1].trim() : undefined;

  // 3. Fallback for natural language keywords (e.g. "Ship tới 123... cho anh Hoàng")
  if (!deliveryAddress) {
    const shipToMatch = cleanText.match(/(?:ship tới|ship đến|giao tới|giao đến|tới|đến)\s+([^.\n|-]+?(?=\s+(?:cho|sđt|sdt|đt|dt|$)))/i);
    if (shipToMatch) {
      deliveryAddress = shipToMatch[1].trim();
    }
  }
  if (!name) {
    const nameMatchNatural = cleanText.match(/(?:cho|người nhận là|khách là)\s+([^,.\n|-]+)/i);
    if (nameMatchNatural) {
      name = nameMatchNatural[1].trim();
    }
  }

  // 4. Fallback to split-based heuristic (e.g. "Nguyễn Văn A - 0912345678 - 123 Lê Lợi Q1")
  if (!name || !deliveryAddress) {
    // Split by dash, pipe, or newline (BUT NOT comma to protect addresses like "123 Lê Lợi, Q1")
    const parts = cleanText.split(/[-|\n|]+/).map((p) => p.trim()).filter(Boolean);
    
    let detectedName = '';
    let detectedAddress = '';
    let detectedPickup = '';

    for (const part of parts) {
      const addressKeywords = [
        'đường',
        'số',
        'phố',
        'quận',
        'phường',
        'q.',
        'p.',
        'hẻm',
        'ngõ',
        'lê lợi',
        'lê duẩn',
        'lý thái tổ',
        'trương định',
        'bình thạnh',
        'thủ đức',
        'gò vấp',
        'tân bình',
        'hcm',
        'sài gòn',
        'hn',
        'hà nội',
      ];
      const isAddress =
        addressKeywords.some((kw) => part.toLowerCase().includes(kw)) ||
        /^\d+\s+\w+/.test(part) ||
        part.length > 15;

      if (isAddress) {
        if (part.toLowerCase().includes('lấy') || part.toLowerCase().includes('pickup')) {
          detectedPickup = part;
        } else {
          detectedAddress = part;
        }
      } else {
        if (part.length > 2 && part.length < 25 && !detectedName) {
          detectedName = part;
        }
      }
    }

    const cleanPrefixes = (val: string) => {
      return val
        .replace(
          /^(tên|người nhận|nguoi nhan|khách hàng|khách|giao cho|giao tại|giao tai|giao hàng|giao hang|giao đến|địa chỉ giao|địa chỉ|lấy tại|lấy hàng|lấy|name|address|delivery|pickup|sđt|sdt|đt|dt|phone|giao)\s*[:|-]\s*/i,
          '',
        )
        .trim();
    };

    if (!name && detectedName) name = cleanPrefixes(detectedName);
    if (!deliveryAddress && detectedAddress) deliveryAddress = cleanPrefixes(detectedAddress);
    if (!pickupAddress && detectedPickup) pickupAddress = cleanPrefixes(detectedPickup);
  }

  // Clean up any remaining leading/trailing commas or dots from fields
  const cleanEdgePunctuation = (val: string) => {
    return val.replace(/^[,\s.-]+|[,\s.-]+$/g, '').trim();
  };

  name = cleanEdgePunctuation(name);
  deliveryAddress = cleanEdgePunctuation(deliveryAddress);
  if (pickupAddress) pickupAddress = cleanEdgePunctuation(pickupAddress);
  if (note) note = cleanEdgePunctuation(note);

  if (!name) {
    throw new Error('Không thể phân tích Tên người nhận từ tin nhắn');
  }
  if (!deliveryAddress) {
    throw new Error('Không thể phân tích Địa chỉ giao hàng từ tin nhắn');
  }

  return {
    name,
    phone,
    deliveryAddress,
    pickupAddress,
    note,
  };
}

/**
 * Core business logic to process Zalo OA Webhook.
 * 1. Ignore events that are not user_send_text.
 * 2. Check duplicate message via Redis (SET NX EX).
 * 3. Log to PostgreSQL MessageLog table.
 * 4. Parse order and create the order using the Order Module.
 */
export async function processWebhook(
  payload: ZaloWebhookPayload,
  rawBody: string,
  signature: string,
): Promise<{ processed: boolean; reason?: string; orderId?: string }> {
  // 1. Only process user_send_text events
  if (payload.event_name !== 'user_send_text') {
    logger.info({ event: payload.event_name }, 'Webhook event ignored (not user_send_text)');
    return { processed: false, reason: 'ignored_event' };
  }

  const message = payload.message;
  if (!message || !message.text) {
    return { processed: false, reason: 'empty_message' };
  }

  const messageId = message.msg_id;
  const rawText = message.text;
  const senderId = payload.sender.id;

  // 2. Signature verification
  const isSignatureValid = verifySignature(payload, rawBody, signature);
  if (!isSignatureValid) {
    logger.error({ messageId }, 'Webhook signature verification failed');
    throw new AppError(403, ErrorCode.INVALID_SIGNATURE, 'Chữ ký webhook không hợp lệ');
  }

  // 3. Redis deduplication (atomic isNew check-and-set with 24h TTL)
  // key standard pattern: webhook:dedup:{message_id}
  const isMessageNew = await isNew('webhook', messageId, 86400);
  if (!isMessageNew) {
    logger.warn({ messageId }, 'Duplicate webhook message skipped');
    throw new AppError(409, ErrorCode.DUPLICATE_MESSAGE, 'Tin nhắn đã được xử lý trước đó');
  }

  const logId = ulid();
  let parsed: ParsedOrder | null = null;
  let parseError: string | null = null;

  // 4. Parse the text message
  try {
    parsed = parseOrderMessage(rawText);
  } catch (err: any) {
    parseError = err.message || 'Lỗi phân tích cú pháp tin nhắn';
    logger.error({ err, rawText }, 'Failed to parse order message');
  }

  // 5. If parse failed, log to PostgreSQL with parsedOk = false and throw ParseError
  if (!parsed || parseError) {
    await webhookRepo.createMessageLog({
      id: logId,
      messageId,
      senderId,
      rawText,
      parsedOk: false,
      parseError,
    });
    throw new AppError(400, ErrorCode.PARSE_FAILED, `Không thể đọc tin nhắn đơn hàng: ${parseError}`);
  }

  // 6. Parsing succeeded! Create order in PENDING status
  try {
    const createdOrder = await orderService.createOrder({
      customerId: senderId, // Maps to the customerId
      pickupAddress: parsed.pickupAddress || DEFAULT_PICKUP_ADDRESS,
      deliveryAddress: parsed.deliveryAddress,
      note: parsed.note,
    });

    // Save message log as successful and link to order ID
    await webhookRepo.createMessageLog({
      id: logId,
      messageId,
      senderId,
      rawText,
      parsedOk: true,
      order: { connect: { id: createdOrder.id } },
    });

    logger.info({ messageId, orderId: createdOrder.id }, 'Message parsed and order created successfully');
    return { processed: true, orderId: createdOrder.id };
  } catch (err: any) {
    // If order creation failed (e.g. Geocoding error), log failure
    const errorMsg = err.message || 'Lỗi lưu đơn hàng vào database';
    await webhookRepo.createMessageLog({
      id: logId,
      messageId,
      senderId,
      rawText,
      parsedOk: false,
      parseError: errorMsg,
    });

    logger.error({ err, messageId }, 'Failed to create order from parsed webhook');
    throw err;
  }
}
