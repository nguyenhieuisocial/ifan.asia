"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Boxes,
  Briefcase,
  Building2,
  Calendar,
  ChartColumn,
  ClipboardCheck,
  Gauge,
  Handshake,
  HandCoins,
  Inbox,
  LayoutGrid,
  ListChecks,
  Lock,
  Megaphone,
  MessagesSquare,
  Package,
  Percent,
  Receipt,
  ScrollText,
  Settings,
  SquareCheckBig,
  Star,
  Ticket,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileMoreSheet } from "./mobile-more-sheet";
import { createClient } from "@/lib/supabase/client";
import { useInboxRealtime } from "@/lib/realtime/use-inbox-realtime";
import { capitalizeFirst, type TenantPack } from "@/lib/tenant-pack";
import { fetchInboxCounts } from "./inbox/queries";

const NAV_ITEMS = [
  // "Hôm nay" đứng đầu: đây là màn nhà hằng ngày của người bán (mở app là biết gọi ai)
  { href: "/app/today", labelKey: "today", icon: ListChecks },
  // exact: /app là Tổng quan — mọi route khác cũng bắt đầu bằng /app nên phải so khớp tuyệt đối
  { href: "/app", labelKey: "overview", icon: Gauge, exact: true },
  { href: "/app/inbox", labelKey: "inbox", icon: Inbox },
  // Việc 4 của ADR-0009 (V2 Lịch hẹn) — "nav trục 2" trong hồ sơ, ngay sau Hộp thư
  // vì lịch hẹn phần lớn sinh ra TỪ cuộc trò chuyện (thẻ design man-lich-hen.html).
  { href: "/app/calendar", labelKey: "calendar", icon: Calendar },
  { href: "/app/contacts", labelKey: "contacts", icon: Users },
  { href: "/app/companies", labelKey: "companies", icon: Building2 },
  { href: "/app/deals", labelKey: "deals", icon: Handshake },
  // V3 "Tiền thật" (ADR-0019 mục 8 việc 3-4) — Hàng hoá đứng TRƯỚC Đơn hàng vì
  // đơn hàng phải chọn từ catalog đã có, đúng thứ tự thao tác thật.
  { href: "/app/items", labelKey: "items", icon: Package },
  { href: "/app/orders", labelKey: "orders", icon: Receipt },
  // V3 việc 6 (ADR-0019 mục 8) — cùng nhóm quyền với giá vốn (RLS cash_entries_rw
  // chỉ owner/admin/manager), ẨN khỏi nav với staff/viewer (khuôn "reports" trên).
  { href: "/app/cashbook", labelKey: "cashbook", icon: Wallet, roles: ["owner", "admin", "manager"] },
  // Công nợ & tiền giữ hộ (#340) — cùng nhóm quyền với Sổ quỹ và giá vốn: đây
  // là bức tranh TIỀN của cả tiệm, không phải việc của một nhân viên bán hàng.
  // Đặt NGAY SAU Sổ quỹ vì hai màn trả lời hai nửa của cùng một câu hỏi:
  // "tiền đang ở đâu" và "tiền nào thật sự là của tiệm".
  { href: "/app/cong-no", labelKey: "congNo", icon: HandCoins, roles: ["owner", "admin", "manager"] },
  // V5 Két sắt (ADR-0022) — chốt ca + công nợ NCC: cùng nhóm quyền giá vốn.
  { href: "/app/ketsat", labelKey: "ketsat", icon: Lock, roles: ["owner", "admin", "manager"] },
  // V4 Kho hàng (ADR-0021) — xem tồn: MỌI VAI (RLS stock_moves_select mở cho cả tiệm).
  // Chỉ owner/admin/manager thấy giá vốn + vào Phiếu nhập/Kiểm kê (kiểm tra bằng canManage bên trong màn).
  { href: "/app/stock", labelKey: "stock", icon: Boxes },
  // V5 Hợp đồng & Gói định kỳ (ADR-0022) — mọi vai xem; đổi buổi: mọi vai.
  { href: "/app/contracts", labelKey: "contracts", icon: ScrollText },
  // Bảng kéo-thả cho việc (ADR-0012 mục 4 M13) — cùng dữ liệu activities với
  // "Việc đang chờ" trên hồ sơ khách/cơ hội, đây là màn xem TOÀN BỘ việc.
  { href: "/app/tasks", labelKey: "tasks", icon: SquareCheckBig },
  // Phiếu chờ duyệt + gửi yêu cầu theo biểu mẫu tự tạo (migration #29).
  // Chỉ nằm ở sidebar: nav mobile giữ đúng 4 ô (xem ghi chú MOBILE_NAV_KEYS bên dưới).
  { href: "/app/approvals", labelKey: "approvals", icon: ClipboardCheck },
  // /app/reports redirect sang /app/reports/sources (đợt này chỉ có "Nguồn nào ra tiền").
  // roles PHẢI khớp REPORT_ROLES của các page báo cáo — staff/viewer mở ra chỉ
  // gặp "không có quyền" nên ẨN hẳn khỏi nav (lịch sự UI, quyền thật ở page).
  { href: "/app/reports", labelKey: "reports", icon: ChartColumn, roles: ["owner", "admin", "manager"] },
  // V6 Đánh giá khách (csatQc) — đọc bình luận khách là việc quản lý, không phải
  // việc hằng ngày của nhân viên; roles PHẢI khớp MANAGE_ROLES của /app/csat và
  // policy select của satisfaction_surveys (ba nơi cùng một danh sách).
  { href: "/app/csat", labelKey: "csat", icon: Star, roles: ["owner", "admin", "manager"] },
  // V6 Ưu đãi & Tích điểm (retention) — nhân viên PHẢI xem được: họ là người tra
  // mã giảm giá và nói luật tích điểm cho khách đang đứng trước mặt. Quyền TẠO
  // mã / sửa luật siết bên trong màn (và ở RLS), không siết bằng cách giấu mục.
  { href: "/app/loyalty", labelKey: "loyalty", icon: Ticket, roles: ["owner", "admin", "manager", "staff"] },
  // ── V7 Nhân sự · Bảng lương ───────────────────────────────────────────
  // Chấm công là việc của MỌI người (ai cũng phải bấm vào/ra), nên không siết vai.
  { href: "/app/team", labelKey: "team", icon: Users },
  // ⛔ NGOẠI LỆ SO VỚI CẢ KHO: `manager` KHÔNG có mục này. Ở mọi màn tài chính
  // khác quản lý đi cùng owner/admin; riêng lương thì không (thẻ man-bang-luong
  // có hẳn bảng "Ai xem được gì"). Giấu mục CHỈ là phép lịch sự — chốt thật nằm
  // ở RLS của payslips/payroll_periods, và quản lý vào thẳng đường dẫn sẽ gặp
  // lời từ chối có giải thích kèm phiếu lương của CHÍNH họ.
  { href: "/app/payroll", labelKey: "payroll", icon: Wallet, roles: ["owner", "admin"] },
  // Hoa hồng KHÔNG siết vai, và đó là chủ đích — ngược hẳn với Bảng lương ngay
  // trên. Thẻ man-hoa-hong có bảng "Ai xem được gì": nhân viên xem PHẦN CỦA MÌNH
  // ("cho họ tự tra là hết chuyện"), quản lý xem cả đội, chủ tiệm thêm quyền đặt
  // tỉ lệ. Giấu mục khỏi nhân viên là bịt đúng công dụng chính của màn này; họ
  // vẫn không thấy hoa hồng người khác vì RLS `commission_select` (#167) chặn.
  { href: "/app/commissions", labelKey: "commission", icon: Percent },
  // ── V8 Dự án · Tuyển dụng · Sự kiện ───────────────────────────────────
  // Việc của dự án nằm CHUNG danh sách việc hằng ngày, nên nhân viên cũng vào
  // được để thấy phần của mình (RLS lọc sẵn); tạo/sửa dự án siết bên trong màn.
  { href: "/app/projects", labelKey: "projects", icon: Briefcase },
  // Chat nội bộ RIÊNG (#298) — KHÔNG siết vai, và đó là chủ đích: chat là chỗ cả
  // tiệm nói chuyện, giấu mục khỏi một vai là cắt người đó khỏi tiệm. Vai Chỉ
  // xem vào được và ĐỌC được, nhưng không nhắn và không mở kênh riêng — chốt
  // thật ở RLS (`chat_messages_insert`/`chat_channels_insert` đều loại viewer),
  // không siết bằng cách giấu mục.
  //
  // ⚠️ ĐỪNG nhầm với khung "Trao đổi nội bộ" màu hổ phách nhúng trong đơn/khách/
  // lịch hẹn/phiếu kho (#169): cái đó là GHI CHÚ GẮN VÀO VIỆC và CỐ Ý không có
  // màn riêng. Hai mảng khác nhau, cùng thuộc "Chat nội bộ" trên bản đồ tính năng.
  { href: "/app/chat", labelKey: "chat", icon: MessagesSquare },
  // Hồ sơ ứng viên là dữ liệu cá nhân của NGƯỜI NGOÀI tiệm ⇒ quản lý trở lên.
  // `staff` vẫn vào được vì RLS có nhánh riêng cho người ĐƯỢC XẾP phỏng vấn —
  // chặn họ ở nav là bịt đúng nhánh đó, luồng phỏng vấn gãy ngay chỗ bắt đầu.
  { href: "/app/recruitment", labelKey: "recruitment", icon: UserPlus,
    roles: ["owner", "admin", "manager", "staff"] },
  // Gửi tin hàng loạt đụng tiền và đụng Nghị định 13 (đồng ý nhận tin) ⇒ quản lý trở lên.
  { href: "/app/events", labelKey: "events", icon: Megaphone,
    roles: ["owner", "admin", "manager"] },
  // /app/settings là trang index 4 cụm card; ai cũng có mục để vào (Tài khoản…)
  { href: "/app/settings", labelKey: "settings", icon: Settings },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

/** Mục này có dành cho vai đang đăng nhập không (không khai roles = mọi vai). */
export function canSeeNavItem(item: NavItem, role: string): boolean {
  return !("roles" in item) || (item.roles as readonly string[]).includes(role);
}

/**
 * Khung nav theo pack (Quy hoạch mục 35.1 việc 8): 2 mục "contacts"/"deals"
 * đổi nhãn theo từ vựng ngành đang chọn — CHỈ đổi CHỮ, không đổi cấu trúc
 * nav/route. Tenant chưa chọn ngành (terminology rỗng) → chuỗi mặc định
 * `shell.nav.*` như cũ.
 */
/**
 * Nhãn RIÊNG cho thanh dưới điện thoại, chỉ khai những mục dài quá ô.
 *
 * Ô thanh dưới rộng 1/5 màn hình: 68px ở máy 360px, 74px ở máy 390px. Đo bằng
 * canvas với đúng phông đang chạy (Be Vietnam Pro 600, 11px) trên bản thật
 * 19/08: "Duyệt & yêu cầu" = 88px ⇒ VƯỢT ô ở MỌI cỡ điện thoại, `truncate` cắt
 * thành "Duyệt & y…". Nhãn cụt không đọc được là mất luôn tác dụng của ô đó.
 *
 * Chỉ sửa ở thanh dưới: cột trái máy tính rộng 186px, ở đó "Duyệt & yêu cầu"
 * vừa thoải mái và nói rõ hơn "Duyệt".
 *
 * Đối chứng cùng phép đo (đều lọt 68px): Khách hàng 65 · Công việc 55 · Đơn
 * hàng 52 · Hôm nay 48 · Báo cáo 46 · Hộp thư 43 · Sổ quỹ 37 · Thêm 31.
 */
const NHAN_NGAN_THANH_DUOI: Record<string, string> = {
  approvals: "approvalsShort",
};

export function navLabelFor(
  labelKey: string,
  t: (key: string) => string,
  pack: TenantPack | undefined,
  locale?: string,
  ngan = false,
): string {
  // ⛔ Từ vựng ngành CHỈ có tiếng Việt trong CSDL. Trước 19/08 nó đè lên cả bản
  // tiếng Anh: đo được thanh dưới ở `locale=en` ra ["Today","Inbox","Khách",
  // "Lịch/liệu trình"] — 2/4 ô còn tiếng Việt. Đợt soát từ điển báo "sạch
  // 4394/4394 khoá" vì nó soát FILE, không soát LÚC CHẠY.
  const tiengViet = locale === undefined || locale === "vi";
  if (tiengViet && labelKey === "contacts" && pack?.terminology?.contact) {
    return capitalizeFirst(pack.terminology.contact);
  }
  if (tiengViet && labelKey === "deals" && pack?.terminology?.deal) {
    return capitalizeFirst(pack.terminology.deal);
  }
  return t(`nav.${(ngan && NHAN_NGAN_THANH_DUOI[labelKey]) || labelKey}`);
}

/**
 * THANH DƯỚI ĐỔI THEO VAI — dựng lại 19/08 (ADR-0024).
 *
 * Bản cũ đóng cứng 4 khoá cho MỌI vai, kèm lời tự dặn "phải ĐỔI CHỖ, không
 * thêm". Luật đó đúng khi kho có ~8 mảng. Đo 19/08: **31 mảng**, và **25/31
 * chỉ có MỘT đường tới — nút ảnh đại diện 44×36px**. Nút đó hỏng là gần như cả
 * sản phẩm mất lối vào trên điện thoại.
 *
 * Đáng nói: bản máy tính ĐÃ lọc 25 mục theo vai từ lâu (`canSeeNavItem`); chỉ
 * thanh dưới bị đóng cứng. Nên đây không phải thêm cái mới — là **sửa chỗ bản
 * điện thoại lệch khỏi bản máy tính**.
 *
 * Ba luật:
 *  1. Suy từ VAI, KHÔNG từ thói quen dùng. Cùng vai thì thanh luôn giống nhau,
 *     mọi lúc, mọi máy — thanh tự sắp lại theo tần suất bấm làm người dùng phải
 *     ĐI TÌM, hỏng đúng thứ thanh dưới sinh ra để giải quyết.
 *  2. Không để lỗ: lấy 4 mục đầu vai đó THẬT SỰ mở được; thiếu thì mục kế trám.
 *  3. Ô thứ 5 "Thêm" luôn có — bảo hiểm để không mảng nào phải gõ địa chỉ tay.
 *
 * Về lời dặn cũ "ô thứ 5 bóp mỗi ô còn ~75px, nhãn tiếng Việt vỡ dòng": đúng
 * về số học. Một thủ phạm là **nhãn dài từ từ vựng ngành** ("Lịch/liệu trình"),
 * và mục `deals` nay không còn nằm ở thanh dưới.
 *
 * ⛔ Câu tiếp theo ở bản đầu ghi "nhãn còn lại đều ≤ 8 ký tự" — SAI, và tôi tự
 * viết nó mà không đo. Đo thật (canvas, đúng phông đang chạy, 19/08):
 * `approvals` = "Duyệt & yêu cầu" 15 ký tự / 88px, `contacts` = "Khách hàng"
 * 10 ký tự / 65px, trong khi ô chỉ rộng 68px ở máy 360px. Nhãn thứ nhất VƯỠ.
 * Bài học ghi lại nguyên chỗ nó xảy ra: **chú thích tự khai không phải phép
 * đo** — và không cổng kiểm nào soát được câu chữ trong chú thích. Xem
 * `NHAN_NGAN_THANH_DUOI` bên dưới và cổng `scripts/soat-loi-vao-mang.mjs`.
 */
const UU_TIEN_THEO_VAI: Record<string, readonly string[]> = {
  // Chủ tiệm mở máy để xem tiền vào ra và duyệt cái cần duyệt.
  owner: ["today", "inbox", "orders", "approvals", "contacts", "cashbook"],
  admin: ["today", "inbox", "orders", "approvals", "contacts", "cashbook"],
  // Quản lý trực ca: trả lời khách và gỡ việc cho nhân viên.
  manager: ["today", "inbox", "orders", "approvals", "contacts"],
  // Nhân viên: trả lời khách, tra khách, bán tại quầy.
  staff: ["today", "inbox", "contacts", "orders", "tasks"],
  // Chỉ xem: đọc lại, không thao tác.
  viewer: ["today", "inbox", "contacts", "reports", "orders"],
};

/** Bốn ô của vai này — 4 mục đầu trong danh sách ưu tiên mà vai đó mở được. */
export function mobileBarItems(role: string): NavItem[] {
  const uuTien = UU_TIEN_THEO_VAI[role] ?? UU_TIEN_THEO_VAI.staff;
  const ra: NavItem[] = [];
  for (const key of uuTien) {
    if (ra.length === 4) break;
    const item = NAV_ITEMS.find((x) => x.labelKey === key);
    if (item && canSeeNavItem(item, role)) ra.push(item);
  }
  return ra;
}

/**
 * MỌI mảng vai này mở được — nội dung bảng "Thêm".
 *
 * ⚠️ Trước 19/08 đống này nằm trong menu sau ảnh đại diện. Đó là chỗ người ta đi
 * tìm "đăng xuất" / "đổi mật khẩu" — **không ai đi tìm "Bảng lương" ở đó**. Và
 * menu ấy đo được cao 646px trong khi nội dung 822px ⇒ "Đăng xuất" nằm thấp hơn
 * mép dưới 141px. Tách ra bảng riêng vừa trả menu tài khoản về đúng việc của nó,
 * vừa **bỏ nguyên nhân** lỗi Đăng xuất bị cụt thay vì ghim triệu chứng xuống đáy.
 *
 * ⛔ KHÔNG lọc bỏ mục đã có ô ở thanh dưới (ADR-0026 QĐ-5). Bản đầu có lọc —
 * đúng về logic "không lặp", sai về VAI TRÒ: bảng này là **tấm bản đồ đầy đủ**,
 * thanh dưới là **lối tắt**. Người đang tìm "Đơn hàng" mà mở bảng không thấy sẽ
 * tưởng máy thiếu, trong khi nó nằm ngay dưới chân họ. Đo trước/sau: bảng dài
 * thêm đúng 4 dòng cho mọi vai (owner/admin 21→25 · manager 20→24 · staff
 * 15→19 · viewer 13→17) — bảng đã chia nhóm nên dài thêm không làm khó tìm.
 */
export function mobileSheetItems(role: string): NavItem[] {
  return NAV_ITEMS.filter((x) => canSeeNavItem(x, role));
}

/**
 * Nhóm của từng mục — khoá i18n `shell.more.groups.*`.
 *
 * ⚠️ Bảng này nuôi CẢ HAI bản: bảng "Thêm" của điện thoại VÀ cột trái máy tính
 * (ADR-0026 QĐ-2). Mục thiếu khai nhóm nay biến mất khỏi CẢ HAI, không còn chỗ
 * nào đỡ. Cổng `scripts/soat-loi-vao-mang.mjs` LUẬT 2 canh chuyện đó.
 */
export const NHOM_CUA_MUC: Record<string, string> = {
  // "Hằng ngày" = hai màn MỞ APP LÀ VÀO. Trước 19/08 chúng nằm rải: "Hôm nay"
  // xếp chung "Hệ thống" (cạnh Cài đặt), "Tổng quan" chung "Báo cáo". Khi bảng
  // nhóm này chỉ nuôi bảng "Thêm" của điện thoại thì không ai thấy — vì cả hai
  // màn đó đã có ô riêng ở thanh dưới. Đến lúc cột trái máy tính dùng CHUNG
  // bảng nhóm (ADR-0026 QĐ-2) thì chỗ xếp sai lộ ngay: "Hôm nay" — chính ghi
  // chú ở NAV_ITEMS gọi là "màn nhà hằng ngày của người bán" — rơi xuống
  // **dòng 24/25**, dưới mép laptop 768px, phải cuộn mới bấm được.
  today: "hangNgay", overview: "hangNgay",
  contacts: "banHang", companies: "banHang", deals: "banHang", orders: "banHang",
  items: "banHang", contracts: "banHang", loyalty: "banHang",
  cashbook: "vanHanh", ketsat: "vanHanh", stock: "vanHanh", calendar: "vanHanh",
  congNo: "vanHanh",
  inbox: "chamKhach", csat: "chamKhach", events: "chamKhach",
  tasks: "congViec", projects: "congViec", approvals: "congViec", chat: "congViec",
  team: "nhanSu", payroll: "nhanSu", commission: "nhanSu", recruitment: "nhanSu",
  // Hai nhóm cuối còn ĐÚNG MỘT mục sau khi tách "Hằng ngày" ra. Giữ nguyên
  // tiêu đề, không gộp: /app/reports mới có 1 trong nhiều báo cáo đã hoạch
  // định, và Cài đặt là trang index 19 mục. Cả hai là ngăn sẽ đầy lên, không
  // phải tiêu đề thừa. Gộp "Báo cáo" vào "Hệ thống" còn tệ hơn: nhân viên
  // KHÔNG thấy Báo cáo, nên tiêu đề ghép sẽ hứa một thứ họ không mở được.
  reports: "baoCao",
  settings: "nenTang",
};

/** Thứ tự nhóm trong bảng — theo trình tự một ngày làm việc, không theo bảng chữ cái. */
export const THU_TU_NHOM = [
  "hangNgay", "banHang", "vanHanh", "chamKhach", "congViec", "nhanSu", "baoCao", "nenTang",
] as const;
function isActive(pathname: string, item: NavItem): boolean {
  return "exact" in item && item.exact
    ? pathname === item.href
    : pathname.startsWith(item.href);
}

/**
 * Cột trái máy tính — **7 nhóm có tiêu đề**, dựng lại theo ADR-0026 QĐ-2/3/4.
 *
 * Ba điều đáng ghi lại:
 *
 *  · **Dùng LẠI đúng `NHOM_CUA_MUC` + `THU_TU_NHOM` của bảng "Thêm"**, không đẻ
 *    cách chia thứ hai. Cùng tên nhóm hai bản ⇒ đổi máy không phải học lại. Một
 *    cách chia đang chạy và nhất quán giá trị hơn một cách chia đẹp hơn mà lệch.
 *
 *  · **Nhóm rỗng ẩn CẢ tiêu đề** (QĐ-3) — tiêu đề trống làm người dùng tưởng
 *    máy lỗi. Đo 19/08: hiện KHÔNG vai nào có nhóm rỗng (staff thấy 3/4 mục
 *    Nhân sự, viewer 2/4 — cả hai vẫn thấy đủ 7 nhóm). Tức đây là lưới an toàn
 *    cho lần siết quyền sau, chưa phải chuyện đang xảy ra. ADR-0026 QĐ-3 nêu ví
 *    dụ "staff/viewer không thấy Nhân sự" — ví dụ đó SAI so với số đo, nhưng
 *    luật thì vẫn đúng nên giữ.
 *
 *  · **Thứ tự nhóm CỐ ĐỊNH theo `THU_TU_NHOM`, KHÔNG đổi theo vai** (QĐ-4) —
 *    khác hẳn thanh dưới điện thoại (4 ô nên phải đổi theo vai). Cột trái có
 *    chỗ cho tất cả, nên vị trí phải cố định: người dùng nhớ bằng cơ bắp, "hôm
 *    nay nó nằm chỗ khác" là hỏng đúng thứ menu sinh ra để giải quyết.
 */
export function SidebarNav({ role, pack }: { role: string; pack?: TenantPack }) {
  const pathname = usePathname();
  const t = useTranslations("shell");
  /**
   * ⚠️ PHẢI TRUYỀN `locale` XUỐNG `navLabelFor`. Thiếu nó thì hàm coi như đang
   *   ở tiếng Việt (`locale === undefined` ⇒ tiếng Việt) và đè TỪ VỰNG NGÀNH —
   *   vốn CHỈ có tiếng Việt trong kho dữ liệu — lên nhãn tiếng Anh.
   *
   *   Đo 22/08 với `locale=en`: cột trái vẫn hiện "Khách hàng" và "Gói liệu
   *   trình" giữa một màn tiếng Anh. Bản mobile (thanh dưới và bảng "Thêm") đã
   *   truyền đúng từ trước — nên lỗi chỉ nằm ở cột trái máy tính, và không ai
   *   thấy vì phần lớn người dùng chạy tiếng Việt.
   */
  const locale = useLocale();

  const theoNhom = useMemo(
    () =>
      THU_TU_NHOM.map((nhom) => ({
        nhom,
        muc: NAV_ITEMS.filter(
          (x) => canSeeNavItem(x, role) && NHOM_CUA_MUC[x.labelKey] === nhom,
        ),
      })).filter((g) => g.muc.length > 0),
    [role],
  );

  return (
    // ⚠️ `min-h-0` + `overflow-y-auto`: 25 mục × ~36px ≈ 900px. Khung /app cắt
    // phần thừa, nên thiếu lớp cuộn là 8 mục CUỐI biến mất trên laptop màn
    // 768px — mất luôn cả nhóm Nhân sự và **Cài đặt**. Menu bị cắt nặng hơn màn
    // nội dung bị cắt: mất thông tin còn đỡ, mất ĐƯỜNG ĐI thì kẹt hẳn.
    // Xem ADR-0026 mục 1.1 và LUẬT 6 của scripts/soat-loi-vao-mang.mjs.
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
      {theoNhom.map(({ nhom, muc }) => (
        // `pt-2 first:pt-0`: khoảng thở giữa hai nhóm, nhưng nhóm ĐẦU không bị
        // đẩy tụt khỏi mép trên (nav đã có p-2 rồi).
        <div key={nhom} className="flex flex-col gap-1 pt-2 first:pt-0">
          {/* Tiêu đề nhóm KHÔNG `truncate`: cột rộng 240px, chữ dài nhất
              ("Chăm khách & Marketing") vẫn còn chỗ; và nhãn nhóm bị cắt cụt thì
              thà cho xuống dòng còn hơn mất nghĩa. Đây là phép TÍNH theo bề rộng
              cột, CHƯA phải phép đo trên trình duyệt thật. */}
          <div className="px-2.5 text-[10px] font-bold tracking-wide text-muted-foreground/70 uppercase">
            {t(`more.groups.${nhom}`)}
          </div>
          {muc.map((item) => {
            const { href, labelKey, icon: Icon } = item;
            const active = isActive(pathname, item);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                  active
                    ? "bg-foreground/[0.06] font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {navLabelFor(labelKey, t, pack, locale)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Trên 99 thì con số cụ thể không còn giúp gì — bóp gọn để không vỡ huy hiệu (mẫu chuông thông báo). */
const BADGE_MAX = 99;

/**
 * Thanh điều hướng đáy cho mobile (<md) — **4 ô theo VAI + ô "Thêm"**.
 * Xem khối chú thích của `UU_TIEN_THEO_VAI` để biết vì sao đổi theo vai.
 */
export function MobileNav({
  tenantId,
  role,
  pack,
}: {
  tenantId: string;
  role: string;
  pack?: TenantPack;
}) {
  const pathname = usePathname();
  const t = useTranslations("shell");
  const locale = useLocale();
  const [moBang, datMoBang] = useState(false);
  const barItems = useMemo(() => mobileBarItems(role), [role]);
  const supabase = useMemo(() => createClient(), []);

  // Kênh realtime Hộp thư đăng ký TẠI ĐÂY — MobileNav nằm ở app shell nên luôn
  // sống, đứng màn nào tin mới về cũng invalidate ['inbox-counts'] cho badge
  // (và ['conversations']/['messages'] cho màn Hộp thư). ĐÚNG MỘT nơi đăng ký
  // cho cả app (như chuông thông báo): supabase-js trả CÙNG channel instance
  // theo topic, hai nơi cùng subscribe/removeChannel sẽ giẫm chân nhau.
  useInboxRealtime(tenantId);

  // Số hội thoại CHƯA TRẢ LỜI — tái dùng đúng khóa + COUNT trong CSDL của Hộp
  // thư (RPC inbox_counts), không thêm query nặng: chỉ refetch khi realtime
  // invalidate hoặc theo staleTime mặc định của app.
  const countsQuery = useQuery({
    queryKey: ["inbox-counts"],
    queryFn: () => fetchInboxCounts(supabase),
  });
  const unanswered = countsQuery.data?.unanswered ?? 0;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {barItems.map((item) => {
        const { href, labelKey, icon: Icon } = item;
        const active = isActive(pathname, item);
        const showBadge = labelKey === "inbox" && unanswered > 0;
        return (
          <Link
            key={href}
            href={href}
            // Badge vẽ aria-hidden (mẫu chuông) — nhãn trợ năng đọc kèm SỐ chưa
            // trả lời cho người dùng screen reader.
            aria-label={
              showBadge
                ? t("nav.inboxUnanswered", { count: unanswered })
                : undefined
            }
            className={cn(
              "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
              active
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="relative">
              <Icon className="size-5" />
              {showBadge && (
                <span
                  aria-hidden
                  className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white"
                >
                  {unanswered > BADGE_MAX ? `${BADGE_MAX}+` : unanswered}
                </span>
              )}
            </span>
            <span className="w-full truncate px-0.5 text-center">
              {navLabelFor(labelKey, t, pack, locale, true)}
            </span>
          </Link>
        );
      })}

      {/* Ô THỨ 5 — lối ra chung cho mọi mảng không có ô riêng.
          Trước 19/08 chỗ này không có, và 21 mục phải chui vào menu sau ảnh đại
          diện. Xem `mobileSheetItems` để biết vì sao đó là chỗ sai. */}
      <button
        type="button"
        onClick={() => datMoBang(true)}
        aria-haspopup="dialog"
        className="flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <LayoutGrid className="size-5" />
        <span className="w-full truncate px-0.5 text-center">{t("nav.more")}</span>
      </button>

      <MobileMoreSheet open={moBang} onOpenChange={datMoBang} role={role} pack={pack} />
    </nav>
  );
}
