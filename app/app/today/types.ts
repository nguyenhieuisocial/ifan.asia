import type { SupabaseClient } from "@supabase/supabase-js";

/** Hình dữ liệu của RPC today_queue() (migration #16) — dùng chung server + client. */

export type TodayItem = {
  /** activity = việc ghi trên hồ sơ · deal = mốc "việc kế tiếp" của cơ hội */
  kind: "activity" | "deal";
  id: string;
  title: string;
  /** activity: loại việc (note/call/meeting/task) · deal: ghi chú việc kế tiếp */
  detail: string;
  at: string;
  contact_id: string | null;
  full_name: string | null;
  phone: string | null;
};

export type TodayHotContact = {
  id: string;
  full_name: string;
  phone: string | null;
  lead_score: number;
  last_interaction_at: string | null;
};

export type TodayConversation = {
  id: string;
  name: string | null;
  channel_type: string;
  channel_name: string | null;
  waiting_since: string;
  contact_id: string | null;
};

export type TodayQueue = {
  counts: { overdue: number; today: number; hot: number; unanswered: number };
  overdue: TodayItem[];
  today: TodayItem[];
  hot: TodayHotContact[];
  unanswered: TodayConversation[];
};

/** 1 round-trip cho cả 4 khối (không N+1) — RLS áp theo người gọi. */
export async function fetchTodayQueue(
  supabase: SupabaseClient,
  mineOnly: boolean,
): Promise<TodayQueue> {
  const { data, error } = await supabase.rpc("today_queue", {
    p_mine_only: mineOnly,
  });
  if (error) throw new Error(error.message);
  return data as TodayQueue;
}
