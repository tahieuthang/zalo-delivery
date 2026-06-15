import crypto from 'crypto';
import { env } from '@config/env.config';
import { isNew } from '@infra/redis/dedup.service';
import { ulid } from '@shared/utils/id-generator';
import { AppError } from '@shared/errors/app-error';
import { ErrorCode } from '@shared/errors/error-codes';
import * as webhookRepo from '@modules/webhook/webhook.repository';
import type { ZaloWebhookPayload, ParsedOrder, ParsedOrderItem } from '@modules/webhook/webhook.types';
import * as orderService from '@modules/order/order.service';
import { handleShipperResponse } from '@modules/dispatcher/dispatcher.service';
import { prisma } from '@infra/database/prisma-client';
import { getAccessToken } from '@infra/zalo/zalo-token.service';
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

  const isValid = computedMac === signature;

  if (!isValid) {
    logger.warn(
      { computedMac, receivedSignature: signature, eventName: payload.event_name },
      'Webhook signature verification failed.'
    );
    if (env.NODE_ENV === 'development') {
      logger.info('Development mode: bypassing failed signature check to allow testing.');
      return true;
    }
  }

  return isValid;
}

/**
 * Fetch Zalo User Profile name using OA API
 */
export async function fetchZaloProfile(zaloUserId: string): Promise<string | null> {
  const url = `https://openapi.zalo.me/v2.0/oa/getprofile?data=${encodeURIComponent(
    JSON.stringify({ user_id: zaloUserId })
  )}`;

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return null;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        access_token: accessToken,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as any;
    if (json.error === 0 && json.data?.displayName) {
      return json.data.displayName as string;
    }
  } catch (err) {
    logger.error({ err, zaloUserId }, 'Failed to fetch Zalo profile for user');
  }
  return null;
}

/**
 * Parse individual item details from the message text (e.g. "2 trà sữa ô long, size L và size M")
 */
export function parseItems(
  text: string,
  deliveryAddress?: string,
  pickupAddress?: string
): ParsedOrderItem[] {
  const items: ParsedOrderItem[] = [];
  const lowerDeliv = deliveryAddress?.toLowerCase() || '';
  const lowerPickup = pickupAddress?.toLowerCase() || '';

  // Regex: matches quantity (digit) followed by letters/spaces for item name.
  const itemRegex = /(?:^|[\s,.\n])(\d+)\s+([a-zA-Zà-ỹÀ-Ỹ\s\d]+?)(?=\s*(?:,|\.|\(|size|giao|địa chỉ|sđt|sdt|$))/gi;

  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const qty = parseInt(match[1], 10);
    const name = match[2].trim();

    if (qty > 100) continue;

    const lowerName = name.toLowerCase();
    if (
      lowerName.length < 2 ||
      ['ngõ', 'ngách', 'hẻm', 'số', 'đường', 'phố', 'quận', 'huyện', 'tỉnh', 'phường', 'xã', 'cho', 'anh', 'em', 'chị', 'giao', 'ship', 'lấy', 'đến', 'tới'].some(
        (kw) => lowerName === kw || lowerName.startsWith(kw + ' ')
      )
    ) {
      continue;
    }

    // Filter out if this name is a substring of the parsed addresses
    if (
      (lowerDeliv && lowerDeliv.includes(lowerName)) ||
      (lowerPickup && lowerPickup.includes(lowerName))
    ) {
      continue;
    }

    // Try to find if there is a size or note immediately following
    const startIndex = match.index + match[0].length;
    const remainingText = text.substring(startIndex);

    const noteMatch = remainingText.match(/^\s*[,.-]?\s*([^,.\n]+?)(?=\s*(?:giao|ship|lấy|sđt|sdt|người nhận|nguoi nhan|$))/i);
    let note = noteMatch ? noteMatch[1].trim() : undefined;

    if (note) {
      note = note.replace(/^[,\s.-]+|[,\s.-]+$/g, '').trim();
      if (
        !note ||
        note.toLowerCase().includes('giao') ||
        note.toLowerCase().includes('sđt') ||
        note.toLowerCase().includes('địa chỉ')
      ) {
        note = undefined;
      }
    }

    items.push({
      name,
      quantity: qty,
      note: note || undefined,
    });
  }

  return items;
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
      const candidate = nameMatchNatural[1].trim();
      if (!/\d/.test(candidate)) {
        name = candidate;
      }
    }
  }

  if (!name) {
    const receiverMatch = cleanText.match(/(?:người nhận|nguoi nhan|tên|khách)\s+([a-zA-Zà-ỹÀ-Ỹ\s]+)/i);
    if (receiverMatch) {
      name = receiverMatch[1].trim();
    }
  }

  // 4. Fallback to split-based heuristic (e.g. "Nguyễn Văn A - 0912345678 - 123 Lê Lợi Q1")
  if (!name || !deliveryAddress) {
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

  // Parse items using the static helper with the resolved addresses for deduplication
  const items = parseItems(text, deliveryAddress, pickupAddress);

  return {
    name,
    phone,
    deliveryAddress,
    pickupAddress,
    note,
    items: items.length > 0 ? items : undefined,
  };
}

