import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Gửi tin ra đường báo của tiệm (V6 integrations, migration #160).
 *
 * BA LUẬT của thẻ design man-webhook-api.html, và chỗ thi công từng luật:
 *   1. Bên nhận hỏng không làm hỏng iFan — worker này chạy TÁCH khỏi đường bán
 *      hàng (được kích theo nhịp), gửi hỏng thì chỉ ghi lại và hẹn thử lại.
 *   2. Gửi lại được là chuyện thường — mỗi tin mang `X-iFan-Delivery` là mã
 *      phiếu, KHÔNG đổi qua các lần thử lại. Bên nhận dựa vào đó để bỏ tin trùng.
 *   3. Hỏng lâu thì BÁO — sau NGUONG_BAO lần hỏng liên tiếp, đường báo bị đánh
 *      dấu để màn hình và thông báo nói ra, không âm thầm bỏ.
 */

/** Hỏng liên tiếp tới ngưỡng này thì phải báo chủ tiệm (luật 3 của thẻ design). */
export const NGUONG_BAO = 20;
/** Bỏ hẳn sau ngần này lần — giữ mãi phiếu chết chỉ làm hàng đợi phình. */
export const TOI_DA_THU = 25;
/** Bên nhận chậm không được giữ worker: quá hạn này là tính hỏng. */
const HET_GIO_MS = 10_000;

/**
 * Giãn dần: 1p · 2p · 4p … trần 6 giờ. Thử lại dồn dập chỉ làm bên nhận đang
 * ngộp càng ngộp thêm, và đốt lượt gọi của chính mình.
 */
export function lanKeTiepSau(soLanDaThu: number): Date {
  const phut = Math.min(2 ** Math.max(soLanDaThu - 1, 0), 360);
  return new Date(Date.now() + phut * 60_000);
}

/**
 * Chữ ký để bên nhận biết tin đến THẬT từ iFan.
 * Ký cả MỐC THỜI GIAN cùng nội dung: thiếu mốc thì ai bắt được một tin cũ có
 * thể phát lại y nguyên mãi mãi, chữ ký vẫn đúng.
 */
export function kyTin(secret: string, mocGiay: number, than: string): string {
  return createHmac("sha256", secret).update(`${mocGiay}.${than}`).digest("hex");
}

/** Đối chiếu chữ ký an toàn trước tấn công đo thời gian — dùng cho bộ kiểm. */
export function chuKyKhop(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Dải địa chỉ NỘI BỘ — gửi tới đây là để lộ mạng riêng của máy chủ ra ngoài.
 *
 * ⚠️ ĐÂY LÀ CHỐT CHẶN SSRF, không phải phép kiểm cho vui. Địa chỉ webhook do
 * NGƯỜI DÙNG nhập; không chặn thì ai đó khai `http://169.254.169.254/...` là
 * bắt máy chủ tự đi lấy thông tin đăng nhập của hạ tầng rồi gửi ra ngoài. Đây
 * đúng lớp rủi ro khiến dự án khoá extension pg_net hồi tháng trước (#36).
 */
function laDiaChiNoiBo(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === "::1" || v6 === "::") return true;
    if (/^f[cd]/.test(v6)) return true;        // fc00::/7 — mạng riêng
    if (/^fe[89ab]/.test(v6)) return true;     // fe80::/10 — link-local
    // IPv6 bọc IPv4 (::ffff:10.0.0.1) — bóc ra rồi xét tiếp
    const bocV4 = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (bocV4) return laDiaChiNoiBo(bocV4[1]);
    return false;
  }

  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => Number.isNaN(x))) return true; // không đọc được ⇒ chặn
  const [a, b] = p;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;   // metadata của máy chủ đám mây
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                 // multicast + dành riêng
  return false;
}

export type KetQuaKiemDiaChi = { ok: true; ip: string } | { ok: false; lyDo: string };

/** Kiểm địa chỉ TRƯỚC khi gửi: chỉ https, và không trỏ vào mạng nội bộ. */
export async function kiemDiaChi(url: string): Promise<KetQuaKiemDiaChi> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, lyDo: "dia_chi_khong_doc_duoc" };
  }
  if (u.protocol !== "https:") return { ok: false, lyDo: "chi_nhan_https" };

  const ten = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.localhost|.*\.internal|.*\.local)$/i.test(ten)) {
    return { ok: false, lyDo: "tro_vao_may_chu_noi_bo" };
  }
  if (isIP(ten)) {
    return laDiaChiNoiBo(ten)
      ? { ok: false, lyDo: "tro_vao_mang_noi_bo" }
      : { ok: true, ip: ten };
  }

  try {
    const { address } = await lookup(ten);
    return laDiaChiNoiBo(address)
      ? { ok: false, lyDo: "tro_vao_mang_noi_bo" }
      : { ok: true, ip: address };
  } catch {
    return { ok: false, lyDo: "khong_tra_duoc_ten_mien" };
  }
}

export type KetQuaGui =
  | { ok: true; maTrangThai: number }
  | { ok: false; loi: string; maTrangThai?: number };

/** Gửi MỘT phiếu. Không ném lỗi — mọi hỏng hóc trả về thành kết quả đọc được. */
export async function guiMotTin(input: {
  url: string;
  secret: string;
  deliveryId: string;
  eventType: string;
  payload: unknown;
}): Promise<KetQuaGui> {
  const diaChi = await kiemDiaChi(input.url);
  if (!diaChi.ok) return { ok: false, loi: diaChi.lyDo };

  const than = JSON.stringify({
    id: input.deliveryId,
    type: input.eventType,
    data: input.payload,
  });
  const mocGiay = Math.floor(Date.now() / 1000);

  const dungLai = new AbortController();
  const hen = setTimeout(() => dungLai.abort(), HET_GIO_MS);
  try {
    const res = await fetch(input.url, {
      method: "POST",
      signal: dungLai.signal,
      redirect: "manual", // chuyển hướng là đường vòng qua chốt chặn địa chỉ ở trên
      headers: {
        "content-type": "application/json",
        // Mã phiếu GIỮ NGUYÊN qua mọi lần thử lại — bên nhận dựa vào đây để bỏ trùng.
        "x-ifan-delivery": input.deliveryId,
        "x-ifan-event": input.eventType,
        "x-ifan-timestamp": String(mocGiay),
        "x-ifan-signature": kyTin(input.secret, mocGiay, than),
        "user-agent": "iFan-Webhook/1.0",
      },
      body: than,
    });
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, loi: "bi_chuyen_huong", maTrangThai: res.status };
    }
    if (!res.ok) return { ok: false, loi: `may_chu_tra_${res.status}`, maTrangThai: res.status };
    return { ok: true, maTrangThai: res.status };
  } catch (e) {
    const loi = e instanceof Error && e.name === "AbortError" ? "het_gio_cho" : "khong_goi_duoc";
    return { ok: false, loi };
  } finally {
    clearTimeout(hen);
  }
}
