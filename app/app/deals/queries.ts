import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSearch, type ActivityRow } from "../contacts/types";
import type {
  BoardData,
  ContactDealRow,
  ContactOption,
  DealDetailRow,
  DealRow,
  DealSlaPolicy,
  LostReason,
  Pipeline,
  PipelineStage,
  StageHistoryRow,
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

// ---------- Màn chi tiết cơ hội (deal 360) ----------

const DEAL_DETAIL_SELECT = `id, title, value_vnd, pipeline_id, stage_id, status, contact_id, owner_id,
  expected_close_date, next_action_at, next_action_note, lost_reason_id,
  stage_entered_at, won_at, lost_at, created_at,
  contacts(id, full_name, phone, lead_score, companies(id, name, deleted_at)),
  lost_reasons(name)`;

/** Một cơ hội + khách + công ty. null khi không thấy (RLS: khác tenant / staff không phụ trách). */
export async function fetchDealDetail(
  supabase: SupabaseClient,
  dealId: string,
): Promise<DealDetailRow | null> {
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_DETAIL_SELECT)
    .eq("id", dealId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  // Công ty đã xóa mềm: coi như chưa có — cùng luật với hồ sơ khách, không dẫn
  // người dùng vào hồ sơ công ty đã xóa.
  const row = data as unknown as DealDetailRow & {
    contacts:
      | (Omit<NonNullable<DealDetailRow["contacts"]>, "companies"> & {
          companies: { id: string; name: string; deleted_at: string | null } | null;
        })
      | null;
  };
  if (row.contacts?.companies?.deleted_at) row.contacts.companies = null;
  return row as DealDetailRow;
}

/** Mọi bước của ĐÚNG pipeline chứa cơ hội (cơ hội cũ có thể ở pipeline khác mặc định). */
export async function fetchPipelineStages(
  supabase: SupabaseClient,
  pipelineId: string,
): Promise<PipelineStage[]> {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id, name, position, kind, win_probability")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PipelineStage[];
}

/** Trần dòng thời gian của 1 cơ hội (phân trang: đợt sau, như hồ sơ khách). */
export const DEAL_TIMELINE_LIMIT = 100;

/** Hoạt động gắn TRỰC TIẾP với cơ hội — không kéo cả lịch sử của khách vào. */
export async function fetchDealActivities(
  supabase: SupabaseClient,
  dealId: string,
): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("id, type, subject, body, owner_id, due_at, done_at, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(DEAL_TIMELINE_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ActivityRow[];
}

/** Lịch sử qua các bước (spec §4.5: ngày vào/ra + số ngày ở mỗi bước). */
export async function fetchDealStageHistory(
  supabase: SupabaseClient,
  dealId: string,
): Promise<StageHistoryRow[]> {
  const { data, error } = await supabase
    .from("deal_stage_history")
    .select("id, from_stage_id, to_stage_id, entered_at, exited_at, duration_seconds")
    .eq("deal_id", dealId)
    .order("entered_at", { ascending: false })
    .limit(DEAL_TIMELINE_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StageHistoryRow[];
}

/**
 * Chính sách cam kết đang bật cho cơ hội — panel SLA màn chi tiết.
 * Đợt 1 mỗi tenant 1 chính sách cho cơ hội, lấy chính sách bật đầu tiên.
 */
export async function fetchActiveDealSlaPolicy(
  supabase: SupabaseClient,
): Promise<DealSlaPolicy | null> {
  const { data, error } = await supabase
    .from("sla_policies")
    .select("name, warn_after_minutes, breach_after_minutes")
    .eq("target_type", "deal")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as DealSlaPolicy | null;
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
