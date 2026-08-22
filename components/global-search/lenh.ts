"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { setLocale } from "@/i18n/actions";
import { locales, type Locale } from "@/i18n/config";
import { mobileSheetItems, navLabelFor } from "@/app/app/sidebar-nav";
import { normalizeSearch } from "@/app/app/contacts/types";
import { visibleSettingsItems } from "@/app/app/settings/access";
import type { TenantPack } from "@/lib/tenant-pack";

/**
 * LỆNH của bảng lệnh (Ctrl K) — thẻ design `man-bang-lenh.html`.
 *
 * Ba loại, và thứ tự hiện ra cũng đúng thứ tự này:
 *   · `man`      đi tới một màn hình
 *   · `viec`     mở màn tạo mới (tạo đơn, thêm khách…)
 *   · `giaodien` đổi nền sáng/tối, đổi ngôn ngữ — làm tại chỗ, không rời màn
 *
 * ⛔ KHÔNG có lệnh xoá, KHÔNG có lệnh gửi (thẻ design, mục "cố ý không làm").
 *   Bảng lệnh là chỗ gõ nhanh rồi bấm Enter theo phản xạ; để một lệnh xoá nằm
 *   cạnh một lệnh mở màn thì sớm muộn cũng bấm nhầm, và cái nhầm đó không lùi
 *   được. Việc thật vẫn làm ở màn của nó, nơi có xác nhận.
 */
export type LoaiLenh = "man" | "viec" | "giaodien";

export interface Lenh {
  /** Khoá ỔN ĐỊNH — dùng làm khoá React và để nhớ "vừa dùng". Không đổi theo ngôn ngữ. */
  id: string;
  loai: LoaiLenh;
  nhan: string;
  /** Lệnh đi tới có href; lệnh làm tại chỗ có chay(). Đúng một trong hai. */
  href?: string;
  chay?: () => void;
}

/**
 * DANH SÁCH MÀN LẤY TỪ NAV, KHÔNG CHÉP LẠI.
 *
 * `mobileSheetItems(role)` là "tấm bản đồ đầy đủ" đã lọc theo vai mà cột trái
 * và bảng "Thêm" cùng dùng. Chép ra một danh sách thứ hai ở đây thì hai bên sẽ
 * lệch ngay lần thêm màn kế tiếp — và lệch theo kiểu tệ nhất: bảng lệnh gợi ý
 * một cánh cửa mà người đó không có quyền mở.
 */
function lenhDiToiMan(
  role: string,
  coBan: boolean,
  t: (key: string) => string,
  tCaiDat: (key: string) => string,
  tPhu: (key: string) => string,
  pack: TenantPack | undefined,
): Lenh[] {
  const cotTrai = mobileSheetItems(role, coBan).map((x) => ({
    id: `man:${x.href}`,
    loai: "man" as const,
    nhan: navLabelFor(x.labelKey, t, pack),
    href: x.href,
  }));

  // Đo 22/08: bảng lệnh với tới ĐÚNG 27 trong 66 màn cố định. 39 màn còn lại —
  // gần hết là Cài đặt — chỉ tới được bằng cách bấm vào Cài đặt rồi dò danh
  // sách. Đó chính là kiểu điều hướng sẽ chết khi số màn tăng gấp đôi
  // (thẻ ke-hoach-ux-cos, lớp 3).
  const nhanCaiDat = navLabelFor("settings", t, pack);
  const caiDat = visibleSettingsItems(role).map((x) => ({
    id: `man:${x.href}`,
    loai: "man" as const,
    // Gắn tiền tố "Cài đặt · " vì nhiều mục trùng tên với màn vận hành:
    // "Nhãn" (cài đặt) khác "Khách hàng → nhãn", "Dịch vụ" khác "Hàng hoá".
    // Không gắn thì hai dòng giống hệt nhau nằm cạnh nhau trong bảng lệnh.
    nhan: `${nhanCaiDat} · ${tCaiDat(x.key)}`,
    href: x.href,
  }));

  const phu = MAN_PHU.filter((m) => !m.roles || m.roles.includes(role)).map((m) => ({
    id: `man:${m.href}`,
    loai: "man" as const,
    nhan: tPhu(m.key),
    href: m.href,
  }));

  return [...cotTrai, ...caiDat, ...phu];
}

/**
 * MÀN CON — có thật, dùng thật, nhưng không nằm ở cột trái lẫn danh mục Cài đặt
 * vì chúng là màn con của một mục khác (Báo cáo → 4 báo cáo, Kho → nhập/kiểm).
 *
 * ⚠️ ĐÂY LÀ DANH SÁCH GÕ TAY — thứ dễ lệch nhất. Cổng
 *   `bang-lenh-du-man-smoke.mjs` quét MỌI màn cố định trên đĩa và bắt đỏ nếu
 *   có màn nào không nằm ở một trong ba nguồn (cột trái · Cài đặt · danh sách
 *   này) và cũng không nằm trong danh sách bỏ qua CÓ GHI LÝ DO. Nhờ vậy việc
 *   quên khai một màn mới là chuyện ồn ào, không phải chuyện im lặng.
 *
 * `roles` phải khớp đúng luật của trang tương ứng — bảng lệnh hé ra một cửa
 * khoá còn tệ hơn là không hé.
 */
