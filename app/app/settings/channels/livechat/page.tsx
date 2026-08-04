import { createClient } from "@/lib/supabase/server";
import { LivechatView, type LivechatSettings } from "./livechat-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Kênh kết nối → Live Chat (spec 02 Omnichannel Inbox §4.5).
 * Chỉ owner/admin: kênh này mở một cửa ra internet nên cùng mức quyền với
 * kết nối Zalo OA. Khóa nhúng là khóa công khai (nằm sẵn trong mã trang khách)
 * nên hiển thị thẳng ở đây là đúng chủ đích.
 */
export default async function LivechatSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const canManage = member?.role === "owner" || member?.role === "admin";

  let initial: LivechatSettings = {
    embedKey: null,
    enabled: true,
    greeting: "",
    origins: [],
  };
  if (canManage) {
    const { data } = await supabase
      .from("channels")
      .select("embed_key, status, config")
      .eq("type", "livechat")
      .maybeSingle();
    if (data) {
      const config = (data.config ?? {}) as {
        greeting?: string;
        allowed_origins?: string[];
      };
      initial = {
        embedKey: data.embed_key,
        enabled: data.status === "active",
        greeting: config.greeting ?? "",
        origins: Array.isArray(config.allowed_origins) ? config.allowed_origins : [],
      };
    }
  }

  return <LivechatView canManage={canManage} initial={initial} />;
}
