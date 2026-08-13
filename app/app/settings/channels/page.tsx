import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  ChannelsView,
  type LiveChatChannelRow,
  type StorefrontChannelRow,
  type ZaloChannelRow,
} from "./channels-view";
import type { TelegramChannelRow } from "./telegram-card";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Kênh kết nối (spec 02 Omnichannel Inbox §4.1). Đợt 1: Zalo OA
 * kết nối thật (token thủ công), các kênh khác hiện "sắp có".
 * Chỉ owner/admin quản lý — staff/manager/viewer thấy màn không-có-quyền.
 */
export default async function ChannelsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // layout /app đã redirect khi chưa đăng nhập — user luôn có ở đây
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  let channel: ZaloChannelRow | null = null;
  let liveChatChannel: LiveChatChannelRow | null = null;
  let storefrontChannel: StorefrontChannelRow | null = null;
  let telegramChannel: TelegramChannelRow | null = null;
  if (canManage) {
    const [zalo, livechat, storefront, telegram] = await Promise.all([
      supabase
        .from("channels")
        .select("id, external_id, display_name, status, connected_at")
        .eq("type", "zalo_oa")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("channels")
        .select("id, status, last_event_at, config")
        .eq("type", "livechat")
        .maybeSingle(),
      supabase
        .from("tenant_storefront")
        .select("storefront_enabled, lead_form_enabled")
        .maybeSingle(),
      supabase
        .from("channels")
        .select("id, external_id, display_name, status, connected_at")
        .eq("type", "telegram")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    telegramChannel = telegram.data ?? null;
    channel = zalo.data ?? null;
    if (livechat.data) {
      // Đếm website đã khai: 0 → thẻ kênh phải nói "còn thiếu bước", không được
      // khoe "Hoạt động" (đoạn mã bị chặn ở mọi trang khi danh sách rỗng).
      const origins = (livechat.data.config as { allowed_origins?: unknown } | null)
        ?.allowed_origins;
      liveChatChannel = {
        id: livechat.data.id,
        status: livechat.data.status,
        last_event_at: livechat.data.last_event_at,
        origin_count: Array.isArray(origins) ? origins.length : 0,
      };
    }
    storefrontChannel = {
      enabled: storefront.data?.storefront_enabled ?? false,
      leadFormEnabled: storefront.data?.lead_form_enabled ?? false,
    };
  }

  return (
    <ChannelsView
      canManage={canManage}
      channel={channel}
      liveChatChannel={liveChatChannel}
      storefrontChannel={storefrontChannel}
      telegramChannel={telegramChannel}
    />
  );
}
