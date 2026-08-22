import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import type { Locale } from "@/i18n/config";
import { BangCongNo, type CongNo, type GiuHo } from "./bang";
import type { HenTra } from "./o-hen-tra";

export const dynamic = "force-dynamic";

/**
 * CÔNG NỢ & TIỀN GIỮ HỘ (thẻ `man-cong-no-va-tien-giu-ho`, #340).
 *
 * Hai câu hỏi mà chủ tiệm trước đây KHÔNG có chỗ nào để hỏi:
 *   ① "Ai còn nợ tôi bao nhiêu?" — trước phải mở TỪNG đơn ra xem.
 *   ② "Trong két có bao nhiêu thật sự là của tôi?" — tiền bán gói buổi trả
 *      trước đang được đọc như LÃI, trong khi phần lớn là tiền giữ hộ khách.
 *
 * ⚠️ HAI CON SỐ KHÔNG ĐƯỢC CỘNG HAY TRỪ VỚI NHAU. "Khách nợ mình" là tiền SẼ
 *   VỀ; "giữ hộ khách" là tiền PHẢI TRẢ LẠI BẰNG DỊCH VỤ. Màn để cạnh nhau vì
 *   chúng cùng trả lời một câu, nhưng tuyệt đối không gộp.
 *
 * ⚠️ AI XEM ĐƯỢC: chủ tiệm · quản trị · quản lý. Cùng nhóm quyền với Sổ quỹ và
 *   giá vốn — đây là bức tranh tiền của cả tiệm, không phải việc của một nhân
 *   viên bán hàng. Chốt thật nằm ở RLS của `orders`/`contracts`; chặn ở đây chỉ
 *   là phép lịch sự để người không có quyền khỏi mở ra rồi thấy màn trống.
 */

const VAI_XEM_DUOC = ["owner", "admin", "manager"];

export default async function TrangCongNo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const member = await getCurrentMembership(supabase, user.id);
  if (!VAI_XEM_DUOC.includes(member?.role ?? "")) redirect("/app");

  const [{ data: noRaw }, { data: ghRaw }, { data: homNayRaw }] = await Promise.all([
    supabase.rpc("cong_no_khach", { p_gioi_han: 100 }),
    supabase.rpc("tien_giu_ho", { p_gioi_han: 100 }),
    // ⚠️ NGÀY HÔM NAY LẤY TỪ CSDL, không phải `new Date()` ở máy chủ web.
    //   Máy chủ chạy giờ quốc tế; ngày Việt Nam bắt đầu sớm hơn 7 tiếng. Đây là
    //   cùng một cái bẫy đã gặp ở #337, nên dùng lại đúng hàm đã có.
    supabase.rpc("ngay_vn"),
  ]);

  // Lần hẹn trả gần nhất của từng khách đang nợ (#354). Hỏi MỘT lượt cho cả
  // danh sách, không hỏi từng người: 100 khách là 100 vòng gọi.
  const dsKhach = ((noRaw ?? {}) as Partial<CongNo>).khach ?? [];
  let henTheoKhach: Record<string, HenTra> = {};
  if (dsKhach.length > 0) {
    const { data } = await supabase.rpc("hen_tra_gan_nhat", {
      p_contact_ids: dsKhach.map((k) => k.contact_id),
    });
    henTheoKhach = (data ?? {}) as Record<string, HenTra>;
  }

  const t = await getTranslations("congNo");
  const locale = (await getLocale()) as Locale;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl p-4">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="mt-0.5 mb-4 text-sm text-muted-foreground">{t("subtitle")}</p>
        <BangCongNo
          no={(noRaw ?? {}) as Partial<CongNo>}
          giuHo={(ghRaw ?? {}) as Partial<GiuHo>}
          henTheoKhach={henTheoKhach}
          homNay={typeof homNayRaw === "string" ? homNayRaw : ""}
          locale={locale}
        />
      </div>
    </div>
  );
}