const MAN_PHU: Array<{ key: string; href: string; roles?: readonly string[] }> = [
  { key: "thongBao", href: "/app/notifications" },
  // contacts/duplicates/page.tsx: ghi hàng loạt cho cả tiệm → quản lý trở lên.
  { key: "trungLap", href: "/app/contacts/duplicates", roles: ["owner", "admin", "manager"] },
  // Bốn báo cáo con của /app/reports. Đây là nhóm đáng tiếc nhất khi thiếu:
  // báo cáo đúng là thứ người ta GÕ TÊN để tìm, không phải thứ đi lần theo menu.
  { key: "laiGop", href: "/app/reports/gross-margin", roles: ["owner", "admin", "manager"] },
  { key: "kpi", href: "/app/reports/kpi", roles: ["owner", "admin", "manager"] },
  { key: "lyDoMat", href: "/app/reports/lost-reasons", roles: ["owner", "admin", "manager"] },
  { key: "nguonKhach", href: "/app/reports/sources", roles: ["owner", "admin", "manager"] },
  // Hai màn con của Kho — thao tác vận hành hằng ngày.
  { key: "nhapHang", href: "/app/stock/purchases", roles: ["owner", "admin", "manager"] },
  { key: "kiemKho", href: "/app/stock/stocktake", roles: ["owner", "admin", "manager"] },
  // Hai kênh con của Cài đặt → Kênh kết nối.
  { key: "chatWeb", href: "/app/settings/channels/livechat", roles: ["owner", "admin"] },
  { key: "matTien", href: "/app/settings/channels/storefront", roles: ["owner", "admin"] },
];

/**
 * VIỆC THƯỜNG LÀM — chỉ những màn "tạo mới" ĐÃ CÓ THẬT.
 *
 * ⚠️ Mỗi dòng ở đây phải trỏ tới một đường dẫn tồn tại. Lệnh dẫn vào trang
 *   trắng còn tệ hơn là không có lệnh: người dùng tưởng mình bấm sai.
 *   Cổng `bang-lenh-smoke.mjs` mở từng đường dẫn để canh đúng chuyện đó.
 */
const VIEC: Array<{ id: string; href: string; roles?: readonly string[] }> = [
  { id: "viec:don-moi", href: "/app/orders/new" },
  { id: "viec:khach-moi", href: "/app/contacts?new=" },
  { id: "viec:lich-moi", href: "/app/calendar?tao=1" },
  // Sổ quỹ chỉ mở cho owner/admin/manager — PHẢI khớp `roles` của mục
  // "cashbook" trong NAV_ITEMS, nếu không bảng lệnh lại hé ra một cửa khoá.
  { id: "viec:thu-chi", href: "/app/cashbook?tao=1", roles: ["owner", "admin", "manager"] },
  { id: "viec:yeu-cau-duyet", href: "/app/approvals/new" },
];

/**
 * "VỪA DÙNG" — CHỈ NHỚ LỆNH, KHÔNG NHỚ KHÁCH.
 *
 * ⛔ Bản vẽ đầu có để tên khách ở mục này; đã bỏ. Danh sách nằm trong máy, mà
 *   máy quầy lễ tân thì cả tiệm dùng chung — nhớ tên khách ở đó là ai mở bảng
 *   lệnh cũng thấy tiệm vừa tra những ai. Nhớ "Lịch hẹn", "Sổ quỹ" thì chỉ là
 *   thói quen bấm phím, không phải dữ liệu tiệm.
 *
 * Lưu `id` chứ không lưu nhãn: nhãn đổi theo ngôn ngữ và theo từ vựng ngành.
 */
const KHOA_VUA_DUNG = "ifan.bang-lenh.vua-dung";
const SO_VUA_DUNG = 3;

function docVuaDung(): string[] {
  try {
    const raw = localStorage.getItem(KHOA_VUA_DUNG);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // Trình duyệt chặn localStorage (chế độ riêng tư, hoặc dữ liệu hỏng) —
    // bảng lệnh vẫn phải mở được, chỉ là không có mục "vừa dùng".
    return [];
  }
}

export function ghiVuaDung(id: string): void {
  try {
    const cu = docVuaDung().filter((x) => x !== id);
    localStorage.setItem(KHOA_VUA_DUNG, JSON.stringify([id, ...cu].slice(0, SO_VUA_DUNG)));
    // Báo cho các bản đang mount khác trong CÙNG tab: sự kiện `storage` của
    // trình duyệt chỉ bắn sang tab KHÁC, không bắn cho chính tab vừa ghi.
    window.dispatchEvent(new Event(KHOA_VUA_DUNG));
  } catch {
    /* không ghi được thì thôi — không được làm hỏng thao tác người dùng */
  }
}

const KHONG_CO: string[] = [];

