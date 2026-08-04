import { createClient } from "@/lib/supabase/server";
import { ChannelsView, type ZaloChannelRow } from "./channels-view";

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
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const canManage = member?.role === "owner" || member?.role === "admin";

  let channel: ZaloChannelRow | null = null;
  if (canManage) {
    const { data } = await supabase
      .from("channels")
      .select("id, external_id, display_name, status, connected_at")
      .eq("type", "zalo_oa")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    channel = data ?? null;
  }

  return <ChannelsView canManage={canManage} channel={channel} />;
}
