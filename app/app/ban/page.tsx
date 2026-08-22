import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { danhSachBan, donCuaBan, tiemCoBan } from "@/lib/catalog/ban";
import type { Locale } from "@/i18n/config";
import { BanView, type MonBan } from "./ban-view";

export const dynamic = "force-dynamic";

/**
 * BÁN TẠI QUẦY — quán ăn & cafe (thẻ `man-ban-quan-an`, migration #356).
 *
 * ⚠️ CHỈ TIỆM CÓ KHAI BÀN MỚI VÀO ĐƯỢC. Suy từ DỮ LIỆU THẬT (tiệm này có tài
 *   nguyên loại bàn không), KHÔNG suy từ gói ngành. Bảng gói ngành khai module
 *   kiểu bổ sung chứ không phải bảng năng lực đầy đủ — gói spa không khai
 *   `orders` lẫn `inventory` trong khi spa demo có 3.260 đơn và có kho. Lấy nó
 *   làm cổng ẩn/hiện là giấu mất Đơn hàng và Kho của mọi tiệm spa.
 */
export default async function TrangBan({
  searchParams,
}: {
  searchParams: Promise<{ don?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  if (!(await tiemCoBan(supabase))) redirect("/app/orders");

  const { don: donIdParam } = await searchParams;
  const locale = (await getLocale()) as Locale;

  const [ban, monRes, don] = await Promise.all([
    danhSachBan(supabase),
    // Thực đơn = mọi mặt hàng đang bán. Quán cafe khai món ở đúng màn Hàng hoá
    // như mọi tiệm khác — không có "thực đơn" riêng để phải nuôi hai nơi.
    supabase
      .from("items")
      .select("id, name, price_vnd, group_name")
      .eq("status", "active")
      .order("group_name", { nullsFirst: false })
      .order("name"),
    donIdParam ? donCuaBan(supabase, donIdParam) : Promise.resolve(null),
  ]);

  const mon: MonBan[] = ((monRes.data ?? []) as { id: string; name: string; price_vnd: number; group_name: string | null }[]).map(
    (m) => ({ id: m.id, ten: m.name, giaVnd: m.price_vnd, nhom: m.group_name }),
  );

  return <BanView banDauVao={ban} mon={mon} donDauVao={don} locale={locale} />;
}
