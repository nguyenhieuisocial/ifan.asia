import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Kho tri thức (ADR-0015) — kiểu + truy vấn dùng chung cho màn Cài đặt.
 *
 * Đọc trước khi sửa: chốt chặn THẬT nằm ở CSDL (`kb_entries_guard()`,
 * migration #113-115) — file này chỉ đọc/ghi qua RLS bình thường, không phải
 * nơi quyết định ai được đăng/xoá/gỡ đăng.
 */

export const KB_MAX_ENTRIES = 200;
export const KB_MAX_CHARS = 60_000;
export const KB_QUESTION_MAX = 200;
export const KB_ANSWER_MAX = 2_000;
export const KB_CUSTOM_INSTRUCTION_MAX = 1_000;

/** Ngưỡng "đáng kiểm lại" trên màn — KHÔNG phải luật CSDL, chỉ để tô cảnh báo. */
export const KB_STALE_DAYS = 180;

export type KbStatus = "draft" | "published";

export type KbEntry = {
  id: string;
  question: string;
  answer: string;
  status: KbStatus;
  updatedAt: string;
  updatedByName: string | null;
};

type KbEntryRow = {
  id: string;
  question: string;
  answer: string;
  status: KbStatus;
  updated_at: string;
  updated_by: string | null;
};

export async function listKbEntries(supabase: SupabaseClient): Promise<KbEntry[]> {
  const { data } = await supabase
    .from("kb_entries")
    .select("id, question, answer, status, updated_at, updated_by")
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as KbEntryRow[];
  if (rows.length === 0) return [];

  // Tên người sửa cuối — bảng profiles (user_id, display_name), khuôn ĐÚNG
  // fetchDisplayNames() ở app/app/approvals/queries.ts. Không import chéo qua
  // route khác — mỗi tính năng tự tra bảng nhỏ này, đúng nếp đang dùng.
  const { data: profiles } = await supabase.from("profiles").select("user_id, display_name");
  const names = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  );

  return rows.map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    status: r.status,
    updatedAt: r.updated_at,
    updatedByName: r.updated_by ? (names.get(r.updated_by) ?? null) : null,
  }));
}

export function kbUsage(entries: KbEntry[]): { count: number; chars: number } {
  return entries.reduce(
    (acc, e) => ({
      count: acc.count + 1,
      chars: acc.chars + e.question.length + e.answer.length,
    }),
    { count: 0, chars: 0 },
  );
}

export function isKbEntryStale(updatedAt: string): boolean {
  const days = (Date.now() - new Date(updatedAt).getTime()) / 86_400_000;
  return days >= KB_STALE_DAYS;
}

/**
 * "Lời dặn riêng" nằm trong CÙNG hàng `ai_autopilot` (cột `custom_instruction`,
 * migration #113) — không phải bảng riêng, vì nó là MỘT cấu hình của AI trực
 * việc, không phải một mục kho tri thức. RLS `ai_autopilot_manage` (chỉ
 * owner/admin/manager) đã tự chặn staff đọc được cột này — trả về null cho
 * staff KHÔNG phải lỗi, chỉ là 0 dòng qua được RLS.
 */
export async function getCustomInstruction(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("ai_autopilot").select("custom_instruction").maybeSingle();
  return (data?.custom_instruction as string | null) ?? null;
}
