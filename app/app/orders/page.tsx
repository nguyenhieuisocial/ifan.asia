import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrderCounts, listOrders, type OrderStatus } from "@/lib/catalog/orders";
import { OrdersView } from "./orders-view";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["draft", "confirmed", "completed", "cancelled"]);

/**
 * Màn Đơn hàng (ADR-0019 mục 5+8 việc 4, thẻ design man-don-hang.html —
 * nhưng máy trạng thái ở màn NÀY theo đúng ADR/migration #127, xem ghi chú
 * trong lib/catalog/orders.ts). Danh sách lọc theo trạng thái qua `?status=`
 * — RLS `orders_select` (migration #127) tự giới hạn: owner/admin/manager/
 * viewer thấy cả tiệm, staff chỉ thấy đơn mình tạo.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = VALID_STATUSES.has(sp.status ?? "") ? (sp.status as OrderStatus) : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const [orders, counts] = await Promise.all([listOrders(supabase, status), fetchOrderCounts(supabase)]);

  return <OrdersView orders={orders} counts={counts} activeStatus={status} />;
}
