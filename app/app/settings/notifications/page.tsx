import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  NotificationsView,
  type BotNotifyStatus,
} from "./notifications-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Thông báo (spec B26): nhận nhắc việc + cảnh báo SLA qua Zalo cá
 * nhân bằng bot của tiệm (bot.zapps.me). Owner/admin quản bot; MỌI thành viên
 * tự ghép nối Zalo của mình + chọn loại thông báo và giờ nhận bản tin.
 */
export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // layout /app đã redirect khi chưa đăng nhập — user luôn có ở đây
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  // Một RPC trả đủ trạng thái theo vai (bot_notify_status, migration #53):
  // member thấy tiệm có bot chưa + ghép nối + pref của mình; admin thêm quota.
  const { data } = await supabase.rpc("bot_notify_status");
  const status = (data ?? {
    has_channel: false,
    has_token: false,
    bot_name: null,
    connected_at: null,
    quota_used: null,
    quota_limit: null,
    linked: false,
    linked_at: null,
    pref: {},
  }) as BotNotifyStatus;

  return <NotificationsView canManage={canManage} status={status} />;
}
