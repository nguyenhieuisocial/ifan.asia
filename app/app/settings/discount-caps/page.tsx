import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { DiscountCapsView, type CapsRow } from "./discount-caps-view";

export const dynamic = "force-dynamic";

/**
 * Mặc định của migration #165 — tiệm chưa khai dòng nào thì trigger chặn ghi
 * thẳng (#183) vẫn dùng đúng ba con số này.
 */
const MAC_DINH: CapsRow = { staffMaxPct: 5, managerMaxPct: 15, adminMaxPct: 100 };

/**
 * Cài đặt → Trần giảm giá (migration #165 dựng luật, #183 ép luật ở CSDL).
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO MÀN NÀY PHẢI CÓ
 * ═══════════════════════════════════════════════════════════════════
 * Ngày 19/08 bịt được lỗ "nhân viên tự giảm giá bao nhiêu tuỳ ý" bằng một chốt
 * ở tận kho dữ liệu. Nhưng ngay sau đó đo ra: **bảng trần TRỐNG RỖNG — chưa
 * tiệm nào có một dòng nào.** Nghĩa là luật vừa dựng đang chạy bằng ba con số
 * MẶC ĐỊNH mà không chủ tiệm nào chọn, và cũng KHÔNG CÓ MÀN NÀO để đổi.
 *
 * Đó đúng bằng lỗi đã bắt cùng ngày ở tỉ lệ hoa hồng, chỉ khác chiều: hoa hồng
 * âm thầm SINH tiền theo số máy bịa, còn cái này âm thầm CHẶN theo số máy bịa.
 * Một luật về tiền mà người chịu trách nhiệm không thấy và không sửa được thì
 * chưa xong, dù chốt chặn đã chạy đúng.
 *
 * Vai: chỉ chủ tiệm/quản trị sửa (khớp RLS `discount_caps_manage`); vai khác
 * vẫn XEM được, vì biết trần của mình là bao nhiêu là quyền của người bán hàng.
 */
export default async function DiscountCapsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // layout /app đã chặn khi chưa đăng nhập — user luôn có ở đây
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  const { data } = await supabase
    .from("discount_caps")
    .select("staff_max_pct, manager_max_pct, admin_max_pct")
    .maybeSingle();

  // KHÔNG có dòng = chưa ai trong tiệm chọn. Phân biệt được mà không cần thêm
  // cột nào, và màn phải NÓI RA thay vì hiện ba con số như thể đã được chọn.
  const chuaAiChon = !data;

  return (
    <DiscountCapsView
      canManage={canManage}
      chuaAiChon={chuaAiChon}
      caps={
        data
          ? {
              staffMaxPct: Number(data.staff_max_pct),
              managerMaxPct: Number(data.manager_max_pct),
              adminMaxPct: Number(data.admin_max_pct),
            }
          : MAC_DINH
      }
    />
  );
}
