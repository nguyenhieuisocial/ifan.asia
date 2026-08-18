import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { NGUONG_SAP_HET, layMucTon, tomTatTon, type MucTon } from "@/lib/stock/ledger";
import { StockView } from "./stock-view";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

/**
 * Màn Kho (ADR-0021 mục 8 việc 5, thẻ design `man-kho.html`).
 *
 * QUYỀN — cố ý KHÁC hai màn tiền: màn này **không chặn cả cửa**. Mọi vai (kể cả
 * nhân viên và vai Chỉ xem) đọc được SỐ LƯỢNG tồn, vì không biết còn mấy chai
 * thì không bán được. Hàng rào thật nằm ở RLS: `stock_moves_select` mở cho cả
 * tiệm, còn `item_costs` chỉ owner/admin/manager ⇒ `layMucTon` tự trả
 * `giaVon: null` cho vai không có quyền, KHÔNG phải màn tự ẩn ô.
 * `canManage` chỉ quyết định có hiện lối sang Phiếu nhập / Kiểm kê hay không.
 *
 * KHÔNG NUỐT LỖI (việc #169): `layMucTon` ném khi tra cứu hỏng. Bắt ở đây rồi
 * bật cờ `loadFailed` để màn nói "chưa tải được kho", KHÁC hẳn "chưa có mặt
 * hàng nào". Trả danh sách rỗng lúc tra cứu hỏng thì chủ tiệm tưởng mất sạch
 * hàng — đúng con bệnh thẻ design dặn đừng chép lại.
 */
export default async function StockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const canManage = MANAGE_ROLES.includes(member?.role ?? "");

  let dsTon: MucTon[] = [];
  let loadFailed = false;
  try {
    dsTon = await layMucTon(supabase, tenant.id as string);
  } catch {
    loadFailed = true;
  }

  return (
    <StockView
      dsTon={dsTon}
      // Ba con số tính từ ĐÚNG mảng đang hiện ở danh sách — không truy vấn lại
      // bằng điều kiện khác, vì đó là cách sinh ra lỗi "số liệu đá nhau".
      tomTat={tomTatTon(dsTon)}
      nguongSapHet={NGUONG_SAP_HET}
      canManage={canManage}
      loadFailed={loadFailed}
    />
  );
}
