import type { SupabaseClient } from "@supabase/supabase-js";

/** Phiên hỗ trợ ĐANG MỞ trên tiệm hiện tại — nguồn duy nhất cho dải báo (mục 36.8-5). */
export type ActiveSupportSession = {
  id: string;
  reason: string;
  started_at: string;
  expires_at: string;
};

/**
 * Trạng thái phiên suy ra từ mốc thời gian (mục 36.12A — KHÔNG có cột status
 * riêng, cố ý, để khỏi lệch tay với ended_at/expires_at): đang mở =
 * ended_at IS NULL AND expires_at > now(). Câu lọc viết thẳng bằng SQL qua
 * PostgREST filter, không so sánh giờ ở tầng Node (đồng hồ server lệch vài
 * giây so với CSDL không sao — mốc so sánh là now() của chính CSDL).
 */
// Trần này phải NÓI RA trên màn hình khi chạm tới — trần ngầm làm người
// dùng tưởng đó là tất cả (bài học #21/#29). View nhận hằng số qua props.
export const SUPPORT_LOG_LIMIT = 100;

export async function fetchActiveSupportSession(
  supabase: SupabaseClient,
): Promise<ActiveSupportSession | null> {
  const { data } = await supabase
    .from("support_sessions")
    .select("id, reason, started_at, expires_at")
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Nhật ký phiên hỗ trợ — chủ tiệm xem được (RLS support_sessions_select: owner/admin). */
export type SupportSessionLogRow = {
  id: string;
  reason: string;
  started_at: string;
  ended_at: string | null;
  ended_by: string | null;
  expires_at: string;
};

export async function fetchSupportSessionLog(
  supabase: SupabaseClient,
): Promise<SupportSessionLogRow[]> {
  const { data, error } = await supabase
    .from("support_sessions")
    .select("id, reason, started_at, ended_at, ended_by, expires_at")
    .order("started_at", { ascending: false })
    .limit(SUPPORT_LOG_LIMIT);
  if (error) throw new Error(error.message);
  return data ?? [];
}
