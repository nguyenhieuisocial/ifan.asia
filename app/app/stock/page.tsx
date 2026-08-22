import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { quetDuDong } from "@/lib/quet-du-dong";
import { NGUONG_SAP_HET, layMucTon, tomTatTon } from "@/lib/stock/ledger";
import { StockView, type MucTonKho } from "./stock-view";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

/**
 * Hàng ĐÃ NGỪNG BÁN mà kho vẫn còn tồn.
 *
 * VÌ SAO LẤY RIÊNG Ở ĐÂY chứ không nới `layMucTon`: hàm đó lọc cứng
 * `status = 'active'`, và với hai chỗ gọi còn lại thì lọc như vậy là ĐÚNG —
 * màn Bán hàng và màn Phiếu nhập không được phép chào một mặt hàng tiệm đã
 * thôi bán. Nới ở tầng chung là lôi hàng ngừng bán trở lại đúng hai ô chọn đó.
 *
 * Nhưng ở màn Kho thì luật ngược hẳn: hàng ngừng bán còn nằm trên kệ là TIỀN
 * CHẾT, và trước bản vá này nó không hiện ở BẤT KỲ màn nào — chủ tiệm không có
 * đường nào biết mà đi thanh lý. Thẻ `man-kho.html` đã chốt "Ngừng bán vẫn hiện
 * nếu còn tồn" ngay từ bản đầu, mã thì chưa từng làm.
 *
 * CHỈ LẤY TỒN > 0: ngừng bán mà tồn 0 thì không còn gì để xem, hiện ra chỉ làm
 * danh sách dài thêm — mà đây là màn người ta lướt tìm món phải đi nhập bù.
 *
 * Ba truy vấn dưới CHỈ CHẠY khi tiệm thật sự có hàng ngừng bán; tiệm không có
 * thì tốn đúng một câu hỏi. Vẫn `quetDuDong` chứ không để trần ngầm: cắt ở
 * 1.000 dòng tại đây nghĩa là giấu bớt hàng tồn, tức đúng cái lỗi đang vá.
 */
async function layHangNgungBanConTon(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MucTonKho[]> {
  const dsHang = await quetDuDong<{ id: string; name: string; unit: string | null }>(
    () =>
      supabase
        .from("items")
        .select("id, name, unit")
        .eq("tenant_id", tenantId)
        .eq("kind", "product")
        .eq("status", "discontinued")
        .order("name")
        .order("id") as never,
    "kho — hàng ngừng bán",
  );
  if (dsHang.length === 0) return [];

  const [dsTon, dsVon] = await Promise.all([
    quetDuDong<{ item_id: string; qty_on_hand: number; last_move_at: string | null }>(
      () =>
        supabase
          .from("stock_levels")
          .select("item_id, qty_on_hand, last_move_at")
          .eq("tenant_id", tenantId)
          /**
           * ⚠️ `neq(0)` CHỨ KHÔNG PHẢI `gt(0)` — cố ý lấy cả tồn ÂM.
           *
           *   Tồn âm nghĩa là sổ ghi đã bán nhiều hơn số từng nhập: một lỗi sổ
           *   sách có thật. Với hàng ngừng bán thì nó còn khó lộ hơn nữa, vì
           *   không còn ai bán món đó để mà phát hiện. Lọc `> 0` là giấu đúng
           *   cái duy nhất cần người nhìn tới — bằng 0 mới là "không có gì để
           *   xem", còn âm là "có chuyện".
           */
          .neq("qty_on_hand", 0)
          .order("item_id") as never,
      "kho — tồn của hàng ngừng bán",
    ),
    // Giá vốn rỗng vì RLS che theo vai là CHUYỆN BÌNH THƯỜNG, không phải lỗi —
    // cùng luật với `layMucTon`.
    quetDuDong<{ item_id: string; cost_vnd: number }>(
      () =>
        supabase
          .from("item_costs")
          .select("item_id, cost_vnd")
          .eq("tenant_id", tenantId)
          .order("item_id") as never,
      "kho — giá vốn hàng ngừng bán",
    ),
  ]);

  const ton = new Map<string, { q: number; at: string | null }>();
  for (const r of dsTon) {
    ton.set(r.item_id as string, { q: Number(r.qty_on_hand ?? 0), at: (r.last_move_at as string) ?? null });
  }
  const von = new Map<string, number>();
  for (const r of dsVon) von.set(r.item_id as string, Number(r.cost_vnd));

  return dsHang
    .filter((h) => (ton.get(h.id as string)?.q ?? 0) > 0)
    .map((h) => ({
      itemId: h.id as string,
      ten: h.name as string,
      donVi: (h.unit as string) ?? null,
      ton: ton.get(h.id as string)?.q ?? 0,
      giaVon: von.get(h.id as string) ?? null,
      lanCuoi: ton.get(h.id as string)?.at ?? null,
      ngungBan: true,
    }));
}

/**
 * Màn Kho (ADR-0021 mục 8 việc 5, thẻ design `man-kho.html`).
 *
 * QUYỀN — cố ý KHÁC hai màn tiền: màn này **không chặn cả cửa**. Mọi vai (kể cả
 * nhân viên và vai Chỉ xem) đọc được SỐ LƯỢNG tồn, vì không biết còn mấy chai
 * thì không bán được. Hàng rào thật nằm ở RLS: `stock_moves_select` mở cho cả
 * tiệm, còn `item_costs` chỉ owner/admin/manager ⇒ `layMucTon` tự trả
 * `giaVon: null` cho vai không có quyền, KHÔNG phải màn tự ẩn ô.
 * `canManage` chỉ quyết định có hiện lối sang Phiếu nhập / Kiểm kê hay không.
 *
 * KHÔNG NUỐT LỖI (việc #169): `layMucTon` ném khi tra cứu hỏng. Bắt ở đây rồi
 * bật cờ `loadFailed` để màn nói "chưa tải được kho", KHÁC hẳn "chưa có mặt
 * hàng nào". Trả danh sách rỗng lúc tra cứu hỏng thì chủ tiệm tưởng mất sạch
 * hàng — đúng con bệnh thẻ design dặn đừng chép lại.
 */
export default async function StockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const canManage = MANAGE_ROLES.includes(member?.role ?? "");

  let dsTon: MucTonKho[] = [];
  let loadFailed = false;
  try {
    // Hai nhánh chạy song song rồi GỘP LÀM MỘT mảng: danh sách và ba con số
    // tóm tắt phải mô tả cùng một tập hàng, nếu không là "số liệu đá nhau".
    const [dangBan, ngungBan] = await Promise.all([
      layMucTon(supabase, tenant.id as string),
      layHangNgungBanConTon(supabase, tenant.id as string),
    ]);
    dsTon = [...dangBan.map((x) => ({ ...x, ngungBan: false })), ...ngungBan];
  } catch {
    loadFailed = true;
  }

  return (
    <StockView
      dsTon={dsTon}
      // Ba con số tính từ ĐÚNG mảng đang hiện ở danh sách — không truy vấn lại
      // bằng điều kiện khác, vì đó là cách sinh ra lỗi "số liệu đá nhau".
      tomTat={tomTatTon(dsTon)}
      nguongSapHet={NGUONG_SAP_HET}
      canManage={canManage}
      loadFailed={loadFailed}
    />
  );
}
