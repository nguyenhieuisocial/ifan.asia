import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { danhSachTaiSan } from "@/lib/catalog/tai-san";
import { TaiSanView, type NhanVienChon } from "./tai-san-view";

export const dynamic = "force-dynamic";

/**
 * TÀI SẢN & THIẾT BỊ (thẻ `man-tai-san`, migration #358).
 *
 * ⚠️ MỌI VAI ĐỀU XEM ĐƯỢC, chỉ quản lý trở lên mới sửa. Nhân viên cần biết
 *   mình đang giữ gì — và cần tự bấm xác nhận đã nhận, nếu không thì "xác nhận"
 *   chỉ là quản lý tự tick hộ và cả cơ chế mất nghĩa (chính sách RLS
 *   `asset_assignments_tu_xac_nhan` chốt chuyện đó ở CSDL).
 */
export default async function TrangTaiSan() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .maybeSingle();
  if (!tenant) redirect("/onboarding");

  const [ds, member, nvRes, ngayRes] = await Promise.all([
    danhSachTaiSan(supabase),
    getCurrentMembership(supabase, user.id),
    // Chỉ người CÒN LÀM mới giao được — cùng cửa mà màn Lịch hẹn và dòng hàng
    // đang dùng (`bookable_staff`, security definer, chỉ trả người của tiệm này).
    supabase.rpc("bookable_staff"),
    // ⚠️ Ngày Việt Nam lấy từ CSDL, không lấy từ `new Date()` của máy chủ. Máy
    //   chủ chạy giờ UTC nên từ 0h–7h sáng giờ VN nó vẫn tưởng hôm qua, và mọi
    //   phép đếm "còn mấy ngày bảo hành" lệch một ngày.
    supabase.rpc("ngay_vn"),
  ]);

  const nhanVien: NhanVienChon[] = (
    (nvRes.data ?? []) as { id: string; name?: string; full_name?: string }[]
  ).map((e) => ({ id: e.id, ten: e.name ?? e.full_name ?? "" }));
  const homNayVn =
    (ngayRes.data as string | null) ?? new Date().toISOString().slice(0, 10);

  return (
    <TaiSanView
      dsDauVao={ds}
      nhanVien={nhanVien}
      homNayVn={homNayVn}
      canManage={["owner", "admin", "manager"].includes(member?.role ?? "")}
    />
  );
}
