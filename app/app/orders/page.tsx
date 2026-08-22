import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { fetchOrderCounts, listOrders, VAI_XUAT_DON, type OrderStatus } from "@/lib/catalog/orders";
import { OrdersView } from "./orders-view";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["draft", "confirmed", "completed", "cancelled"]);

/**
 * Màn Đơn hàng (ADR-0019 mục 5+8 việc 4, thẻ design man-don-hang.html —
 * nhưng máy trạng thái ở màn NÀY theo đúng ADR/migration #127, xem ghi chú
 * trong lib/catalog/orders.ts). Danh sách lọc theo trạng thái qua `?status=`
 * — RLS `orders_select` (migration #127) tự giới hạn: owner/admin/manager/
 * viewer thấy cả tiệm, staff chỉ thấy đơn mình tạo.
 *
 * `canCreate` (việc #163): khớp ĐÚNG điều kiện RLS `orders_insert`
 * (`app_role() <> 'viewer'`) — mọi vai TRỪ viewer tạo được đơn, kể cả staff.
 * Trước đây nút "+ Tạo đơn" hiện cho mọi vai kể cả viewer, bấm vào sẽ luôn
 * lỗi ở RLS — không phải lỗ bảo mật, chỉ là ngõ cụt cho khách xem thử.
 *
 * `canExport`: ĐÚNG cùng lớp bệnh đó, ở nút "Xuất CSV". Cửa
 * `/api/export/orders` chỉ nhận `VAI_XUAT_DON`, nhưng nút vẫn hiện cho mọi
 * vai — nhân viên và viewer bấm vào rơi ra một trang trắng chỉ có chữ
 * `Forbidden`, không có đường quay lại bằng giao diện. Đọc THẲNG hằng số của
 * cửa API chứ không chép lại danh sách vai, để nới quyền một chỗ là xong.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tu?: string; den?: string }>;
}) {
  const sp = await searchParams;
  const status = VALID_STATUSES.has(sp.status ?? "") ? (sp.status as OrderStatus) : "all";
  /**
   * Lọc theo KHOẢNG NGÀY — lối vào từ biểu đồ doanh thu ở màn Tổng quan (#343):
   * bấm một cột là mở đúng danh sách đơn của ngày đó.
   *
   * ⚠️ Chỉ nhận đúng khuôn `2026-08-22`. Nhận bừa thì một đường dẫn hỏng làm
   *   màn trống trơn mà không nói vì sao — và người dùng tưởng tiệm không có đơn.
   */
  const dungKhuon = (x?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(x ?? "") ? x! : null);
  const tu = dungKhuon(sp.tu);
  const den = dungKhuon(sp.den) ?? tu;
  const khoang = tu && den ? { tu, den } : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const canCreate = member?.role !== "viewer";
  const canExport = VAI_XUAT_DON.includes(member?.role ?? "");

  // Cùng `khoang` cho CẢ HAI: số trên thẻ lọc là lời hứa về chính danh sách
  // ngay bên dưới nó, hai truy vấn lệch điều kiện là hai câu trả lời đá nhau.
  const [orders, counts] = await Promise.all([
    listOrders(supabase, status, khoang),
    fetchOrderCounts(supabase, khoang),
  ]);

  return (
    <OrdersView
      orders={orders}
      counts={counts}
      activeStatus={status}
      canCreate={canCreate}
      canExport={canExport}
      khoang={khoang}
    />
  );
}
