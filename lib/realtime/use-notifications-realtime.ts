"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Nghe thông báo mới của CHÍNH MÌNH theo thời gian thực.
 *
 * Topic 'user:{user_id}:notifications' (migration #35) nằm ngoài không gian
 * 'tenant:...' của Hộp thư — policy `inbox_broadcast_select` không với tới,
 * nên đồng nghiệp KHÔNG nghe được thông báo của nhau. Hộp thư vẫn dùng chung
 * topic tenant như cũ (chủ ý — xem use-inbox-realtime.ts), không bị siết nhầm.
 *
 * Tín hiệu nhận được là RỖNG có chủ ý: chỉ báo "có gì đó mới", client hỏi lại
 * DB qua câu select đã bị RLS khoanh về đúng dòng của mình.
 *
 * Id người dùng lấy từ phiên trên máy chỉ để ĐẶT TÊN topic. Không có rủi ro
 * khai gian: policy so id trong topic với auth.uid() lấy từ JWT đã xác thực,
 * sai thì Realtime từ chối cho subscribe.
 */

/** Trạng thái kết nối dùng chung — chuông (trên thanh trên cùng) đăng ký một
 *  lần cho cả app, màn Trung tâm thông báo chỉ ĐỌC để hiện nhãn cho đúng. */
let live = false;
const listeners = new Set<() => void>();

function setLive(next: boolean) {
  if (live === next) return;
  live = next;
  for (const l of listeners) l();
}

function subscribeStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * ĐỌC trạng thái: đang đẩy tức thời (true) hay chỉ còn nhịp hỏi lại (false).
 * Lần render đầu luôn là false để HTML server và trình duyệt khớp nhau.
 */
export function useNotificationsLive(): boolean {
  return useSyncExternalStore(
    subscribeStore,
    () => live,
    () => false,
  );
}

/** ĐĂNG KÝ kênh — gọi ĐÚNG MỘT nơi luôn hiển thị (chuông trong app shell). */
export function useNotificationsRealtime(): boolean {
  const queryClient = useQueryClient();
  const subscribedOnce = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const subscribe = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || cancelled) return;

      // BẮT BUỘC trước khi subscribe private channel (RLS trên realtime.messages)
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel(`user:${userId}:notifications`, { config: { private: true } })
        .on("broadcast", { event: "INSERT" }, () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        })
        .subscribe((status) => {
          const ok = status === "SUBSCRIBED";
          setLive(ok);
          if (ok && subscribedOnce.current) {
            // Kết nối lại sau khi rớt → có thể đã lỡ tín hiệu → đồng bộ lại.
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
          if (ok) subscribedOnce.current = true;
        });
    };

    void subscribe();
    return () => {
      cancelled = true;
      setLive(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useNotificationsLive();
}
