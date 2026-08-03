import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationRow, MessageRow } from "./types";

/**
 * Fetcher dùng chung: server component load initial, client (TanStack Query)
 * refetch — cùng một câu select để shape dữ liệu khớp nhau.
 */

const CONVERSATIONS_SELECT = `id, contact_id, external_user_id, status, assignee_user_id,
  last_message_at, last_user_message_at, unread_count,
  channels(id, type, display_name),
  contacts(id, full_name, phone, email, contact_tags(tags(id, name, color))),
  messages(content, sender_type, direction)`;

export async function fetchConversations(
  supabase: SupabaseClient,
): Promise<ConversationRow[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATIONS_SELECT)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("sent_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ConversationRow[];
}

export async function fetchMessages(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, direction, sender_type, sender_user_id, content, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MessageRow[];
}
