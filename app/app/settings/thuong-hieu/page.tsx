import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/back-button";
import { laMaMau, type MaMau } from "@/lib/thuong-hieu";
import { BangThuongHieu } from "./bang";

export const dynamic = "force-dynamic";

/**
 * CÀI ĐẶT › THƯƠNG HIỆU TIỆM (thẻ `man-thuong-hieu-tiem`, #334).
 *
 * Logo và màu, áp lên đúng BA trang mà khách của tiệm nhìn thấy: mặt tiền,
 * đặt lịch, phiếu hỏi ý kiến.
 *
 * ⚠️ Bảng báo cáo chia sẻ (`/bc/<mã>`) CỐ Ý không nằm trong danh sách — thẻ
 *   design ban đầu có ghi nó, nhưng khi làm mới thấy trang đó không có nút màu
 *   nào cả (nó là bảng số và chữ). Tô màu ở đó phải bịa ra một dải màu chỉ để
 *   "có thương hiệu". Toàn bộ màn bên trong (nhân viên
 * dùng) giữ nguyên màu iFan — đổi cả trong đó thì mỗi tiệm một giao diện, và
 * hỗ trợ qua điện thoại sẽ không mô tả nổi nút nào ở đâu.
 *
 * ⚠️ Chỉ chủ tiệm và quản trị vào được. Quản lý KHÔNG — đây là bộ mặt của tiệm
 *   với khách, cùng nhóm với tên tiệm và mã số thuế, không phải việc vận hành
 *   hằng ngày. Chốt thật nằm trong hàm `dat_thuong_hieu`; chặn ở đây chỉ là
 *   phép lịch sự để người không có quyền khỏi mở ra rồi bị từ chối.
 */

const VAI_DUOC_VAO = ["owner", "admin"];

export default async function TrangThuongHieu() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, logo_url, mau_thuong_hieu")
    .maybeSingle();
  if (!tenant?.id) redirect("/onboarding");

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenant.id as string)
    .maybeSingle();
  if (!VAI_DUOC_VAO.includes((member?.role as string) ?? "")) redirect("/app/settings");

  const t = await getTranslations("settings.brand");
  const mau = laMaMau(tenant.mau_thuong_hieu) ? (tenant.mau_thuong_hieu as MaMau) : null;

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto p-4">
      <BackButton fallbackHref="/app/settings" />
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="mt-0.5 mb-4 text-sm text-muted-foreground">{t("subtitle")}</p>
      <BangThuongHieu
        tenantId={tenant.id as string}
        tenTiem={(tenant.name as string) ?? ""}
        logoHienTai={((tenant.logo_url as string | null) ?? null) || null}
        mauSan={mau}
      />
      <p className="mt-5 rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        {t("scopeNote")}
      </p>
    </div>
  );
}
