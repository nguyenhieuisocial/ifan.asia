import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CUA_SO_MAC_DINH,
  LOC_MAC_DINH,
  NGUON_MAC_DINH,
  fetchChamSoc,
  laCuaSo,
  LOC,
  NGUON,
  type CuaSo,
  type Loc,
  type Nguon,
} from "./types";
import { ChamSocView } from "./cham-soc-view";

export const dynamic = "force-dynamic";

/**
 * `/app/reports/cham-soc` — "Lỗ hổng chăm sóc": ai vừa đến rồi bị bỏ quên.
 * Thẻ thiết kế `man-lo-hong-cham-soc`; định nghĩa số liệu ở migration #371.
 *
 * ⚠️ KHÔNG chốt vai ở trang này, KHÁC ba tab báo cáo kia. Ba tab kia là số liệu
 * CẢ TIỆM nên chặn từ `manager` trở xuống; màn này thẻ chốt cho nhân viên xem
 * KHÁCH MÌNH PHỤ TRÁCH — đó chính là danh sách việc phải gọi hôm nay của họ.
 * Phạm vi hẹp đó do hàm CSDL tự cắt (đã thử thật bằng phiếu đăng nhập vai
 * `staff`), không phải do ẩn nút ở đây.
 */
export default async function ChamSocReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    n?: string | string[];
    l?: string | string[];
    g?: string | string[];
  }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const n = Number(typeof sp.n === "string" ? sp.n : "");
  const l = typeof sp.l === "string" ? sp.l : "";
  const g = typeof sp.g === "string" ? sp.g : "";
  const ngay: CuaSo = laCuaSo(n) ? n : CUA_SO_MAC_DINH;
  const loc: Loc = (LOC as readonly string[]).includes(l) ? (l as Loc) : LOC_MAC_DINH;
  const nguon: Nguon = (NGUON as readonly string[]).includes(g)
    ? (g as Nguon)
    : NGUON_MAC_DINH;

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

  // Hỏng đường truyền thì KHÔNG ném lỗi cả trang: trả về không có số liệu ban
  // đầu, để thành phần hiển thị tự gọi lại và bày khối "không tải được" kèm nút
  // thử lại. Một màn báo cáo chết hẳn vì mạng chớp là mất luôn lối quay lại.
  const bao = await fetchChamSoc(supabase, ngay, loc, nguon).catch(() => null);

  return (
    <ChamSocView
      ngayDau={ngay}
      locDau={loc}
      nguonDau={nguon}
      baoDau={bao ?? undefined}
    />
  );
}
