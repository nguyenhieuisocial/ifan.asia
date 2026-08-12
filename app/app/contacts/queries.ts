import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeSearch,
  type ActivityRow,
  type ContactDetailRow,
  type ContactRow,
  type ConversationLite,
  type LeadSource,
  type Tier,
} from "./types";

/**
 * Fetcher dùng chung: server component load initial, client (TanStack Query)
 * refetch — cùng một câu select để shape dữ liệu khớp nhau.
 */

export const PAGE_SIZE = 50;

const CONTACTS_SELECT = `id, full_name, phone, email, tier, lead_score, owner_id, created_at, updated_at, custom,
  lead_sources(name, i18n_key),
  contact_tags(tags(id, name, color))`;

export type ContactsPage = { rows: ContactRow[]; nextCursor: string | null };

/** "recent" = mặc định (mới nhất trước); "score" = khách nóng trước. */
export type ContactsSort = "recent" | "score";

export type ContactsFilter = {
  q: string;
  sourceId: string | null;
  /** null = mọi hạng; ngược lại lọc đúng 1 hạng (Mới · Quen · VIP · Nguội). */
  tier: Tier | null;
  /** null = không lọc; ngược lại chỉ hiện khách chưa tương tác từ N ngày trở
   *  lên (kể cả khách chưa từng tương tác — last_interaction_at NULL). Mục
   *  36.7/36.9F — chiều lọc bắt buộc để saved_views có giá trị thật. */
  inactiveDays: number | null;
  /** null = mọi nhãn; ngược lại chỉ hiện khách đang gắn đúng 1 nhãn này
   *  (V1b bước 5-6, nốt lại phần "lọc theo nhãn" bỏ sót ở task #79). */
  tagId: string | null;
  /** `cf_<khoá>` — trường tùy biến pack khai `filterable` (24o). Rỗng = không
   *  lọc theo trường nào; so khớp CHÍNH XÁC (mọi trường tùy biến lưu dạng
   *  chuỗi, kể cả number/date, đúng như contact-form-dialog đang ghi). */
  custom: Record<string, string>;
  mineOnly: boolean;
  userId: string;
  sort: ContactsSort;
};

/** Phần bộ lọc không phụ thuộc phân trang — dùng chung giữa danh sách và xuất Excel. */
export type ContactsFilterBase = Omit<ContactsFilter, "sort">;

/** UUID không tồn tại thật — dùng làm điều kiện "chắc chắn 0 dòng" khi nhãn
 *  lọc không khớp khách nào, thay vì gọi `.in("id", [])` (PostgREST/supabase-js
 *  không đảm bảo xử mảng rỗng nhất quán giữa các bản). */
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Áp bộ lọc (tìm không dấu / nguồn / của tôi / nhãn / trường tùy biến) lên
 * một query contacts bất kỳ. Giữ MỘT chỗ duy nhất để danh sách và file xuất
 * luôn ra cùng tập kết quả. Bất đồng bộ vì lọc theo nhãn phải tra bảng nối
 * `contact_tags` trước (không dựng được bằng `.eq()` trên chính bảng contacts).
 *
 * Trả về BỌC trong `{ query }` thay vì trả thẳng builder: builder Postgrest
 * có `.then()` (thenable) — trả thẳng từ hàm `async` khiến JS tự "mở" nó ra
 * (Promise nuốt thenable lồng nhau), làm câu truy vấn CHẠY NGAY tại đây thay
 * vì chờ gắn thêm điều kiện ở nơi gọi. Bọc một lớp object để cắt chuỗi đó.
 */
export async function applyContactsFilter<
  Q extends {
    ilike: (column: string, pattern: string) => Q;
    eq: (column: string, value: string) => Q;
    or: (filters: string) => Q;
    in: (column: string, values: string[]) => Q;
  },
