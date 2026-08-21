import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BangThuNghiem, type KetQua } from "./bang";

export const dynamic = "force-dynamic";

/**
 * QUẢN TRỊ — THỬ NGHIỆM A/B (thẻ `man-quan-tri-thu-nghiem-ab`, #336).
 *
 * ⚠️ NÓI THẲNG VỚI NGƯỜI ĐỌC NGAY Ở ĐẦU MÀN: với lưu lượng hiện tại của iFan,
 *   một thử nghiệm cần vài tuần tới vài tháng mới đủ số. Giấu điều đó đi thì
 *   người dùng sẽ đọc chênh lệch ngày đầu như một kết luận, và sửa cả trang
 *   theo một con số chỉ là may rủi.
 *
 * ⚠️ Việc "được phép kết luận hay chưa" do CƠ SỞ DỮ LIỆU quyết
 *   (`admin_ket_qua_thu_nghiem`), không do màn tự suy từ hai con số. Một chỗ
 *   quyết thì không có chỗ thứ hai để lệch.
 */

export default async function TrangThuNghiem() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_thu_nghiem");
  const ds = (data ?? []) as KetQua[];

  const t = await getTranslations("admin.abtest");

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto p-4">
      <Link
        href="/admin"
        className="mb-3 inline-flex min-h-7 items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        {t("back")}
      </Link>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="mt-0.5 mb-3 text-sm text-muted-foreground">{t("subtitle")}</p>
      <p className="mb-4 rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        {t("trafficWarning")}
      </p>

      <BangThuNghiem ds={ds} />

      <p className="mt-4 rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        {t("methodNote")}
      </p>
    </div>
  );
}
