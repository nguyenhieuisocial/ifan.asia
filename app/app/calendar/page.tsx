import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { addDaysToDateKey, dateKeyInTimeZone, startOfWeekKey, weekdayOfDateKey } from "@/lib/booking/schedule";
import { getCalendarBundle, timLichHen } from "./queries";
import { CalendarView } from "./calendar-view";
import { CHE_DO_XEM } from "./types";
import type { CheDoXem } from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];
const DEFAULT_TZ = "Asia/Ho_Chi_Minh";
/** Chế độ Danh sách nhìn tới bao nhiêu ngày phía trước. */
const NGAY_CUA_DANH_SACH = 30;

/**
 * Dải ngày cần nạp cho từng chế độ xem.
 *
 * Tách hẳn ra thành hàm thuần để đọc được bằng mắt và thử được: đây là chỗ dễ
 * lệch nhất — nạp thiếu một ngày thì cột cuối của lưới trống trơn mà không báo
 * gì cả.
 */
export function daiNgayCho(cheDo: CheDoXem, focusDateKey: string): { tu: string; den: string } {
  // "tho" = xem một ngày, mỗi thợ một cột ⇒ vẫn chỉ cần đúng một ngày.
  if (cheDo === "ngay" || cheDo === "tho") return { tu: focusDateKey, den: focusDateKey };
  if (cheDo === "ds") return { tu: focusDateKey, den: addDaysToDateKey(focusDateKey, NGAY_CUA_DANH_SACH - 1) };
  if (cheDo === "tuan") {
    const dau = startOfWeekKey(focusDateKey);
    return { tu: dau, den: addDaysToDateKey(dau, 6) };
  }
  // Tháng: LUÔN 42 ô (6 hàng × 7 cột) bắt đầu từ Thứ Hai — lưới không đổi chiều
  // cao khi lật tháng, và tháng 5 tuần vẫn có đủ ô cho ngày đầu/cuối tràn sang.
  const mungMot = `${focusDateKey.slice(0, 7)}-01`;
  const w = weekdayOfDateKey(mungMot); // 0=CN..6=T7
  const dau = addDaysToDateKey(mungMot, -(w === 0 ? 6 : w - 1));
  return { tu: dau, den: addDaysToDateKey(dau, 41) };
}

/** Server component: Màn Lịch (ADR-0009 mục 7 việc 4, thẻ design man-lich-kieu-google.html). */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string | string[];
    a?: string | string[];
    v?: string | string[];
    q?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id, timezone").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const role = member?.role ?? "";

  // "Hôm nay" PHẢI theo múi giờ TIỆM, không phải giờ máy chủ (Vercel chạy UTC)
  // — dùng `toISOString()` trần ở đây là ĐÚNG loại lỗi đã cắn mặt tiền 12/08:
  // từ 0h–7h giờ VN, server UTC vẫn đang ở "hôm qua".
  const todayKey = dateKeyInTimeZone(new Date().toISOString(), tenant.timezone ?? DEFAULT_TZ);
  const rawDate = typeof sp.date === "string" ? sp.date : todayKey;
  const focusDateKey = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayKey;
  // `?a=<mã buổi hẹn>` — thông báo gọi tên dẫn thẳng tới đúng buổi hẹn
  // (migration #294 ghép sẵn cả `?date=` theo GIỜ TIỆM nên ngày ở trên đã đúng).
  // Chỉ nhận đúng khuôn uuid: tham số rác thì bỏ qua chứ không chảy xuống DOM.
  const rawAppt = typeof sp.a === "string" ? sp.a : null;
  const moTraoDoiId =
    rawAppt && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawAppt)
      ? rawAppt
      : null;

  const rawV = typeof sp.v === "string" ? sp.v : "";
  const cheDo: CheDoXem = (CHE_DO_XEM as readonly string[]).includes(rawV)
    ? (rawV as CheDoXem)
    : "tuan";

  const tuKhoa = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);

  const { tu, den } = daiNgayCho(cheDo, focusDateKey);
  const [bundle, ketQuaTim] = await Promise.all([
    getCalendarBundle(supabase, tu, den),
    tuKhoa.length >= 2 ? timLichHen(supabase, tuKhoa) : Promise.resolve(null),
  ]);

  return (
    <CalendarView
      bundle={bundle}
      focusDateKey={focusDateKey}
      todayKey={todayKey}
      cheDo={cheDo}
      tuKhoa={tuKhoa}
      ketQuaTim={ketQuaTim}
      currentUserId={user.id}
      canAssignOthers={MANAGE_ROLES.includes(role)}
      canManageAll={MANAGE_ROLES.includes(role)}
      // Khớp RLS appointments_insert (migration #83 v2_lich_hen_nen): mọi vai
      // TRỪ viewer — gate nút "+ Thêm lịch" (cùng lớp lỗi đã vá ở deals-board.tsx).
      canWrite={role !== "viewer"}
      moTraoDoiId={moTraoDoiId}
    />
  );
}
