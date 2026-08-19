import type { SupabaseClient } from "@supabase/supabase-js";
import { NGAY_COI_LA_BO_QUEN } from "@/lib/integrations/api-key";
import { DUONG_BAO_LIMIT, KHOA_LIMIT, type ApiKeyRow, type WebhookRow } from "./types";

/**
 * Đọc dữ liệu cho màn Cài đặt → Tích hợp (V6, migration #160-161).
 *
 * Hai luật của mảng này, viết ở đây để người sau không phá:
 *   1. Bản gốc của khoá KHÔNG có ở đâu để mà đọc. Bảng chỉ giữ bản băm + vài ký
 *      tự đầu/cuối, nên màn hình chỉ hiện được `prefix…suffix`. Ai muốn "xem
 *      lại khoá" thì câu trả lời là tạo khoá mới, không phải thêm một cột.
 *   2. Ngưỡng "bỏ quên" nằm ở MỘT chỗ (`NGAY_COI_LA_BO_QUEN`, lib/integrations)
 *      và được tính tại đây. Màn hình không được tự đặt lại ngưỡng — hai nơi
 *      cùng biết một con số là hai nơi sẽ lệch.
 */

const NGAY_MS = 86_400_000;

/**
 * Khoá ĐANG SỐNG. Khoá đã thu hồi cố ý KHÔNG hiện: màn này trả lời đúng một câu
 * hỏi — "hiện có mấy cửa đang mở vào dữ liệu tiệm". Trộn khoá đã đóng vào danh
 * sách làm loãng chính câu hỏi đó, mà thu hồi vốn là việc không hoàn lại nên
 * cũng chẳng có thao tác nào để làm tiếp với một dòng đã chết.
 */
export async function layKhoaApi(supabase: SupabaseClient): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, key_suffix, scopes, last_used_at, call_count, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(KHOA_LIMIT);
  if (error) throw new Error(error.message);

  const nguong = Date.now() - NGAY_COI_LA_BO_QUEN * NGAY_MS;

  return (data ?? []).map((k) => {
    const lastUsedAt = (k.last_used_at as string | null) ?? null;
    return {
      id: k.id as string,
      name: k.name as string,
      keyPrefix: k.key_prefix as string,
      keySuffix: k.key_suffix as string,
      scopes: (k.scopes ?? []) as string[],
      lastUsedAt,
      callCount: Number(k.call_count ?? 0),
      createdAt: k.created_at as string,
      // Quyết định 3 của thẻ design: máy TỰ gắn nhãn nghi ngờ, không đợi người
      // nhớ đi dọn. Nhãn là một CÂU HỎI ("Bỏ quên?") chứ không phải lời buộc
      // tội — nên khoá vừa tạo mà chưa ai gọi cũng được hỏi, đúng ý thẻ.
      boQuen: lastUsedAt === null || new Date(lastUsedAt).getTime() < nguong,
    };
  });
}

/** Đường báo ra ngoài, kèm sức khoẻ — hiện NGAY trên danh sách, không phải đi tìm. */
export async function layDuongBao(supabase: SupabaseClient): Promise<WebhookRow[]> {
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select(
      "id, name, url, event_types, status, consecutive_failures, last_success_at, last_error, last_error_at",
    )
    .order("created_at", { ascending: false })
    .limit(DUONG_BAO_LIMIT);
  if (error) throw new Error(error.message);

  return (data ?? []).map((w) => ({
    id: w.id as string,
    name: w.name as string,
    url: w.url as string,
    eventTypes: (w.event_types ?? []) as string[],
    status: w.status as "active" | "paused",
    consecutiveFailures: Number(w.consecutive_failures ?? 0),
    lastSuccessAt: (w.last_success_at as string | null) ?? null,
    lastError: (w.last_error as string | null) ?? null,
    lastErrorAt: (w.last_error_at as string | null) ?? null,
  }));
}
