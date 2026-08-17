import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { listItems } from "@/lib/catalog/items";
import { ItemsView } from "./items-view";

export const dynamic = "force-dynamic";

/**
 * Màn Hàng hoá (ADR-0019 mục 3+8 việc 3, thẻ design man-hang-hoa.html, đợt
 * V3 "Tiền thật"). Quản lý dịch vụ + hàng hoá của tiệm trong MỘT catalog
 * duy nhất (`items`, di trú từ `services` ở migration #125) — không tách
 * bảng theo loại (bất biến 3: một hành động lõi = một đường code).
 *
 * `canSeeCost` quyết định có gửi ô giá vốn xuống client hay không — CHỈ là
 * phép lịch sự UI, hàng rào thật nằm ở RLS `item_costs_rw` (chỉ owner/admin/
 * manager). listItems() tự trả `costVnd: null` cho vai không có quyền, kể cả
 * khi cột này lỡ hiện ra.
 */
export default async function ItemsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const canManage = ["owner", "admin", "manager"].includes(member?.role ?? "");
  const canSeeCost = canManage; // cùng nhóm — ADR-0009 mục 7b: manager đã được tin với giá vốn/nhà cung cấp

  const items = canManage ? await listItems(supabase) : [];

  return <ItemsView canManage={canManage} canSeeCost={canSeeCost} initial={items} />;
}
