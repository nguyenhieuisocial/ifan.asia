import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  DEFAULT_AUTOPILOT_CONFIG,
  getAutopilotConfig,
  getAutopilotSourceStatus,
  listReplyLog,
  REPLY_LOG_LIMIT_MAX,
  REPLY_LOG_PAGE_SIZE,
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
/**
 * Nhật ký phân trang bằng `?log=` chứ không phải tải-thêm phía trình duyệt:
 * màn này vốn là server component, thêm một tầng nạp dữ liệu ở client chỉ để
 * nối thêm dòng là dựng đường tin cậy thứ hai cho cùng một danh sách. Link
 * `?log=` giữ được khi tải lại/chia sẻ, và chạy cả khi JS chưa kịp lên.
 */
function parseLogLimit(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n) || n < REPLY_LOG_PAGE_SIZE) return REPLY_LOG_PAGE_SIZE;
  return Math.min(Math.floor(n), REPLY_LOG_LIMIT_MAX);
}

export default async function AiAutopilotSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin" || member?.role === "manager";

  const logLimit = parseLogLimit((await searchParams).log);

  let initial: AiAutopilotSettings = {
    config: DEFAULT_AUTOPILOT_CONFIG,
    source: { hasServices: false, hasBusinessHours: false },
    log: [],
    logTotal: 0,
    logLimit,
  };

  if (canManage) {
    const [config, source, log] = await Promise.all([
      getAutopilotConfig(supabase),
      getAutopilotSourceStatus(supabase),
      listReplyLog(supabase, logLimit),
    ]);
    initial = { config, source, log: log.rows, logTotal: log.total, logLimit };
  }

  return <AiAutopilotView canManage={canManage} initial={initial} />;
}
