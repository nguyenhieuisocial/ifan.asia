import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeSearch,
  type ActivityRow,
  type ContactDetailRow,
  type ContactRow,
  type ConversationLite,
  type LeadSource,
} from "./types";

/**
 * Fetcher dùng chung: server component load initial, client (TanStack Query)
 * refetch — cùng một câu select để shape dữ liệu khớp nhau.
 */

export const PAGE_SIZE = 50;

const CONTACTS_SELECT = `id, full_name, phone, email, tier, lead_score, owner_id, created_at, updated_at,
  lead_sources(name),
  contact_tags(tags(id, name, color))`;

export type ContactsPage = { rows: ContactRow[]; nextCursor: string | null };

/** "recent" = mặc định (mới nhất trước); "score" = khách nóng trước. */
export type ContactsSort = "recent" | "score";

export type ContactsFilter = {
  q: string;
  sourceId: string | null;
  mineOnly: boolean;
  userId: string;
  sort: ContactsSort;
};

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

  // Tìm không dấu: normalize phía client TRƯỚC khi query, khớp cột search_text
  const normalized = normalizeSearch(filter.q).replace(/[%_]/g, "\\$&");
  if (normalized) query = query.ilike("search_text", `%${normalized}%`);
  if (filter.sourceId) query = query.eq("source_id", filter.sourceId);
  if (filter.mineOnly) query = query.eq("owner_id", filter.userId);
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
    .select("id, name")
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
      `id, full_name, phone, email, tier, lead_score, owner_id, source_id, company_id, created_at, updated_at,
       lead_sources(id, name),
       companies(id, name),
       contact_tags(tags(id, name, color))`,
    )
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as ContactDetailRow | null;
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
