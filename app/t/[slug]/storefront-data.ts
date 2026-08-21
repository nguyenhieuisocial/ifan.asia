import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import type { StorefrontClosureRow, StorefrontHourRow } from "@/lib/storefront/hours";
import type { TenantPackLeadFormField } from "@/lib/tenant-pack";

/**
 * MỘT cửa đọc `storefront_view` cho CẢ mặt tiền `/t/[slug]` LẪN trang tự đặt
 * lịch `/t/[slug]/dat-lich` (#290).
 *
 * Tách ra khỏi `page.tsx` khi dựng trang đặt lịch: hai trang cùng cần đúng dữ
 * liệu này, và chép sang trang thứ hai là dựng nơi thứ hai để lệch (luật D1).
 * Phần thân giữ NGUYÊN VĂN bản của #88 — kể cả chốt chặn theo IP và lời giải
 * thích vì sao nó nằm TRONG hàm này chứ không ở thân trang.
 */

export type StorefrontBookingItem = {
  id: string;
  name: string;
  duration_minutes: number;
  price_vnd: number;
};

export type StorefrontViewData = {
  enabled: boolean;
  name?: string;
  intro?: string | null;
  address?: string | null;
  zalo_contact_url?: string | null;
  lead_form_enabled?: boolean;
  lead_form_fields?: TenantPackLeadFormField[];
  /** #290 — công tắc "khách tự đặt lịch", mặc định TẮT ở CSDL. */
  booking_enabled?: boolean;
  /** #290 — dịch vụ đặt được; CSDL chỉ trả khi `booking_enabled`. */
  booking_items?: StorefrontBookingItem[];
  timezone?: string;
  now?: string;
  today_weekday?: number;
  hours?: StorefrontHourRow[];
  closures?: StorefrontClosureRow[];
};

/** Thương hiệu tiệm (#334) — logo và màu, cho các trang khách của tiệm nhìn thấy. */
export type ThuongHieu = {
  ten?: string;
  co_logo?: boolean;
  mau?: string | null;
};

export type StorefrontLoad =
  | { kind: "ok"; data: StorefrontViewData; thuongHieu: ThuongHieu }
  | { kind: "throttled" }
  | { kind: "missing" };

/**
 * MỘT lượt đọc duy nhất cho cả `generateMetadata` LẪN thân trang.
 *
 * Trước đây hai nơi cùng gọi `fetchStorefront()` ⇒ MỖI lượt tải trang là HAI
 * lượt gọi `storefront_view` trên CSDL. Trang này công khai và `force-dynamic`
 * (không cache được — nội dung đổi theo giờ mở cửa thật), nên nhân đôi ở đây là
 * nhân đôi đúng thứ tốn nhất. `cache()` của React gom hai lời gọi cùng tham số
 * trong CÙNG một request về một lượt chạy — Next chạy metadata và thân trang
 * trong cùng phạm vi request nên chúng dùng chung kết quả.
 *
 * Chốt chặn theo IP nằm TRONG đây, trước lượt gọi CSDL, vì đây là điểm duy nhất
 * cả hai đường đều đi qua. Đặt ở thân trang thì `generateMetadata` (chạy trước)
 * đã kịp gọi CSDL rồi mới tới lượt chặn.
 *
 * Ngưỡng 300/phút/IP và fail-closed: chép ĐÚNG /q/[code] — cùng loại cửa (trang
 * công khai, khách không đăng nhập), nên cùng một ngưỡng. Rộng là CỐ Ý: nhà mạng
 * VN cho rất nhiều thuê bao dùng chung một IP, chặn nhầm khách thật đắt hơn
 * nhiều so với để lọt vài trăm lượt dò.
 */
export const loadStorefront = cache(async (slug: string): Promise<StorefrontLoad> => {
  const { allowed } = await rateLimit(
    `storefront:ip:${clientIpFrom(await headers())}`,
    300,
    60,
  );
  if (!allowed) return { kind: "throttled" };

  const supabase = await createClient();
  // ⚠️ MỘT lượt gọi duy nhất. Bản đầu tách thương hiệu ra một hàm riêng cho
  //   gọn; bộ kiểm `rls-smoke` bắt được: hàm riêng đó mở cho người lạ và KHÔNG
  //   đi qua cái trần theo địa chỉ mạng ở ngay trên — tức là một cửa thứ hai để
  //   dò xem slug nào có thật, mà dò thoải mái. Đã gộp lại vào `storefront_view`
  //   ở bản vá #337 và xoá hàm kia.
  const { data, error } = await supabase.rpc("storefront_view", { p_slug: slug });
  // 'not_found' (không có tiệm nào mang slug này, HOẶC tiệm chưa bật mặt tiền —
  // migration #209 gộp hai ca đó làm một) VÀ mọi lỗi khác đều rơi về CÙNG một
  // kết quả → notFound(). Người ngoài không phân biệt được ca nào (ADR-0008 mục 5).
  if (error || !data) return { kind: "missing" };
  const d = data as StorefrontViewData & ThuongHieu;
  return {
    kind: "ok",
    data: d,
    // Thương hiệu hỏng thì KHÔNG làm hỏng cả trang — trang mặt tiền quan trọng
    // hơn cái logo. Thiếu thì rơi về màu iFan và hai chữ cái.
    thuongHieu: { co_logo: d.co_logo, mau: d.mau },
  };
});