/**
 * ⚠️ BỘ NHỚ ĐỆM PHẢI NẰM NGOÀI HÀM HOOK.
 *
 * `useSyncExternalStore` gọi `getSnapshot` nhiều lần và so sánh kết quả bằng
 * `Object.is`. `docVuaDung()` dựng MẢNG MỚI mỗi lần gọi ⇒ lần nào cũng "khác"
 * ⇒ React render lại vô hạn ("getSnapshot should be cached"). Để bộ đệm trong
 * thân hook cũng hỏng y hệt: mỗi lần render lại là một bộ đệm rỗng mới.
 * Ở ngoài module thì nó sống qua mọi lần render và mọi bản mount.
 */
let demVuaDung: { chuoi: string; mang: string[] } = { chuoi: "[]", mang: KHONG_CO };

function chupVuaDung(): string[] {
  const m = docVuaDung();
  const c = JSON.stringify(m);
  if (demVuaDung.chuoi !== c) demVuaDung = { chuoi: c, mang: m };
  return demVuaDung.mang;
}

/** Đọc "vừa dùng" theo kiểu React đọc nguồn ngoài — không lệch giữa server và client. */
function useVuaDung(): string[] {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener(KHOA_VUA_DUNG, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(KHOA_VUA_DUNG, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return useSyncExternalStore(subscribe, chupVuaDung, () => KHONG_CO);
}

export interface BoLenh {
  /** Mọi lệnh, đã lọc theo vai. */
  tatCa: Lenh[];
  /** Tối đa 3 lệnh vừa dùng, đúng thứ tự dùng gần nhất trước. */
  vuaDung: Lenh[];
  /** Việc thường làm — hiện khi chưa gõ gì. */
  viecThuongLam: Lenh[];
}

export function useBoLenh(role: string, pack?: TenantPack, coBan = true): BoLenh {
  const t = useTranslations("shell");
  const tl = useTranslations("search.lenh");
  const tCaiDat = useTranslations("settings.nav");
  const tManPhu = useTranslations("search.manPhu");
  const { setTheme } = useTheme();
  const locale = useLocale();
  const vuaDungIds = useVuaDung();

  return useMemo(() => {
    const man = lenhDiToiMan(role, coBan, t, tCaiDat, tManPhu, pack);

    const viec: Lenh[] = VIEC.filter(
      (v) => !v.roles || v.roles.includes(role),
    ).map((v) => ({ id: v.id, loai: "viec", nhan: tl(v.id.slice("viec:".length)), href: v.href }));

    const giaoDien: Lenh[] = [
      { id: "gd:nen-sang", loai: "giaodien", nhan: tl("nenSang"), chay: () => setTheme("light") },
      { id: "gd:nen-toi", loai: "giaodien", nhan: tl("nenToi"), chay: () => setTheme("dark") },
      { id: "gd:nen-may", loai: "giaodien", nhan: tl("nenMay"), chay: () => setTheme("system") },
      // Chỉ hiện ngôn ngữ ĐANG KHÔNG dùng — "chuyển sang tiếng Việt" khi đang
      // là tiếng Việt là một dòng vô nghĩa chiếm chỗ.
      ...locales
        .filter((l) => l !== locale)
        .map((l: Locale) => ({
          id: `gd:ngon-ngu-${l}`,
          loai: "giaodien" as const,
          nhan: tl(`ngonNgu.${l}`),
          chay: () => void setLocale(l),
        })),
    ];

    const tatCa = [...man, ...viec, ...giaoDien];
    const theoId = new Map(tatCa.map((x) => [x.id, x]));

    return {
      tatCa,
      // Lệnh đã lưu có thể không còn (đổi vai, gỡ màn) ⇒ lọc bỏ, không hiện dòng chết.
      vuaDung: vuaDungIds.map((id) => theoId.get(id)).filter((x): x is Lenh => x !== undefined),
      viecThuongLam: viec,
    };
  }, [role, coBan, pack, t, tl, tCaiDat, tManPhu, setTheme, locale, vuaDungIds]);
}

/**
 * Lọc lệnh theo câu gõ — KHÔNG DẤU VẪN RA.
 *
 * Dùng chung `normalizeSearch` với phần tìm khách. Hai nửa của cùng một ô mà
 * bỏ dấu theo hai luật khác nhau thì người dùng thấy như máy hỏng: gõ "lich"
 * ra được khách tên Lịch nhưng không ra màn Lịch hẹn.
 */
export function locLenh(tatCa: Lenh[], cau: string): Lenh[] {
  const q = normalizeSearch(cau);
  if (!q) return [];
  const batDau: Lenh[] = [];
  const oGiua: Lenh[] = [];
  for (const l of tatCa) {
    const n = normalizeSearch(l.nhan);
    const i = n.indexOf(q);
    if (i === 0) batDau.push(l);
    else if (i > 0) oGiua.push(l);
  }
  // Khớp từ ĐẦU nhãn lên trước: gõ "don" thì "Đơn hàng" phải đứng trên "Hôm nay
  // — việc cần làm"; xếp lẫn lộn làm người ta phải đọc cả danh sách.
  return [...batDau, ...oGiua];
}
