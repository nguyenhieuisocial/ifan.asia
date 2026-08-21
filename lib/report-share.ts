import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { enUS, vi } from "date-fns/locale";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { SITE_URL } from "@/lib/config";
import { KPI_METRICS } from "@/lib/kpi";

/**
 * Chia sẻ báo cáo bằng đường dẫn có hạn (migration #295) — HÌNH DỮ LIỆU dùng
 * chung cho cả hai đầu: màn Cài đặt của chủ tiệm và trang công khai /bc/[token].
 * Thẻ design: design-system/man-chia-se-bao-cao.html.
 *
 * File này CỐ Ý không import gì từ `app/**` và không chạm Supabase: nó là hợp
 * đồng giữa hai đầu. Phần GẠN SỐ (đọc báo cáo thật rồi rút ra bản chụp) nằm ở
 * `app/app/settings/report-shares/actions.ts`, nơi có sẵn phiên đăng nhập của
 * chủ tiệm để RLS áp đúng.
 */

// ══════════════════════════════════════════════════════════════════════════
// DANH SÁCH ĐÓNG — phải khớp ĐÚNG ràng buộc `report_shares_bao_cao_hop_le`
// ══════════════════════════════════════════════════════════════════════════
/**
 * Vì sao chỉ có 2, và vì sao KHÔNG phải "màn nào cũng chia sẻ được":
 * mỗi báo cáo cần một hàm gạn số viết tay, quyết định cột nào ra ngoài và cột
 * nào ở lại. Mở cho mọi màn nghĩa là một ngày nào đó có màn mới lọt ra internet
 * mà không ai xét — đúng loại lỗ mà một danh sách đóng chặn được bằng cấu trúc.
 *
 * VẮNG MẶT CÓ LÝ DO (21/08): "Nguồn nào ra tiền" (`app/app/reports/sources/**`)
 * và "Lãi gộp" (`lib/finance/**`) — hai vùng tệp đó đang có người khác sửa
 * trong cùng phiên nên không đụng vào. Thêm chúng sau là việc của HAI chỗ:
 * ràng buộc `report_shares_bao_cao_hop_le` ở #295, và một hàm gạn số ở actions.
 */
export const SHARE_REPORT_KEYS = ["lost_reasons", "kpi"] as const;
export type ShareReportKey = (typeof SHARE_REPORT_KEYS)[number];

export function isShareReportKey(v: string): v is ShareReportKey {
  return (SHARE_REPORT_KEYS as readonly string[]).includes(v);
}

/** Kỳ chọn được cho "Vì sao thua" — trùng đúng 3 kỳ của màn trong app. */
export const LOST_SHARE_PERIODS = ["month", "3m", "all"] as const;

/** Hạn dùng chọn được. Trần 90 ngày ép ở CSDL, không chỉ ở ô chọn này. */
export const SHARE_DAY_OPTIONS = [7, 14, 30, 90] as const;
export const SHARE_DEFAULT_DAYS = 7;

// ══════════════════════════════════════════════════════════════════════════
// BẢN CHỤP — chỉ SỐ và NHÃN, không mã định danh nào
// ══════════════════════════════════════════════════════════════════════════
/**
 * Hai khuôn dưới đây là toàn bộ những gì rời khỏi tiệm.
 *
 * ⚠️ ĐỌC KỸ TRƯỚC KHI THÊM TRƯỜNG: mỗi trường thêm vào đây là một thứ đi ra
 * internet vĩnh viễn cho tới khi đường dẫn hết hạn. CỐ Ý KHÔNG có `reason_id`,
 * `user_id`, `contact_id` hay bất kỳ uuid nào — người xem không cần chúng, và
 * một uuid lọt ra ngoài là một đầu mối để dò tiếp.
 *
 * `v` là số hiệu khuôn. Bản chụp cũ nằm lại trong CSDL sau khi khuôn đổi, nên
 * phải đọc được bằng số hiệu chứ không bằng phỏng đoán.
 */
