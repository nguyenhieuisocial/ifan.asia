"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { newVisitorToken, sha256Hex, ipHashFor } from "@/lib/channels/livechat";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";

/**
 * Form thu lead công khai /t/[slug] (ADR-0008 mục 7, task #88).
 *
 * Danh tính khách vãng lai KHÔNG qua localStorage/JS như widget Live Chat (đó
 * là trang của BÊN THỨ BA, phải tự quản lý token ở tầng JS) — đây là trang
 * NHẤT THỂ của iFan nên dùng cookie httpOnly do chính server action này phát:
 * đơn giản hơn, và token không bao giờ lộ ra phía JS trình duyệt. sha256 +
 * ipHashFor tái dùng nguyên hàm của Live Chat (#23) — cùng công thức băm.
 */
const COOKIE_NAME = "ifan_sf_tok";

async function tokenHash(): Promise<string> {
  const jar = await cookies();
  let raw = jar.get(COOKIE_NAME)?.value;
  if (!raw || raw.length !== 64) {
    raw = newVisitorToken();
    jar.set(COOKIE_NAME, raw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return sha256Hex(raw);
}

const submitSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
  fields: z.record(z.string(), z.string().max(200)).default({}),
  /**
   * Mã QR khách mang theo từ `?ifan_qr` (migration #201). Chuỗi NGẮN và KHÔNG
   * tin cậy — nó nằm trên URL, ai cũng sửa được — nên ép chữ thường + chặn 16
   * ký tự ngay tại cổng vào, không để chuỗi tuỳ ý đi thẳng xuống CSDL.
   *
   * `.catch(undefined)` là CỐ Ý: giá trị hỏng biến thành "không có mã" chứ
   * KHÔNG làm hỏng cả lượt gửi. Khách đang muốn để lại số — chặn họ vì một
   * tham số rác trên URL là đổi một lead thật lấy một phép kiểm hình thức
   * (cùng luật "mềm" của migration #57 và #201).
   */
  qrCode: z.string().trim().toLowerCase().max(16).optional().catch(undefined),
});

export type SubmitLeadResult =
  | { error: null; duplicate: boolean }
  | { error: "invalid_input" | "not_found" | "form_disabled" | "invalid_phone" | "rate_limited" | "failed" };

export async function submitStorefrontLead(
  input: z.infer<typeof submitSchema>,
): Promise<SubmitLeadResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const h = await headers();
  const p_token_hash = await tokenHash();
  const p_ip_hash = ipHashFor(h, parsed.data.slug);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_submit_lead", {
    p_slug: parsed.data.slug,
    p_token_hash,
    p_ip_hash,
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_fields: parsed.data.fields,
    p_qr_code: parsed.data.qrCode ?? null,
  });

  if (error) {
    for (const key of ["not_found", "form_disabled", "invalid_phone", "invalid_request", "rate_limited"] as const) {
      if (error.message.includes(key)) {
        return { error: key === "invalid_request" ? "invalid_input" : key };
      }
    }
    return { error: "failed" };
  }

  return { error: null, duplicate: Boolean((data as { duplicate?: boolean } | null)?.duplicate) };
}

// ══════════════════════════════════════════════════════════════════════════
// KHÁCH TỰ ĐẶT LỊCH (#290) — thẻ design man-khach-tu-dat-lich.html
// ══════════════════════════════════════════════════════════════════════════

/**
 * Mã lỗi CSDL → mã lỗi màn hình.
 *
 * ⚠️ THỨ TỰ QUAN TRỌNG: 'not_found' là CHUỖI CON của 'item_not_found'. So bằng
 * `includes` mà để 'not_found' đứng trước thì mọi lỗi "không có dịch vụ đó"
 * biến thành "không có tiệm đó", và khách nhận sai câu. Dài trước, ngắn sau.
 */
const BOOKING_ERROR_KEYS = [
  "item_not_found",
  "booking_disabled",
  "invalid_phone",
  "invalid_request",
  "rate_limited",
  "slot_invalid",
  "slot_taken",
  "no_staff",
  "not_found",
] as const;

type BookingErrorKey = (typeof BOOKING_ERROR_KEYS)[number];

function bookingErrorOf(message: string): BookingErrorKey | "failed" {
  for (const key of BOOKING_ERROR_KEYS) {
    if (message.includes(key)) return key;
  }
  return "failed";
}

export type StorefrontSlot = { start: string; label: string; taken: boolean };

