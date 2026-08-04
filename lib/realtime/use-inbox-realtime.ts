"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { ConversationRow, MessageRow } from "@/app/app/inbox/types";

/** Payload của realtime.broadcast_changes(): { operation, table, record, old_record, ... } */
type BroadcastChange = {
  operation?: string;
  table?: string;
  record?: Record<string, unknown> | null;
};

function byLastMessageDesc(a: ConversationRow, b: ConversationRow) {
  // ISO 8601 so sánh chuỗi là đúng thứ tự thời gian
  return (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "");
}

/**
 * Subscribe private channel 'tenant:{tenantId}:inbox' (DB trigger
 * realtime.broadcast_changes — migration #6, KHÔNG dùng postgres_changes).
 * - INSERT messages  → setQueryData nối vào ['messages', id] + cập nhật tại chỗ
 *   ['conversations'] (preview, unread, đẩy lên đầu) — không refetch storm.
 * - INSERT/UPDATE conversations → invalidate ['conversations'].
 * - Reconnect → invalidate cả hai (bù sự kiện lỡ mất khi rớt mạng).
 */
export function useInboxRealtime(tenantId: string) {
  const queryClient = useQueryClient();
  const subscribedOnce = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const applyMessageInsert = (record: Record<string, unknown>) => {
      const msg = record as unknown as MessageRow;
      if (!msg.id || !msg.conversation_id) return;

      queryClient.setQueryData<MessageRow[]>(
        ["messages", msg.conversation_id],
        (old) => {
          if (!old) return old;
          if (old.some((m) => m.id === msg.id)) return old; // idempotent
          return [...old, msg];
        },
      );

      let found = false;
      // Cache danh sách có khóa ['conversations', bộ lọc, số dòng, hội thoại ghim]
      // (migration #31) → cập nhật MỌI cache khớp tiền tố, không chỉ một khóa.
      queryClient.setQueriesData<ConversationRow[]>(
        { queryKey: ["conversations"] },
        (old) => {
          if (!old) return old;
          let hit = false;
          const next = old.map((c) => {
            if (c.id !== msg.conversation_id) return c;
            hit = true;
            found = true;
            return {
              ...c,
              last_message_at: msg.sent_at ?? c.last_message_at,
              last_user_message_at:
                msg.direction === "in"
                  ? (msg.sent_at ?? c.last_user_message_at)
                  : c.last_user_message_at,
              is_unanswered: msg.direction === "in",
              unread_count:
                msg.direction === "in" ? c.unread_count + 1 : c.unread_count,
              messages: [
                {
                  content: msg.content,
                  sender_type: msg.sender_type,
                  direction: msg.direction,
                },
              ],
            };
          });
          if (!hit) return old;
          return [...next].sort(byLastMessageDesc);
        },
      );
      // Tin mới đổi số "Chưa trả lời" trên tab — đếm lại bằng COUNT trong CSDL
      void queryClient.invalidateQueries({ queryKey: ["inbox-counts"] });
      if (!found) {
        // Hội thoại chưa có trong cache (mới tạo / ngoài trang đang tải) → tải lại
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
    };

    const handleChange = (payload: BroadcastChange) => {
      if (payload.table === "messages") {
        if (payload.operation === "INSERT" && payload.record) {
          applyMessageInsert(payload.record);
        }
        return;
      }
      if (payload.table === "conversations") {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["inbox-counts"] });
      }
    };

    const subscribe = async () => {
      // BẮT BUỘC trước khi subscribe private channel (RLS trên realtime.messages)
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`tenant:${tenantId}:inbox`, { config: { private: true } })
        .on("broadcast", { event: "INSERT" }, ({ payload }) =>
          handleChange(payload as BroadcastChange),
        )
        .on("broadcast", { event: "UPDATE" }, ({ payload }) =>
          handleChange(payload as BroadcastChange),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (subscribedOnce.current) {
              // Kết nối lại sau khi rớt → có thể lỡ sự kiện → đồng bộ lại
              void queryClient.invalidateQueries({ queryKey: ["conversations"] });
              void queryClient.invalidateQueries({ queryKey: ["inbox-counts"] });
              void queryClient.invalidateQueries({ queryKey: ["messages"] });
            }
            subscribedOnce.current = true;
          }
        });
    };

    void subscribe();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tenantId, queryClient]);
}
