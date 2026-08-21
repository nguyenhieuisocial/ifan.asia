/**
 * Vai nào thấy mục Cài đặt nào — nguồn DUY NHẤT cho sub-nav lẫn trang index.
 *
 * Đây là PHÉP LỊCH SỰ UI: chỉ ẩn lối vào những màn mà vai đó mở ra sẽ gặp
 * "không có quyền" — quyền THẬT vẫn nằm ở từng page (check role) + RLS.
 * Mỗi dòng `roles` phải khớp ĐÚNG check của page tương ứng (ghi chú từng dòng);
 * page đổi luật thì sửa ở đây cùng lượt.
 */

export type TenantRole = "owner" | "admin" | "manager" | "staff" | "viewer";

/** Nhóm chỉ owner/admin — trùng điều kiện canManage của các page cài đặt tiệm. */
const ADMIN_UP: readonly TenantRole[] = ["owner", "admin"];
/** Nhóm owner/admin/manager — trùng điều kiện canManage của các page cho cả manager. */
const MANAGE_UP: readonly TenantRole[] = ["owner", "admin", "manager"];

export type SettingsGroup = "tenant" | "channels" | "team" | "automation" | "billing";

export type SettingsItem = {
  /** Khóa i18n trong settings.nav.* — dùng chung cho sub-nav và trang index. */
  key: string;
  href: string;
  /** Cụm card trên trang index /app/settings. */
  group: SettingsGroup;
  /** null = mọi vai đều có nội dung để xem (dù chỉ-đọc). */
  roles: readonly TenantRole[] | null;
};

