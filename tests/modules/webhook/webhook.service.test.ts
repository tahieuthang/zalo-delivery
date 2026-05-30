import { describe, it, expect } from 'vitest';
import { parseOrderMessage } from '@modules/webhook/webhook.service';

describe('Zalo Order Message Regex Parser (Task 1.3)', () => {
  it('1. should parse standard split-by-dash format with delivery address', () => {
    const text = 'Nguyễn Văn A - 0912345678 - 123 Lê Lợi Q1';
    const result = parseOrderMessage(text);
    expect(result).toEqual({
      name: 'Nguyễn Văn A',
      phone: '0912345678',
      deliveryAddress: '123 Lê Lợi Q1',
      pickupAddress: undefined,
      note: undefined,
    });
  });

  it('2. should parse labeled format with commas', () => {
    const text = 'Tên: Trần Thị B, SĐT: 0987654321, Giao tại: 456 Nguyễn Huệ, Quận 1';
    const result = parseOrderMessage(text);
    expect(result.name).toBe('Trần Thị B');
    expect(result.phone).toBe('0987654321');
    expect(result.deliveryAddress).toBe('456 Nguyễn Huệ, Quận 1');
  });

  it('3. should parse text style message with inline details', () => {
    const text = 'Ship tới 789 Điện Biên Phủ, Bình Thạnh cho anh Hoàng, Sđt 0901234567';
    const result = parseOrderMessage(text);
    expect(result.name).toBe('anh Hoàng');
    expect(result.phone).toBe('0901234567');
    expect(result.deliveryAddress).toBe('789 Điện Biên Phủ, Bình Thạnh');
  });

  it('4. should parse labeled format with multiple colons', () => {
    const text = 'Người nhận: Lê Văn C, Số điện thoại: 0933344455, Giao: 12 Ba Tháng Hai, Quận 10';
    const result = parseOrderMessage(text);
    expect(result.name).toBe('Lê Văn C');
    expect(result.phone).toBe('0933344455');
    expect(result.deliveryAddress).toBe('12 Ba Tháng Hai, Quận 10');
  });

  it('5. should parse phone-first format', () => {
    const text = '0944556677 - Nguyễn Văn D - 456 Cách Mạng Tháng Tám, Q3';
    const result = parseOrderMessage(text);
    expect(result).toEqual({
      name: 'Nguyễn Văn D',
      phone: '0944556677',
      deliveryAddress: '456 Cách Mạng Tháng Tám, Q3',
      pickupAddress: undefined,
      note: undefined,
    });
  });

  it('6. should parse mixed keyword format with dots in phone', () => {
    const text = 'Giao: 123 Lê Duẩn, Bến Nghé, Q1. Khách hàng: Phạm Văn E. Sdt: 0922.223.333';
    const result = parseOrderMessage(text);
    expect(result.name).toBe('Phạm Văn E');
    expect(result.phone).toBe('0922223333');
    expect(result.deliveryAddress).toBe('123 Lê Duẩn, Bến Nghé, Q1');
  });

  it('7. should parse both pickup and delivery addresses with customer details', () => {
    const text = 'Lấy hàng: 100 Hùng Vương, Q5. Giao hàng: 200 Lý Thường Kiệt, Q10. Người nhận: Chị Lan 0955556666';
    const result = parseOrderMessage(text);
    expect(result.name).toBe('Chị Lan');
    expect(result.phone).toBe('0955556666');
    expect(result.deliveryAddress).toBe('200 Lý Thường Kiệt, Q10');
    expect(result.pickupAddress).toBe('100 Hùng Vương, Q5');
  });

  it('8. should parse full details including pickup and notes', () => {
    const text = 'Khách: Anh Nam - Sđt: 0966677788 - Giao đến: 789 Võ Thị Sáu, Q3. Lấy tại: 111 Nguyễn Đình Chiểu, Q3. Ghi chú: Giao giờ hành chính';
    const result = parseOrderMessage(text);
    expect(result.name).toBe('Anh Nam');
    expect(result.phone).toBe('0966677788');
    expect(result.deliveryAddress).toBe('789 Võ Thị Sáu, Q3');
    expect(result.pickupAddress).toBe('111 Nguyễn Đình Chiểu, Q3');
    expect(result.note).toBe('Giao giờ hành chính');
  });

  it('9. should parse split-by-pipe format', () => {
    const text = 'Giao cho: Nguyễn Văn A | 0912345678 | 123 Lê Lợi Q1';
    const result = parseOrderMessage(text);
    expect(result.name).toBe('Nguyễn Văn A');
    expect(result.phone).toBe('0912345678');
    expect(result.deliveryAddress).toBe('123 Lê Lợi Q1');
  });

  it('10. should parse phone with international prefix +84', () => {
    const text = 'Nguyễn Văn A - +84912345678 - 123 Lê Lợi Q1';
    const result = parseOrderMessage(text);
    expect(result.phone).toBe('0912345678');
  });

  it('11. should parse phone with international prefix 84', () => {
    const text = 'Nguyễn Văn A - 84912345678 - 123 Lê Lợi Q1';
    const result = parseOrderMessage(text);
    expect(result.phone).toBe('0912345678');
  });

  it('12. should throw error if no phone number is found', () => {
    const text = 'Nguyễn Văn A - Không có sđt - 123 Lê Lợi Q1';
    expect(() => parseOrderMessage(text)).toThrow('Không tìm thấy số điện thoại hợp lệ');
  });
});
