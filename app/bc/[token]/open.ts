import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ipHashFor } from "@/lib/channels/livechat";
import { parseSharePayload, type SharePayload } from "@/lib/report-share";

/**
 * MỘT cửa gọi `report_share_open` (migration #295) cho cả trang `/bc/[token]`
 * LẪN server action mở khoá bằng mật khẩu.
 *
 * Tách ra khỏi `page.tsx` ngay từ đầu vì hai đường cùng cần đúng phép tính này
 * (băm IP · vùng · loại máy) — chép sang đường thứ hai là dựng nơi thứ hai để
 * lệch, mà lệch ở đây nghĩa là một trong hai đường không đếm chống dò.
 * Khuôn: `app/t/[slug]/storefront-data.ts`.
 */

export type ShareOpenFail =
  | "not_found"
  | "expired"
  | "need_password"
  | "wrong_password"
  | "rate_limited"
  | "failed";

export type ShareOpenResult =
  | {
      ok: true;
      payload: SharePayload;
      /** Kỳ đã chốt lúc tạo ('month' | '3m' | 'all' | 'yyyy-MM-01') — chỉ để in nhãn. */
      periodKey: string;
      shopName: string;
      tz: string;
      generatedAt: string;
      expiresAt: string;
    }
  | { ok: false; reason: ShareOpenFail; tz?: string; expiresAt?: string };

/** Kết cục nghiệp vụ hàm CSDL biết trả. Chuỗi lạ = HỎNG, không phải "cho qua". */
const KNOWN_REASONS = new Set<ShareOpenFail>([
  "not_found",
  "expired",
  "need_password",
  "wrong_password",
  "rate_limited",
]);

/**
 * Vùng thô của người xem, đọc từ header `x-vercel-ip-*` Vercel tự gắn miễn phí
 * — CÙNG nguồn với nhật ký đăng nhập (`lib/auth/login-events.ts`), không gọi
 * dịch vụ định vị nào. Chạy ngoài Vercel thì header rỗng ⇒ để trống, KHÔNG suy
 * đoán bậy.
 */
function regionOf(h: Headers): string | null {
  const rawCity = h.get("x-vercel-ip-city");
  const city = rawCity ? decodeURIComponent(rawCity) : null;
  const country = h.get("x-vercel-ip-country");
  return [city, country].filter(Boolean).join(", ") || null;
}

/**
 * Loại máy — CHỈ hai nhóm thô. Cố ý không lưu chuỗi user-agent đầy đủ: người
 * xem là NGƯỜI NGOÀI tiệm, và một user-agent đầy đủ là một dấu vân tay.
 */
function deviceOf(h: Headers): "mobile" | "desktop" | null {
  const ua = h.get("user-agent");
  if (!ua) return null;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "mobile" : "desktop";
}

export async function openShare(
  token: string,
  password: string | null,
): Promise<ShareOpenResult> {
  const h = await headers();

  // Muối băm IP là hằng số "bc" — CỐ Ý. Muối theo từng mã thì mỗi lượt dò một
  // mã khác lại rơi vào một khoá đếm khác, và bộ đếm theo IP thành vô dụng đúng
  // lúc cần nhất. Đổi lại, dấu vết ghi vào sổ được CSDL băm lại kèm mã đường
  // dẫn (xem #295) nên vẫn không ghép được giữa hai tiệm.
  const ipHash = ipHashFor(h, "bc");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_share_open", {
    p_token: token,
    p_password: password,
    p_ip_hash: ipHash,
    p_region: regionOf(h),
    p_device: deviceOf(h),
  });

  // Hàm CSDL CỐ Ý không ném lỗi cho kết cục nghiệp vụ (ném lỗi sẽ cuộn ngược
  // luôn bộ đếm chống dò — xem chú thích trong #295). Nên `error` ở đây là hỏng
  // THẬT: mất kết nối, sai chữ ký hàm, chưa áp migration…
  if (error) {
    console.error("[bc] report_share_open lỗi:", error.message);
    return { ok: false, reason: "failed" };
  }

  const res = data as {
    ok?: boolean;
    reason?: string;
    report_key?: string;
    period_key?: string;
    payload?: unknown;
    shop_name?: string;
    tz?: string;
    generated_at?: string;
    expires_at?: string;
  } | null;

  if (!res || res.ok !== true) {
    const reason = res?.reason;
    // Lý do lạ ⇒ CHẶN (coi như hỏng), không bao giờ mở. Đây là chỗ một bản CSDL
    // mới hơn có thể trả về mã ta chưa biết; đoán bừa là mở cửa cho cái mình
    // không hiểu.
    if (reason && KNOWN_REASONS.has(reason as ShareOpenFail)) {
      return {
        ok: false,
        reason: reason as ShareOpenFail,
        tz: res?.tz,
        expiresAt: res?.expires_at,
      };
    }
    if (reason) console.error("[bc] report_share_open trả lý do lạ:", reason);
    return { ok: false, reason: "failed" };
  }

  const payload = parseSharePayload(res.report_key ?? "", res.payload);
  // Bản chụp đọc không ra (ghi bởi bản mã cũ hơn, hoặc khuôn đã đổi) ⇒ báo hỏng.
  // TUYỆT ĐỐI không in một bảng trống: người xem sẽ tưởng tiệm không có số.
  if (!payload || !res.tz || !res.generated_at || !res.expires_at) {
    console.error("[bc] bản chụp không đọc được, report_key =", res.report_key);
    return { ok: false, reason: "failed" };
  }

  return {
    ok: true,
    payload,
    periodKey: res.period_key ?? "",
    shopName: res.shop_name ?? "",
    tz: res.tz,
    generatedAt: res.generated_at,
    expiresAt: res.expires_at,
  };
}