/**
 * Core business logic to process Zalo OA Webhook.
 */
export async function processWebhook(
  payload: ZaloWebhookPayload,
  rawBody: string,
  signature: string,
): Promise<{ processed: boolean; reason?: string; orderId?: string }> {
  // 1. Signature verification
  const isSignatureValid = verifySignature(payload, rawBody, signature);
  if (!isSignatureValid) {
    logger.error('Webhook signature verification failed');
    throw new AppError(403, ErrorCode.INVALID_SIGNATURE, 'Chữ ký webhook không hợp lệ');
  }

  // 2. Handle Follow Event
  if (payload.event_name === 'follow') {
    const followerId = payload.follower?.id;
    if (!followerId) {
      return { processed: false, reason: 'missing_follower_id' };
    }

    logger.info({ followerId }, 'Handling Zalo OA follow event...');

    // Attempt to fetch name from profile and map to database shipper
    const name = await fetchZaloProfile(followerId);
    let matchedShipper = null;

    if (name) {
      matchedShipper = await prisma.shipper.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          zaloUserId: null,
        },
      });
    }

    // Fallback: If no name match, pick the first offline shipper without zaloUserId for testing ease
    if (!matchedShipper) {
      matchedShipper = await prisma.shipper.findFirst({
        where: {
          zaloUserId: null,
        },
      });
    }

    if (matchedShipper) {
      await prisma.shipper.update({
        where: { id: matchedShipper.id },
        data: { zaloUserId: followerId },
      });
      logger.info(
        { shipperId: matchedShipper.id, shipperName: matchedShipper.name, followerId },
        'Auto-captured and linked zaloUserId to shipper'
      );
      return { processed: true, reason: 'follower_linked_to_shipper' };
    }

    logger.warn({ followerId, name }, 'Follower could not be matched to any registered shipper');
    return { processed: true, reason: 'follower_logged_only' };
  }

  // 3. Handle Text Event
  if (payload.event_name === 'user_send_text') {
    const message = payload.message;
    if (!message || !message.text) {
      return { processed: false, reason: 'empty_message' };
    }

    const messageId = message.msg_id;
    const rawText = message.text.trim();
    const senderId = payload.sender?.id;
    if (!senderId) {
      return { processed: false, reason: 'missing_sender_id' };
    }

    // Deduplication check via Redis
    const isMessageNew = await isNew('webhook', messageId, 86400);
    if (!isMessageNew) {
      logger.warn({ messageId }, 'Duplicate webhook message skipped');
      throw new AppError(409, ErrorCode.DUPLICATE_MESSAGE, 'Tin nhắn đã được xử lý trước đó');
    }

    // 3.1 Check if this is a Shipper confirmation response callback button
    // payloads: #accept:{orderId} or #reject:{orderId}
    const match = rawText.match(/^#(accept|reject):(.+)$/i);
    if (match) {
      const action = match[1].toLowerCase() as 'accept' | 'reject';
      const orderId = match[2];

      logger.info({ senderId, action, orderId }, 'Detected shipper response button payload');

      // Resolve shipper by zaloUserId
      const shipper = await prisma.shipper.findUnique({
        where: { zaloUserId: senderId },
      });

      if (!shipper) {
        logger.error({ senderId }, 'Shipper not found for this zaloUserId');
        return { processed: false, reason: 'shipper_not_found' };
      }

      const result = await handleShipperResponse(orderId, shipper.id, action);
      if (result.success) {
        return { processed: true, reason: `shipper_${action}_processed` };
      } else {
        logger.warn({ orderId, shipperId: shipper.id, error: result.error }, 'Failed to handle shipper response');
        return { processed: false, reason: result.error || 'shipper_response_failed' };
      }
    }

    // 3.2 Otherwise, it is a Customer message for order creation
    const logId = ulid();
    let parsed: ParsedOrder | null = null;
    let parseError: string | null = null;

    try {
      parsed = parseOrderMessage(rawText);
    } catch (err: any) {
      parseError = err.message || 'Lỗi phân tích cú pháp tin nhắn';
      logger.error({ err, rawText }, 'Failed to parse order message');
    }

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

    try {
      const createdOrder = await orderService.createOrder({
        customerId: senderId,
        pickupAddress: parsed.pickupAddress || DEFAULT_PICKUP_ADDRESS,
        deliveryAddress: parsed.deliveryAddress,
        note: parsed.note,
        items: parsed.items,
      });

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

  return { processed: false, reason: 'unsupported_event' };
}