// Thứ tự mảng = thứ tự sub-nav hiện có (đừng xáo — người dùng đã quen chỗ).
export const SETTINGS_ITEMS: readonly SettingsItem[] = [
  // industry/page.tsx: mọi member XEM pack đang dùng (chỉ-đọc); đổi pack owner/admin
  { key: "industry", href: "/app/settings/industry", group: "tenant", roles: null },
  // thuong-hieu/page.tsx (#334): logo + màu cho BỐN trang khách của tiệm nhìn
  // thấy. Chỉ owner/admin — đây là bộ mặt của tiệm với khách, cùng nhóm với tên
  // tiệm và mã số thuế, không phải việc vận hành hằng ngày (quản lý KHÔNG có).
  // Chốt thật nằm trong hàm `dat_thuong_hieu`; dòng này chỉ ẩn/hiện mục.
  { key: "brand", href: "/app/settings/thuong-hieu", group: "tenant", roles: ADMIN_UP },
  // trash/page.tsx: chỉ owner/admin (đúng RPC trash_list raise 'forbidden' vai khác)
  { key: "trash", href: "/app/settings/trash", group: "tenant", roles: ADMIN_UP },
  // tags/page.tsx: mọi member XEM danh sách nhãn (RLS tags_select); tạo/sửa/xoá/gộp
  // chỉ owner/admin/manager (đúng RLS tags_manage) — page tự ẩn nút quản lý, không noPermission
  { key: "tags", href: "/app/settings/tags", group: "tenant", roles: null },
  // services/page.tsx: canManage = owner/admin/manager (ADR-0009 mục 7b, đính
  // chính 13/08 — khớp đúng RLS services_manage/resources_manage, khuôn
  // lead_sources ở migration #83; hồ sơ gốc "owner/admin" đã lỗi thời).
  { key: "services", href: "/app/settings/services", group: "tenant", roles: MANAGE_UP },
  // payments/page.tsx: chỉ owner/admin sửa (đúng RLS tenants_update, migration
  // #2/#127) — số TK để KHÁCH trả tiền cho TIỆM (ADR-0019 mục 6), không phải
  // billing (đó là tiệm trả tiền cho iFan, group "billing"). Mọi vai đọc được
  // (page tự hiện chỉ-đọc), roles ở đây chỉ ẩn/hiện nút Sửa.
  { key: "payments", href: "/app/settings/payments", group: "tenant", roles: null },
  // discount-caps/page.tsx: chỉ owner/admin SỬA (khớp RLS `discount_caps_manage`,
  // migration #165); mọi vai XEM được vì biết trần của mình là bao nhiêu là
  // quyền của người đang bán hàng — nên roles: null, page tự khoá ô nhập.
  { key: "discountCaps", href: "/app/settings/discount-caps", group: "tenant", roles: null },
  // channels/page.tsx: canManage = owner/admin, vai khác gặp noPermission
  { key: "channels", href: "/app/settings/channels", group: "channels", roles: ADMIN_UP },
  // replies/page.tsx: mọi member đọc được (staff chỉ-đọc, readOnlyHint)
  { key: "replies", href: "/app/settings/replies", group: "automation", roles: null },
  // ai-autopilot/page.tsx: canManage = owner/admin/manager (ADR-0014 mục 9
  // việc 3), khớp đúng RLS ai_autopilot_manage/ai_reply_log_select
  // (migration #105) — khuôn services (ADR-0009 mục 7b).
  { key: "aiAutopilot", href: "/app/settings/ai-autopilot", group: "automation", roles: MANAGE_UP },
  // knowledge/page.tsx: mọi member XEM; SOẠN/SỬA mọi vai TRỪ viewer — đúng RLS
  // kb_entries_insert/kb_entries_update (điều kiện app_role() <> 'viewer'), chú
  // thích cũ "mọi thành viên" là SAI so với luật thật; đăng/gỡ đăng/xoá chỉ
  // owner/admin — ép THẬT ở trigger kb_entries_guard() (migration #113-115),
  // không phải ở đây (ADR-0015).
  { key: "knowledgeBase", href: "/app/settings/knowledge", group: "automation", roles: null },
  // workflows/page.tsx: canManage = owner/admin, vai khác gặp noPermission
  { key: "workflows", href: "/app/settings/workflows", group: "automation", roles: ADMIN_UP },
  // forms/page.tsx: canManage = owner/admin, vai khác gặp noPermission
  { key: "forms", href: "/app/settings/forms", group: "automation", roles: ADMIN_UP },
  // sla/page.tsx: canManage = owner/admin, vai khác gặp noPermission
  { key: "sla", href: "/app/settings/sla", group: "automation", roles: ADMIN_UP },
  // tiers/page.tsx: canManage = owner/admin, vai khác gặp noPermission
  { key: "tiers", href: "/app/settings/tiers", group: "automation", roles: ADMIN_UP },
  // integrations/page.tsx: chỉ owner/admin — khoá API và đường báo ra ngoài là
  // cấu hình HẠ TẦNG, lộ ra là lộ đường vào dữ liệu (khớp RLS api_keys_manage /
  // webhook_endpoints_manage, migration #160).
  { key: "integrations", href: "/app/settings/integrations", group: "automation", roles: ADMIN_UP },
  // qr/page.tsx: mọi member xem được (manager quản lý, staff chỉ-đọc)
  { key: "qr", href: "/app/settings/qr", group: "channels", roles: null },
  // team/page.tsx: mọi member xem danh sách (owner/admin mới mời/đổi vai)
  { key: "team", href: "/app/settings/team", group: "team", roles: null },
  // login-log/page.tsx: chỉ owner/admin (đúng RLS login_events_select — chỉ đạo founder 11/08)
  { key: "loginLog", href: "/app/settings/login-log", group: "team", roles: ADMIN_UP },
  // support-log/page.tsx: chỉ owner/admin (đúng RLS support_sessions_select — ADR-0006, task #81)
  { key: "supportLog", href: "/app/settings/support-log", group: "team", roles: ADMIN_UP },
  // data-export-log/page.tsx: chỉ owner/admin (đúng RLS record_audit_select — việc #207)
  { key: "dataExportLog", href: "/app/settings/data-export-log", group: "team", roles: ADMIN_UP },
  // data-erasure/page.tsx: chỉ owner/admin — đúng chốt vai của CẢ BA hàm
  // `erasure_request_create/reject/apply` (migration #287-288, đều raise
  // 'forbidden' cho vai khác). Cố ý HẸP HƠN quy ước "owner/admin/manager" của
  // các màn quản lý: đây là đường xoá KHÔNG HOÀN TÁC ĐƯỢC, không phải vì quản
  // lý kém tin cậy hơn. Lưu ý RLS `data_erasure_select` cho MỌI vai ĐỌC bảng
  // yêu cầu — nên dòng này (và page.tsx) là chỗ duy nhất chặn lối vào màn.
  { key: "dataErasure", href: "/app/settings/data-erasure", group: "team", roles: ADMIN_UP },
  // report-shares/page.tsx: chỉ owner/admin — khớp ĐÚNG chốt vai của cả bốn hàm
  // `report_share_*` (migration #295, đều raise 'forbidden' cho vai khác). CỐ Ý
  // hẹp hơn quy ước "owner/admin/manager" của các màn quản lý: đây là đường mang
  // SỐ CỦA TIỆM RA NGOÀI cho người không có tài khoản, cùng mức với data-erasure
  // (#287) và integrations (#160) — hậu quả nằm ngoài tầm thu hồi của tiệm.
  { key: "reportShares", href: "/app/settings/report-shares", group: "team", roles: ADMIN_UP },
  // notifications/page.tsx: mọi member tự ghép Zalo + chọn loại thông báo
  { key: "notifications", href: "/app/settings/notifications", group: "team", roles: null },
  // billing/page.tsx: billing_overview() chỉ owner/admin (migration #41), vai khác gặp restricted
  { key: "billing", href: "/app/settings/billing", group: "billing", roles: ADMIN_UP },
  // account/page.tsx: ai cũng đổi được mật khẩu của mình. group="billing" (không
  // phải "team") — khớp thẻ design man-cai-dat-khung.html: gộp chung nhóm "Tài
  // khoản" với billing (Gói của tôi), tách khỏi nhóm "Người & quyền" (team).
  { key: "account", href: "/app/settings/account", group: "billing", roles: null },
] as const;

/** Các mục Cài đặt vai này mở ra CÓ nội dung (không đâm vào màn "không có quyền"). */
export function visibleSettingsItems(role: string): readonly SettingsItem[] {
  return SETTINGS_ITEMS.filter(
    (item) => item.roles === null || (item.roles as readonly string[]).includes(role),
  );
}
