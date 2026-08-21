import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BangCongTac, type CongTac, type Tiem } from "./bang";

export const dynamic = "force-dynamic";

/**
 * QUẢN TRỊ — CÔNG TẮC TÍNH NĂNG (thẻ `man-quan-tri-cong-tac-tinh-nang`).
 *
 * Màn của CHỦ SAAS. Trước bản này, muốn tắt một tính năng đang gây lỗi thì chỉ
 * có một cách: sửa mã rồi ra bản mới — mất vài phút, và trong vài phút đó khách
 * vẫn đang gặp lỗi.
 *
 * ⚠️ Chốt quyền nằm ở HAI nơi và cả hai đều cần: `app/admin/layout.tsx` chặn
 *   người lạ vào màn, còn từng hàm CSDL tự kiểm `is_platform_admin()` vì chúng
 *   gọi được thẳng qua API.
 *
 * ⚠️ Danh sách tiệm lấy từ `admin_tenant_health` — hàm đã có sẵn cho bảng điều
 *   hành. Viết thêm một hàm "liệt kê tiệm" nữa là có ngày hai danh sách lệch
 *   nhau, và lệch ở chỗ tệ nhất: chọn nhầm tiệm để mở tính năng.
 */

export default async function TrangCongTac() {
  const supabase = await createClient();
  const [{ data: coRaw }, { data: tiemRaw }] = await Promise.all([
    supabase.rpc("admin_cong_tac"),
    supabase.rpc("admin_tenant_health", { p_limit: 100 }),
  ]);

  const ds = (coRaw ?? []) as CongTac[];
  const tiemTatCa: Tiem[] = ((tiemRaw ?? []) as { tenant_id: string; name: string }[])
    .map((x) => ({ id: x.tenant_id, ten: x.name }))
    .sort((a, b) => a.ten.localeCompare(b.ten, "vi"));

  const t = await getTranslations("admin.flags");

  return (
    <div className="mx-auto w-full max-w-4xl overflow-y-auto p-4">
      <Link
        href="/admin"
        className="mb-3 inline-flex min-h-7 items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        {t("back")}
      </Link>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="mt-0.5 mb-4 text-sm text-muted-foreground">{t("subtitle")}</p>

      <BangCongTac ds={ds} tiemTatCa={tiemTatCa} />

      <p className="mt-4 text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}
