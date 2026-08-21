import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { formatVN } from "@/lib/datetime";
import { layMucTon, type MucTon } from "@/lib/stock/ledger";
import { layMotPhieuNhap, layPhieuNhap, type DongPhieuNhap, type NhaCungCap } from "./queries";
import { PurchasesView } from "./purchases-view";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];


/**
 * Màn Phiếu nhập hàng + nhà cung cấp (ADR-0021 mục 6, thẻ `man-phieu-nhap.html`).
 *
 * QUYỀN — CHẶN CẢ CỬA, khác hẳn màn Kho: màn này có cả hai thứ nhạy cảm nhất là
 * GIÁ VỐN và TÊN NHÀ CUNG CẤP. RLS `purchases_rw`/`purchase_lines_rw`/
 * `suppliers_rw` (migration #150, #151) chỉ mở cho owner/admin/manager; vai khác
 * truy vấn ra 0 dòng kể cả JOIN. Màn phải nói thẳng "không có quyền" — KHÔNG
 * được để màn trắng hay im lặng ra danh sách rỗng, vì hai cái đó đọc ra thành
 * "tiệm chưa nhập hàng bao giờ".
 *
 * KHÔNG NUỐT LỖI (việc #169): tra cứu hỏng bật `loadFailed`, câu chữ khác hẳn
 * "chưa có phiếu nhập nào".
 *
 * Danh sách phiếu và form nhập nằm CHUNG một đường dẫn (quyết định (c) của thẻ)
 * — người đang cầm thùng hàng không nên bị đẩy sang trang khác rồi quay lại.
 */
export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string | string[] }>;
}) {
  // ?d=<mã phiếu> — thông báo gọi tên dẫn thẳng tới đúng phiếu nhập (#294).
  // Chỉ nhận đúng khuôn uuid: tham số rác thì bỏ qua, không để nó chảy xuống
  // thành thuộc tính DOM hay câu truy vấn nửa vời.
  const sp = await searchParams;
  const rawD = typeof sp.d === "string" ? sp.d : null;
  const moTraoDoiId =
    rawD && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawD) ? rawD : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const canManage = MANAGE_ROLES.includes(member?.role ?? "");
  if (!canManage) {
    return (
      <PurchasesView
        canManage={false}
        loadFailed={false}
        hangHoa={[]}
        nhaCungCap={[]}
        phieu={[]}
        cursorTiep={null}
        tenThanhVien={{}}
        homNay=""
      />
    );
  }

  let hangHoa: MucTon[] = [];
  let nhaCungCap: NhaCungCap[] = [];
  let phieu: DongPhieuNhap[] = [];
  let cursorTiep: string | null = null;
  let tenThanhVien: Record<string, string> = {};
  let loadFailed = false;

  try {
    const [ton, nccRes, trang, profilesRes] = await Promise.all([
      layMucTon(supabase, tenant.id as string),
      supabase.from("suppliers").select("id, name, phone, note").order("name"),
      layPhieuNhap(supabase),
      supabase.from("profiles").select("user_id, display_name"),
    ]);
    if (nccRes.error) throw nccRes.error;

    hangHoa = ton;
    nhaCungCap = (nccRes.data ?? []).map((r) => ({
      id: r.id as string,
      ten: r.name as string,
      dienThoai: (r.phone as string) ?? null,
      ghiChu: (r.note as string) ?? null,
    }));
    phieu = trang.phieu;
    cursorTiep = trang.cursorTiep;
    tenThanhVien = Object.fromEntries((profilesRes.data ?? []).map((p) => [p.user_id, p.display_name as string]));

    // Phiếu mà thông báo dẫn tới có thể CŨ HƠN 20 phiếu mới nhất ⇒ không nằm
    // trong trang vừa tải. Kéo riêng nó về và đặt lên đầu, để trang mở ra là
    // thấy ngay chứ không phải bấm "Xem thêm" nhiều lượt. Nó được tô nền hổ
    // phách nên thứ tự khác thường đọc ra là "đây là phiếu bạn vừa bấm tới",
    // không phải "danh sách sắp sai".
    if (moTraoDoiId && !phieu.some((p) => p.id === moTraoDoiId)) {
      const phieuDuocNhac = await layMotPhieuNhap(supabase, moTraoDoiId);
      if (phieuDuocNhac) phieu = [phieuDuocNhac, ...phieu];
    }
  } catch {
    loadFailed = true;
  }

  return (
    <PurchasesView
      canManage
      loadFailed={loadFailed}
      hangHoa={hangHoa}
      nhaCungCap={nhaCungCap}
      phieu={phieu}
      cursorTiep={cursorTiep}
      tenThanhVien={tenThanhVien}
      moTraoDoiId={moTraoDoiId}
      // Ngày mặc định tính ở MÁY CHỦ theo giờ VN — tính ở trình duyệt thì máy
      // đặt sai múi giờ sẽ ghi lệch ngày, và còn lệch giữa lần dựng và lần chạy.
      homNay={formatVN(new Date(), "yyyy-MM-dd")}
    />
  );
}
