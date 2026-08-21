"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** Payload của realtime.broadcast_changes(): { operation, table, record, ... } */
type BroadcastChange = {
  operation?: string;
  table?: string;
  record?: Record<string, unknown> | null;
};

/**
 * Nghe kênh riêng `tenant:{mã tiệm}:chat` cho màn Nhắn nội bộ (migration #303).
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG NỐI TIN VÀO CACHE MÀ CHỈ TẢI LẠI
 * ════════════════════════════════════════════════════════════════════
 *
 * Hook của Hộp thư (`use-inbox-realtime`) nối thẳng tin mới vào cache để tránh
 * bão tải-lại — nó phải vậy vì Hộp thư có thể có hàng nghìn hội thoại và tin
 * tới liên tục từ khách.
 *
 * Chat nội bộ khác hẳn về nhịp: một tiệm 5–100 người, tin tới thưa. Nối tay
 * vào cache ở đây nghĩa là **chép lại luật dựng tin** (ai gửi, tên hiển thị,
 * đã sửa chưa, đã xoá chưa) sang một chỗ thứ hai — rồi ngày nào đổi luật ở
 * máy chủ mà quên chỗ này thì hai bên lệch nhau **âm thầm**. Đổi một lượt
 * tải lại rất rẻ lấy một lớp code phải nhớ đồng bộ mãi là đổi tồi.
 *
 * Nên: tin tới ⇒ tải lại đúng cuộc đang mở. Nhanh hơn 20 giây rất nhiều, mà
 * không sinh bản sao thứ hai của luật dựng tin.
 *
 * ⚠️ Người vừa bị gỡ khỏi tiệm KHÔNG nghe được — luật nghe ở #303 gọi
 * `current_tenant_id()`, và từ #301 hàm ấy kiểm lại tư cách thành viên thay vì
 * tin phiếu đăng nhập.
 */
export function useChatRealtime(tenantId: string) {
  const queryClient = useQueryClient();
  const daSubscribe = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const xuLy = (payload: BroadcastChange) => {
      if (payload.table !== "chat_messages") return;
      // Tải lại mọi cuộc đang mở trong cache + số chưa đọc ở danh sách.
      void queryClient.invalidateQueries({ queryKey: ["chat-rieng"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-chua-doc"] });
    };

    const subscribe = async () => {
      // BẮT BUỘC trước khi nghe kênh riêng (luật RLS trên realtime.messages)
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`tenant:${tenantId}:chat`, { config: { private: true } })
        .on("broadcast", { event: "INSERT" }, ({ payload }) =>
          xuLy(payload as BroadcastChange),
        )
        .on("broadcast", { event: "UPDATE" }, ({ payload }) =>
          xuLy(payload as BroadcastChange),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Nối lại sau khi rớt mạng ⇒ có thể đã lỡ tin ⇒ đồng bộ lại.
            if (daSubscribe.current) {
              void queryClient.invalidateQueries({ queryKey: ["chat-rieng"] });
              void queryClient.invalidateQueries({ queryKey: ["chat-chua-doc"] });
            }
            daSubscribe.current = true;
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
