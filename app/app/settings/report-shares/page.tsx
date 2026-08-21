import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { isShareReportKey } from "@/lib/report-share";
import {
  ReportSharesView,
  type ShareOpenEvent,
  type ShareRow,
} from "./report-shares-view";

export const dynamic = "force-dynamic";

/** Sổ "ai đã mở" đọc tối đa ngần này dòng — đủ dài để thấy nếp, đủ ngắn để tải nhanh. */
const OPEN_LOG_LIMIT = 60;

/**
 * Cài đặt → Chia sẻ báo cáo (migration #295).
 * Thẻ design: design-system/man-chia-se-bao-cao.html.
 *
 * Một màn gánh cả ba việc, cố ý không tách: PHÁT đường dẫn · XEM đang chia sẻ
 * cái gì · ĐỌC ai đã mở. Tách ra thì "thu hồi" nằm xa "ai đã mở", mà đó đúng là
 * hai thứ người ta đọc liền nhau: thấy một lượt mở lạ ⇒ cắt ngay.
 *
 * Vai owner/admin — khớp ĐÚNG chốt vai của cả bốn hàm `report_share_*` (#295,
 * đều raise 'forbidden' cho vai khác). CỐ Ý hẹp hơn quy ước owner/admin/manager
 * của các màn quản lý: đây là đường mang số của tiệm RA NGOÀI cho người không
 * có tài khoản, cùng mức với màn xoá dữ liệu cá nhân (#287) và khoá API (#160).
 *
 * Bảng `report_shares` KHÔNG cấp quyền đọc cho vai nào (RLS bật, không chính
 * sách) — nên trang này đọc qua RPC `report_share_list()`. Sổ mở thì đọc thẳng
 * `record_audit`: RLS `record_audit_select` đã tự lọc owner/admin đúng tiệm.
 */
export default async function ReportSharesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) {
    return <ReportSharesView canManage={false} shares={[]} openEvents={[]} tz="Asia/Ho_Chi_Minh" />;
  }

  const [sharesRes, eventsRes] = await Promise.all([
    supabase.rpc("report_share_list"),
    supabase
      .from("record_audit")
      .select("id, entity_id, diff, at")
      .eq("entity_type", "report_share")
      .eq("action", "viewed")
      .order("at", { ascending: false })
      .limit(OPEN_LOG_LIMIT),
  ]);

  // Đọc hỏng thì NÓI RA, không hiện một danh sách rỗng trông y như "chưa chia
  // sẻ gì" — nhầm đó khiến chủ tiệm tưởng đã thu hồi hết trong khi chưa.
  const loadFailed = Boolean(sharesRes.error);
  if (sharesRes.error) console.error("[report-share] không đọc được danh sách:", sharesRes.error);

  const raw = (sharesRes.data ?? []) as {
    id: string;
    report_key: string;
    period_key: string;
    has_password: boolean;
    expires_at: string;
    revoked_at: string | null;
    is_active: boolean;
    open_count: number;
    last_opened_at: string | null;
    created_at: string;
    tz: string;
  }[];

  // Múi giờ THEO TIỆM đi kèm từng dòng (RPC trả). Danh sách rỗng thì rơi về giờ
  // VN — chỉ ảnh hưởng khung "chưa có gì để hiện", không hiện sai ngày của ai.
  const tz = raw[0]?.tz ?? "Asia/Ho_Chi_Minh";

  const shares: ShareRow[] = raw
    // Bản chụp của một báo cáo đã bị gỡ khỏi danh sách đóng vẫn nằm lại trong
    // CSDL. Vẫn hiện nó ra (để còn THU HỒI được) nhưng đánh dấu là không rõ —
    // giấu đi thì đường dẫn đó sống tiếp mà không ai thấy để cắt.
    .map((r) => ({
      id: r.id,
      reportKey: isShareReportKey(r.report_key) ? r.report_key : null,
      periodKey: r.period_key,
      hasPassword: r.has_password,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      isActive: r.is_active,
      openCount: r.open_count,
      lastOpenedAt: r.last_opened_at,
      createdAt: r.created_at,
    }));

  const openEvents: ShareOpenEvent[] = ((eventsRes.data ?? []) as {
    id: number;
    entity_id: string;
    diff: Record<string, unknown> | null;
    at: string;
  }[]).map((e) => {
    const d = e.diff ?? {};
    return {
      id: e.id,
      shareId: e.entity_id,
      reportKey: typeof d.bao_cao === "string" && isShareReportKey(d.bao_cao) ? d.bao_cao : null,
      periodKey: typeof d.ky === "string" ? d.ky : "",
      ipPrefix: typeof d.ip_dau === "string" ? d.ip_dau : null,
      region: typeof d.khu_vuc === "string" ? d.khu_vuc : null,
      device: d.thiet_bi === "mobile" || d.thiet_bi === "desktop" ? d.thiet_bi : null,
      at: e.at,
    };
  });

  return (
    <ReportSharesView
      canManage
      shares={shares}
      openEvents={openEvents}
      tz={tz}
      loadFailed={loadFailed}
      openLogLimit={OPEN_LOG_LIMIT}
    />
  );
}