export type StorefrontSlotsResult =
  | {
      error: null;
      slots: StorefrontSlot[];
      closure: { reason: string; is_full_day: boolean } | null;
      itemName: string;
      durationMinutes: number;
      priceVnd: number;
    }
  | { error: BookingErrorKey | "failed" | "invalid_input" | "throttled" };

const slotsSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  itemId: z.uuid(),
  // Ngày THUẦN theo lịch của TIỆM ("YYYY-MM-DD"), do CSDL sinh ra và trả về —
  // tầng web KHÔNG tự đổi múi giờ lần nữa (bài học #99, #192).
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Đọc khung giờ còn trống của một ngày. Gọi mỗi lần khách bấm sang ngày khác.
 *
 * Chốt chặn riêng theo IP: đây là server action, KHÔNG đi qua chốt 300/phút của
 * thân trang `/t/[slug]` — không có chốt ở đây thì một vòng lặp gọi được vô
 * hạn. 120/phút rộng hơn nhịp bấm của người thật rất nhiều (một khách xem hết
 * 60 ngày cũng chỉ tốn 60 lượt), nhưng đủ chặn vòng lặp máy.
 */
export async function fetchStorefrontSlots(
  input: z.infer<typeof slotsSchema>,
): Promise<StorefrontSlotsResult> {
  const parsed = slotsSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const h = await headers();
  const { allowed } = await rateLimit(`storefront:slots:${clientIpFrom(h)}`, 120, 60);
  if (!allowed) return { error: "throttled" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_slots", {
    p_slug: parsed.data.slug,
    p_item: parsed.data.itemId,
    p_date: parsed.data.dateKey,
  });
  if (error) return { error: bookingErrorOf(error.message) };
  if (!data) return { error: "failed" };

  const d = data as {
    slots?: StorefrontSlot[];
    closure?: { reason: string; is_full_day: boolean } | null;
    item_name?: string;
    duration_minutes?: number;
    price_vnd?: number;
  };
  return {
    error: null,
    slots: d.slots ?? [],
    closure: d.closure ?? null,
    itemName: d.item_name ?? "",
    durationMinutes: d.duration_minutes ?? 0,
    priceVnd: d.price_vnd ?? 0,
  };
}

const bookSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  itemId: z.uuid(),
  /** Mốc giờ LẤY NGUYÊN VĂN từ `fetchStorefrontSlots` — không tự dựng lại. */
  start: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
  note: z.string().trim().max(500).default(""),
});

export type SubmitBookingResult =
  | {
      error: null;
      appointmentId: string;
      dateKey: string;
      label: string;
      itemName: string;
      durationMinutes: number;
      priceVnd: number;
    }
  | { error: BookingErrorKey | "failed" | "invalid_input" };

/**
 * Đặt lịch thật.
 *
 * KHÔNG kiểm "giờ này còn trống không" ở đây — chốt chống trùng nằm ở ràng buộc
 * EXCLUDE của CSDL (migration #83/#229), và `storefront_book` dịch mã 23P01
 * thành 'slot_taken'. Kiểm ở tầng web rồi mới ghi là mở lại đúng cái khe mà
 * ràng buộc kia sinh ra để bịt: hai người bấm cùng lúc sẽ lọt cả hai.
 */
export async function submitStorefrontBooking(
  input: z.infer<typeof bookSchema>,
): Promise<SubmitBookingResult> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const h = await headers();
  const p_ip_hash = ipHashFor(h, parsed.data.slug);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_book", {
    p_slug: parsed.data.slug,
    p_item: parsed.data.itemId,
    p_start: parsed.data.start,
    p_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_note: parsed.data.note || null,
    p_ip_hash,
  });
  if (error) return { error: bookingErrorOf(error.message) };

  const d = data as {
    appointment_id?: string;
    date?: string;
    label?: string;
    item_name?: string;
    duration_minutes?: number;
    price_vnd?: number;
  } | null;
  // Không nuốt lỗi: RPC trả về rỗng nghĩa là KHÔNG có lịch nào được ghi, dù
  // Supabase không báo lỗi. Báo "đã đặt" trong ca đó là nói dối với khách.
  if (!d?.appointment_id) return { error: "failed" };

  return {
    error: null,
    appointmentId: d.appointment_id,
    dateKey: d.date ?? "",
    label: d.label ?? "",
    itemName: d.item_name ?? "",
    durationMinutes: d.duration_minutes ?? 0,
    priceVnd: d.price_vnd ?? 0,
  };
}