>(
  supabase: SupabaseClient,
  query: Q,
  filter: ContactsFilterBase,
): Promise<{ query: Q }> {
  // Tìm không dấu: normalize phía client TRƯỚC khi query, khớp cột search_text
  const normalized = normalizeSearch(filter.q).replace(/[%_]/g, "\\$&");
  let next = query;
  if (normalized) next = next.ilike("search_text", `%${normalized}%`);
  if (filter.sourceId) next = next.eq("source_id", filter.sourceId);
  if (filter.tier) next = next.eq("tier", filter.tier);
  if (filter.mineOnly) next = next.eq("owner_id", filter.userId);
  // "Chưa quay lại N ngày" — tính CẢ khách chưa từng tương tác (NULL) là
  // "chưa quay lại". Mốc tính ở phía client (giờ máy chủ Next đủ gần now()
  // CSDL — chênh vài giây không ảnh hưởng phép lọc theo NGÀY).
  if (filter.inactiveDays) {
    const cutoff = new Date(Date.now() - filter.inactiveDays * 86_400_000).toISOString();
    next = next.or(`last_interaction_at.is.null,last_interaction_at.lt.${cutoff}`);
  }
  if (filter.tagId) {
    const { data } = await supabase
      .from("contact_tags")
      .select("contact_id")
      .eq("tag_id", filter.tagId);
    const ids = (data ?? []).map((r) => r.contact_id as string);
    next = next.in("id", ids.length > 0 ? ids : [NO_MATCH_ID]);
  }
  for (const [key, value] of Object.entries(filter.custom)) {
    if (value) next = next.eq(`custom->>${key}`, value);
  }
  return { query: next };
}

export async function fetchContactsPage(
  supabase: SupabaseClient,
  filter: ContactsFilter,
  cursor: string | null,
): Promise<ContactsPage> {
  let query = supabase
    .from("contacts")
    .select(CONTACTS_SELECT)
    .is("deleted_at", null)
    .limit(PAGE_SIZE);

  // Sort điểm: khách nóng trước, tie-break created_at để cursor ổn định
  if (filter.sort === "score") {
    query = query
      .order("lead_score", { ascending: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  ({ query } = await applyContactsFilter(supabase, query, filter));
  if (cursor) {
    if (filter.sort === "score") {
      // cursor "score|created_at": (lead_score, created_at) < cursor theo thứ tự sort
      const [s, at] = cursor.split("|");
      query = query.or(
        `lead_score.lt.${s},and(lead_score.eq.${s},created_at.lt."${at}")`,
      );
    } else {
      query = query.lt("created_at", cursor);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ContactRow[];
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor:
      rows.length === PAGE_SIZE
        ? filter.sort === "score"
          ? `${last.lead_score}|${last.created_at}`
          : last.created_at
        : null,
  };
}

export async function fetchLeadSources(
  supabase: SupabaseClient,
): Promise<LeadSource[]> {
  const { data, error } = await supabase
    .from("lead_sources")
    .select("id, name, i18n_key")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadSource[];
}

export async function fetchContactDetail(
  supabase: SupabaseClient,
  contactId: string,
): Promise<ContactDetailRow | null> {
  const { data, error } = await supabase
    .from("contacts")
    .select(
      `id, full_name, phone, email, tier, lead_score, owner_id, source_id, company_id,
       total_revenue, last_interaction_at, created_at, updated_at, custom,
       lead_sources(id, name, i18n_key),
       companies(id, name, deleted_at),
       contact_tags(tags(id, name, color))`,
    )
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  // Công ty đã xóa mềm: coi như khách chưa có công ty. Xóa công ty chỉ gỡ được
  // company_id của những khách người xóa có quyền sửa (RLS contacts_update), nên
  // liên kết "mồ côi" vẫn có thể còn — không được dẫn người dùng vào hồ sơ đã xóa.
  const row = data as unknown as ContactDetailRow & {
    companies: { id: string; name: string; deleted_at: string | null } | null;
  };
  if (row.companies?.deleted_at) {
    row.companies = null;
    row.company_id = null;
  }
  return row as ContactDetailRow;
}

/**
 * Số lần khách đã mua (deal thắng) — dùng để giải thích VÌ SAO khách đang ở hạng
 * hiện tại. Cùng điều kiện với `recompute_contact_tier()` (migration #19).
 */
export async function fetchWonDealCount(
  supabase: SupabaseClient,
  contactId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("status", "won")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function fetchContactTimeline(
  supabase: SupabaseClient,
  contactId: string,
): Promise<{ activities: ActivityRow[]; conversations: ConversationLite[] }> {
  const [activitiesRes, conversationsRes] = await Promise.all([
    supabase
      .from("activities")
      .select("id, type, subject, body, owner_id, due_at, done_at, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("conversations")
      .select("id, status, last_message_at, created_at, channels(type, display_name)")
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50),
  ]);
  if (activitiesRes.error) throw new Error(activitiesRes.error.message);
  if (conversationsRes.error) throw new Error(conversationsRes.error.message);
  return {
    activities: (activitiesRes.data ?? []) as unknown as ActivityRow[],
    conversations: (conversationsRes.data ?? []) as unknown as ConversationLite[],
  };
}
