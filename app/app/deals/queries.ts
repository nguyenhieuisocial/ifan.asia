import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSearch } from "../contacts/types";
import type {
  BoardData,
  ContactDealRow,
  ContactOption,
  DealRow,
  LostReason,
  Pipeline,
  PipelineStage,
} from "./types";

/**
 * Fetcher dùng chung màn Cơ hội. Mọi câu query đi qua client đã đăng nhập →
 * RLS tự giới hạn tenant + quyền (staff chỉ thấy deal mình phụ trách).
 */

const DEAL_SELECT = `id, title, value_vnd, stage_id, status, contact_id, owner_id,
  expected_close_date, next_action_at, next_action_note, lost_reason_id,
  stage_entered_at, created_at,
  contacts(id, full_name, lead_score)`;

/** Trần số deal tải 1 lần cho bảng Kanban đợt 1 (phân trang theo cột: đợt 2). */
export const BOARD_DEAL_LIMIT = 500;

/**
 * Đảm bảo tenant có pipeline mặc định + cột Thua + lý do thua.
 * Idempotent (definer, migration #13) — gọi mỗi lần mở màn, lần 2 trở đi là no-op.
 */
export async function ensureDealDefaults(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("ensure_deal_defaults");
  if (error) throw new Error(error.message);
}

/** Pipeline mặc định của tenant (đợt 1 mỗi tenant 1 pipeline; chọn pipeline = đợt 2). */
async function fetchDefaultPipeline(
  supabase: SupabaseClient,
): Promise<Pipeline | null> {
  const { data, error } = await supabase
    .from("pipelines")
    .select("id, name")
    .order("is_default", { ascending: false })
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Pipeline | null;
}

export async function fetchLostReasons(
  supabase: SupabaseClient,
): Promise<LostReason[]> {
  const { data, error } = await supabase
    .from("lost_reasons")
    .select("id, name")
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LostReason[];
}

/** Toàn bộ dữ liệu bảng Kanban: pipeline mặc định + stage + deal chưa xóa + lý do thua. */
export async function fetchBoard(
  supabase: SupabaseClient,
): Promise<BoardData | null> {
  const pipeline = await fetchDefaultPipeline(supabase);
  if (!pipeline) return null;

  const [stagesRes, dealsRes, lostReasons] = await Promise.all([
    supabase
      .from("pipeline_stages")
      .select("id, name, position, kind, win_probability")
      .eq("pipeline_id", pipeline.id)
      .order("position", { ascending: true }),
    supabase
      .from("deals")
      .select(DEAL_SELECT)
      .eq("pipeline_id", pipeline.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(BOARD_DEAL_LIMIT),
    fetchLostReasons(supabase),
  ]);
  if (stagesRes.error) throw new Error(stagesRes.error.message);
  if (dealsRes.error) throw new Error(dealsRes.error.message);

  return {
    pipeline,
    stages: (stagesRes.data ?? []) as PipelineStage[],
    deals: (dealsRes.data ?? []) as unknown as DealRow[],
    lostReasons,
  };
}

/** Các cột MỞ của pipeline mặc định — form tạo/sửa cơ hội chỉ chọn được cột mở. */
export async function fetchOpenStages(
  supabase: SupabaseClient,
): Promise<PipelineStage[]> {
  const pipeline = await fetchDefaultPipeline(supabase);
  if (!pipeline) return [];
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id, name, position, kind, win_probability")
    .eq("pipeline_id", pipeline.id)
    .eq("kind", "open")
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PipelineStage[];
}

/** Vai được phép gán cơ hội cho người khác (khớp policy deals_insert/deals_update). */
const MANAGE_ROLES = ["owner", "admin", "manager"];

/** Danh sách thành viên tenant + quyền gán cơ hội cho người khác (1 query). */
export async function fetchDealPermissions(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ memberIds: string[]; canAssignOthers: boolean }> {
  const { data, error } = await supabase
    .from("tenant_members")
    .select("user_id, role");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { user_id: string; role: string }[];
  return {
    memberIds: rows.map((r) => r.user_id),
    canAssignOthers: MANAGE_ROLES.includes(
      rows.find((r) => r.user_id === userId)?.role ?? "",
    ),
  };
}

/** Cơ hội của 1 khách — card mini trong hồ sơ 360. */
export async function fetchContactDeals(
  supabase: SupabaseClient,
  contactId: string,
): Promise<ContactDealRow[]> {
  const { data, error } = await supabase
    .from("deals")
    .select(
      `id, title, value_vnd, status, next_action_at, pipeline_stages(name, kind)`,
    )
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ContactDealRow[];
}

export const CONTACT_OPTION_LIMIT = 20;

/**
 * Gợi ý khách cho ô chọn khách của form cơ hội — tìm không dấu như màn Khách hàng
 * (normalize phía client trước khi khớp cột contacts.search_text do DB sinh).
 */
export async function searchContactOptions(
  supabase: SupabaseClient,
  q: string,
): Promise<ContactOption[]> {
  let query = supabase
    .from("contacts")
    .select("id, full_name, phone")
    .is("deleted_at", null)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(CONTACT_OPTION_LIMIT);

  const normalized = normalizeSearch(q).replace(/[%_]/g, "\\$&");
  if (normalized) query = query.ilike("search_text", `%${normalized}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ContactOption[];
}
