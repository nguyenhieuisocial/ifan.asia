import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMPTY_INBOX_COUNTS,
  INBOX_PAGE_SIZE,
  type ConversationRow,
  type InboxCounts,
  type InboxFilter,
  type MessageRow,
} from "./types";

/**
 * Fetcher dùng chung: server component load initial, client (TanStack Query)
 * refetch — cùng một câu select để shape dữ liệu khớp nhau.
 */

const CONVERSATIONS_SELECT = `id, contact_id, external_user_id, status, assignee_user_id,
  last_message_at, last_user_message_at, is_unanswered, unread_count,
  channels(id, type, display_name),
  contacts(id, full_name, phone, email, contact_tags(tags(id, name, color))),
  messages(content, sender_type, direction)`;

export type FetchConversationsOptions = {
  filter: InboxFilter;
  currentUserId: string;
  /** Số dòng tải (tăng dần theo nút "Xem thêm"). */
  limit?: number;
  /**
   * Hội thoại mở qua link `?c=` — luôn phải có mặt kể cả khi nó nằm ngoài trang
   * đang tải hoặc ngoài bộ lọc, nếu không thì bấm cảnh báo từ Tổng quan sẽ ra
   * màn trắng mà không báo lỗi.
   */
  pinnedId?: string | null;
};

export async function fetchConversations(
  supabase: SupabaseClient,
  { filter, currentUserId, limit = INBOX_PAGE_SIZE, pinnedId = null }: FetchConversationsOptions,
): Promise<ConversationRow[]> {
  // Bộ lọc chạy TRONG CSDL, không lọc trên danh sách đã tải. Lọc trên danh sách
  // tải sẵn là bẫy: tiệm đông hội thoại thì đúng những hội thoại chờ lâu nhất lại
  // nằm ngoài trang đầu và biến mất khỏi bộ lọc.
  let query = supabase.from("conversations").select(CONVERSATIONS_SELECT);
  if (filter !== "all") query = query.neq("status", "closed");
  if (filter === "unanswered") query = query.eq("is_unanswered", true);
  if (filter === "unassigned") query = query.is("assignee_user_id", null);
  if (filter === "mine") query = query.eq("assignee_user_id", currentUserId);

  const { data, error } = await query
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("sent_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ConversationRow[];

  if (pinnedId && !rows.some((c) => c.id === pinnedId)) {
    const pinned = await fetchConversationById(supabase, pinnedId);
    if (pinned) return [pinned, ...rows];
  }
  return rows;
}

/** Tìm ĐÚNG một hội thoại theo id — không phụ thuộc danh sách đang tải. */
export async function fetchConversationById(
  supabase: SupabaseClient,
  id: string,
): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATIONS_SELECT)
    .eq("id", id)
    .order("sent_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as ConversationRow | null) ?? null;
}

/** Số hội thoại mỗi bộ lọc — COUNT trong CSDL, không tải bảng về đếm. */
export async function fetchInboxCounts(
  supabase: SupabaseClient,
): Promise<InboxCounts> {
  const { data, error } = await supabase.rpc("inbox_counts");
  if (error) throw new Error(error.message);
  return { ...EMPTY_INBOX_COUNTS, ...((data ?? {}) as Partial<InboxCounts>) };
}

export type QuickReplyRow = { id: string; title: string; content: string };

/** Câu trả lời nhanh của tenant (Tiệm mẫu, migration #12) — RLS khoanh tenant. */
export async function fetchQuickReplies(
  supabase: SupabaseClient,
): Promise<QuickReplyRow[]> {
  const { data, error } = await supabase
    .from("quick_replies")
    .select("id, title, content")
    .order("sort_order")
    .order("title");
  if (error) throw new Error(error.message);
  return (data ?? []) as QuickReplyRow[];
}

export async function fetchMessages(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<MessageRow[]> {
  // Lấy 200 tin MỚI nhất rồi đảo lại chiều thời gian — hội thoại dài không được giấu tin mới
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, direction, sender_type, sender_user_id, content, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as MessageRow[]).reverse();
}
