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

export type SettingsGroup = "channels" | "team" | "automation" | "billing";

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
  // channels/page.tsx: canManage = owner/admin, vai khác gặp noPermission
  { key: "channels", href: "/app/settings/channels", group: "channels", roles: ADMIN_UP },
  // replies/page.tsx: mọi member đọc được (staff chỉ-đọc, readOnlyHint)
  { key: "replies", href: "/app/settings/replies", group: "automation", roles: null },
  // workflows/page.tsx: canManage = owner/admin, vai khác gặp noPermission
  { key: "workflows", href: "/app/settings/workflows", group: "automation", roles: ADMIN_UP },
  // forms/page.tsx: canManage = owner/admin, vai khác gặp noPermission
  { key: "forms", href: "/app/settings/forms", group: "automation", roles: ADMIN_UP },
  // sla/page.tsx: canManage = owner/admin, vai khác gặp noPermission
  { key: "sla", href: "/app/settings/sla", group: "automation", roles: ADMIN_UP },
  // tiers/page.tsx: canManage = owner/admin, vai khác gặp noPermission
  { key: "tiers", href: "/app/settings/tiers", group: "automation", roles: ADMIN_UP },
  // qr/page.tsx: mọi member xem được (manager quản lý, staff chỉ-đọc)
  { key: "qr", href: "/app/settings/qr", group: "channels", roles: null },
  // team/page.tsx: mọi member xem danh sách (owner/admin mới mời/đổi vai)
  { key: "team", href: "/app/settings/team", group: "team", roles: null },
  // notifications/page.tsx: mọi member tự ghép Zalo + chọn loại thông báo
  { key: "notifications", href: "/app/settings/notifications", group: "team", roles: null },
  // billing/page.tsx: billing_overview() chỉ owner/admin (migration #41), vai khác gặp restricted
  { key: "billing", href: "/app/settings/billing", group: "billing", roles: ADMIN_UP },
  // account/page.tsx: ai cũng đổi được mật khẩu của mình
  { key: "account", href: "/app/settings/account", group: "team", roles: null },
] as const;

/** Các mục Cài đặt vai này mở ra CÓ nội dung (không đâm vào màn "không có quyền"). */
export function visibleSettingsItems(role: string): readonly SettingsItem[] {
  return SETTINGS_ITEMS.filter(
    (item) => item.roles === null || (item.roles as readonly string[]).includes(role),
  );
}