const lostRowSchema = z.object({
  /** Khoá dịch của lý do cài sẵn (vd `lostReason.price`); lý do tự đặt = null. */
  key: z.string().max(60).nullable(),
  /** Tên đã hiện lúc chụp — dùng khi không có khoá dịch. */
  name: z.string().max(120),
  cnt: z.number().int().nonnegative(),
  prevCnt: z.number().int().nonnegative(),
});

const lostPayloadSchema = z.object({
  v: z.literal(1),
  rows: z.array(lostRowSchema).max(200),
  total: z.number().int().nonnegative(),
  prevTotal: z.number().int().nonnegative(),
});

const kpiPayloadSchema = z.object({
  v: z.literal(1),
  monthKey: z.string().max(10),
  daysInMonth: z.number().int().positive(),
  daysElapsed: z.number().int().nonnegative(),
  rows: z
    .array(
      z.object({
        /** Tên hiển thị đã chốt lúc chụp; null = mục tiêu CẢ TIỆM. */
        who: z.string().max(120).nullable(),
        metric: z.enum(KPI_METRICS),
        target: z.number().nonnegative(),
        actual: z.number().nonnegative(),
        pace: z.number().nonnegative(),
      }),
    )
    .max(300),
});

export type LostSharePayload = z.infer<typeof lostPayloadSchema>;
export type KpiSharePayload = z.infer<typeof kpiPayloadSchema>;

export type SharePayload =
  | { reportKey: "lost_reasons"; data: LostSharePayload }
  | { reportKey: "kpi"; data: KpiSharePayload };

/**
 * Đọc bản chụp lấy từ CSDL về.
 *
 * Vẫn kiểm khuôn dù chính ta ghi ra nó: bản chụp có thể được ghi bởi một bản
 * mã CŨ HƠN (đường dẫn sống tới 90 ngày, mã deploy nhiều lần trong quãng đó).
 * Trả `null` khi không đọc được — trang công khai hiện một câu rõ ràng, KHÔNG
 * vỡ trang và cũng KHÔNG in bừa một bảng trống trông như "tiệm không có số".
 */
export function parseSharePayload(reportKey: string, raw: unknown): SharePayload | null {
  if (reportKey === "lost_reasons") {
    const p = lostPayloadSchema.safeParse(raw);
    return p.success ? { reportKey: "lost_reasons", data: p.data } : null;
  }
  if (reportKey === "kpi") {
    const p = kpiPayloadSchema.safeParse(raw);
    return p.success ? { reportKey: "kpi", data: p.data } : null;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// ĐỊA CHỈ + GIỜ
// ══════════════════════════════════════════════════════════════════════════
/** Đường dẫn công khai của một đường chia sẻ. MỘT nguồn cho cả hai đầu. */
export function shareUrl(token: string): string {
  return `${SITE_URL}/bc/${token}`;
}

/**
 * Giờ hiển thị: MÚI GIỜ THEO TIỆM (`tenants.timezone`, RPC trả kèm), ngôn ngữ
 * theo người đang đọc.
 *
 * CỐ Ý không dùng `formatDateTime` của lib/format.ts: hàm đó ghim cứng giờ VN.
 * Đúng cho mọi màn trong app hôm nay, nhưng ở đây một trong hai đầu là NGƯỜI
 * NGOÀI, và ngày hết hạn phải là ngày mà CHỦ TIỆM hiểu — không phải giờ máy chủ
 * cũng không phải giờ máy của khách (bài học #99/#192).
 */
export function formatInTenantTz(
  iso: string,
  tz: string,
  locale: Locale,
  withTime = true,
): string {
  const pattern =
    locale === "vi"
      ? withTime
        ? "dd/MM/yyyy HH:mm"
        : "dd/MM/yyyy"
      : withTime
        ? "MMM d, yyyy HH:mm"
        : "MMM d, yyyy";
  return format(new TZDate(new Date(iso), tz), pattern, {
    locale: locale === "vi" ? vi : enUS,
  });
}

/** Số ngày còn lại (làm tròn lên) — âm/0 nghĩa là đã hết hạn. */
export function daysLeft(expiresAtIso: string, now: number = Date.now()): number {
  return Math.ceil((new Date(expiresAtIso).getTime() - now) / 86_400_000);
}
