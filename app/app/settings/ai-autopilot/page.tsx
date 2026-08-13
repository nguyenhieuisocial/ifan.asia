import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  DEFAULT_AUTOPILOT_CONFIG,
  getAutopilotConfig,
  getAutopilotSourceStatus,
  listReplyLog,
} from "@/lib/ai/autopilot";
import { AiAutopilotView, type AiAutopilotSettings } from "./ai-autopilot-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → AI trực việc (ADR-0014 mục 9 việc 3, thẻ design man-ai-truc-viec.html,
 * đợt V2.5).
 *
 * Quyền owner/admin/manager — khớp khuôn màn Dịch vụ (ADR-0009 mục 7b). Lớp
 * LỊCH SỰ UI ở đây; lưới thật là RLS `ai_autopilot_manage`/`ai_reply_log_select`
 * (migration #105) + kiểm vai trong actions.ts (bất biến 1).
 *
 * QĐ 1 (ADR mục 3): công tắc BỊ KHOÁ khi tiệm chưa có dịch vụ lẫn giờ mở cửa —
 * `canEnable` tính ở đây CHỈ để hiện đúng khối trên màn (khoá/mở), chốt chặn
 * THẬT nằm trong `ai_autopilot_decide()`, kể cả khi ai đó lách qua UI.
 */
export default async function AiAutopilotSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin" || member?.role === "manager";

  let initial: AiAutopilotSettings = {
    config: DEFAULT_AUTOPILOT_CONFIG,
    source: { hasServices: false, hasBusinessHours: false },
    log: [],
  };

  if (canManage) {
    const [config, source, log] = await Promise.all([
      getAutopilotConfig(supabase),
      getAutopilotSourceStatus(supabase),
      listReplyLog(supabase),
    ]);
    initial = { config, source, log };
  }

  return <AiAutopilotView canManage={canManage} initial={initial} />;
}
