/**
 * VietQR / NAPAS IBFT — sinh chuỗi QR chuyển khoản TẠI CHỖ (ADR-0019 mục 6:
 * "dựng chuỗi và vẽ mã ngay trong máy chủ của mình", không gọi dịch vụ tạo
 * ảnh QR bên ngoài — tránh rò rỉ số tiền/tên khách sang bên thứ ba mỗi lần
 * thu tiền). Cấu trúc TLV (tag-length-value) theo chuẩn EMVCo QR + đặc tả
 * NAPAS VietQR — đối chiếu với 2 triển khai công khai (subiz/vietqr,
 * binhnguyenduc/vietqr-ts) khi viết hàm này, KHÔNG tự bịa cấu trúc (bài học
 * "không tự đối chiếu với chính hàm đang kiểm", ADR-0019 mục 9).
 *
 * CRC-16 tự kiểm bằng test-vector CHUẨN của thuật toán CRC-16/CCITT-FALSE
 * (input "123456789" → "29B1", giá trị check chính thức của thuật toán,
 * độc lập với VietQR) — xem test cùng thư mục.
 */

const NAPAS_GUID = "A000000727";
/** Chuyển tới TÀI KHOẢN (không phải thẻ) — đúng luồng V3: tiệm nhận vào TK. */
const SERVICE_CODE_ACCOUNT = "QRIBFTTA";
const CURRENCY_VND = "704"; // ISO 4217
const COUNTRY_VN = "VN";
const MEMO_MAX = 25; // giới hạn NAPAS cho "Purpose of Transaction" (tag 62→08)

function tlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${tag}${len}${value}`;
}

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, không đảo bit — đúng thuật toán ISO/IEC 13239 NAPAS dùng cho tag 63. */
export function crc16CcittFalse(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type VietQrParams = {
  /** Mã ngân hàng theo chuẩn NAPAS (6 số, vd 970422 = MB) — chính là `tenants.bank_code`. */
  bankBin: string;
  accountNo: string;
  /** VNĐ, số nguyên. Bỏ trống = QR tĩnh (không nhúng số tiền). */
  amountVnd?: number;
  /** Nội dung chuyển khoản — cắt còn tối đa 25 ký tự theo giới hạn NAPAS. */
  memo?: string;
};

/** Dựng chuỗi QR động (có số tiền) hoặc tĩnh (không số tiền) theo chuẩn VietQR. */
export function buildVietQrPayload(params: VietQrParams): string {
  const beneficiary = tlv("00", params.bankBin) + tlv("01", params.accountNo);
  const merchantAccountInfo = tlv("00", NAPAS_GUID) + tlv("01", beneficiary) + tlv("02", SERVICE_CODE_ACCOUNT);

  let payload =
    tlv("00", "01") + // Payload Format Indicator
    tlv("01", params.amountVnd ? "12" : "11") + // Point of Initiation: 12=động, 11=tĩnh
    tlv("38", merchantAccountInfo) +
    tlv("53", CURRENCY_VND);

  if (params.amountVnd && params.amountVnd > 0) {
    payload += tlv("54", String(Math.round(params.amountVnd)));
  }
  payload += tlv("58", COUNTRY_VN);

  const memo = (params.memo ?? "").trim().slice(0, MEMO_MAX);
  if (memo) {
    payload += tlv("62", tlv("08", memo));
  }

  payload += "6304"; // tag 63 (CRC), length 04 — placeholder trước khi tính
  return payload + crc16CcittFalse(payload);
}
