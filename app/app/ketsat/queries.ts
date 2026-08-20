import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Két sắt & Công nợ NCC (ADR-0022 V5).
 * Queries tách riêng để page.tsx chạy song song với Promise.all.
 */

// ==================== CHỐT SỔ CA ====================

export type ShiftClosing = {
  id: string;
  shiftDate: string;
  closedByName: string;
  openingCash: number;
  actualCash: number;
  expectedCash: number;
  variance: number;
  note: string | null;
  createdAt: string;
};

export async function layDanhSachChot(
  supabase: SupabaseClient,
  limit = 20,
): Promise<ShiftClosing[]> {
  // KHÔNG embed `profiles!closed_by(...)`. `shift_closings.closed_by` có khoá
  // ngoại trỏ `auth.users`, KHÔNG có khoá ngoại trực tiếp tới `profiles` —
  // PostgREST chỉ suy được phép nối qua khoá ngoại TRỰC TIẾP. Câu cũ trả về
  // HTTP 400 (PGRST200 "no relationship found"), rồi `if (error) return []`
  // ngay dưới đây nuốt luôn ⇒ màn Két sắt LUÔN trống mà không báo gì. Nó sống
  // sót lâu vì tới hôm nay cả CSDL mới có dòng chốt ca đầu tiên; trước đó danh
  // sách rỗng trông y như "chưa chốt ca nào".
  //
  // Câu cũ còn hỏng lần thứ hai trong cùng một dòng: `profiles` không có cột
  // `full_name`, nó là `display_name`. Nhưng sửa mỗi tên cột KHÔNG cứu được —
  // đã đo: vẫn 400, vì cái hỏng là phép nối.
  //
  // Chữa theo đúng khuôn đã dùng ở `app/app/calendar/queries.ts` (chỗ đó có
  // chú thích cảnh báo đúng cái bẫy này): tách làm hai truy vấn rồi tự ghép.
  const { data, error } = await supabase
    .from("shift_closings")
    .select(
      `id, shift_date, opening_cash, actual_cash, expected_cash, variance, note, created_at,
       closed_by`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // RLS tự giới hạn về đúng đồng nghiệp cùng tiệm — không cần `.in(ids)`.
  const { data: hoSo } = await supabase.from("profiles").select("user_id, display_name");
  const tenTheoUser = new Map(
    ((hoSo ?? []) as { user_id: string; display_name: string | null }[]).map((p) => [
      p.user_id,
      p.display_name,
    ]),
  );

  return data.map((r) => ({
    id: r.id as string,
    shiftDate: r.shift_date as string,
    closedByName: tenTheoUser.get(r.closed_by as string)?.trim() || "—",
    openingCash: Number(r.opening_cash ?? 0),
    actualCash: Number(r.actual_cash ?? 0),
    expectedCash: Number(r.expected_cash ?? 0),
    variance: Number(r.variance ?? 0),
    note: r.note as string | null,
    createdAt: r.created_at as string,
  }));
}

/**
 * Ca trước nhất (để lấy actual_cash làm opening_cash mặc định cho ca mới).
 * Trả null nếu chưa có ca nào.
 */
export async function layActualCashCaTruoc(supabase: SupabaseClient): Promise<number | null> {
  const { data } = await supabase
    .from("shift_closings")
    .select("actual_cash, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? Number(data.actual_cash) : null;
}

/**
 * Tính expected_cash cho ca mới:
 *   opening_cash + net_cash_entries_fund_cash_kể_từ_ca_trước
 *
 * "kể từ ca trước" = created_at > created_at của ca trước nhất.
 * Nếu chưa có ca nào → tính từ đầu lịch sử.
 */
export async function tinhExpectedCash(
  supabase: SupabaseClient,
  openingCash: number,
): Promise<number> {
  // Thời điểm chốt ca trước nhất — nếu null thì tính từ đầu lịch sử (epoch)
  const { data: lastClosing } = await supabase
    .from("shift_closings")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = lastClosing?.created_at ?? "1970-01-01T00:00:00Z";

  // `.is("deleted_at", null)` để KHỚP với Sổ quỹ (`lib/finance/cash-ledger.ts`),
  // nơi đã lọc sẵn. Hôm nay chưa đường nào trong web ghi `deleted_at` nên hai
  // màn vẫn ra cùng số — nhưng RLS `cash_entries_rw` là `for all` chỉ kiểm tiệm
  // và vai, KHÔNG chặn cột: chủ/quản trị/quản lý gọi thẳng API vẫn set được.
  // Ngày nào có một phiếu quỹ bị ẩn, Sổ quỹ giấu nó còn Két sắt vẫn cộng — hai
  // màn TIỀN đá nhau, đúng lớp lỗi "số liệu đá nhau" đã tốn một đợt để dọn.
  const { data: entries } = await supabase
    .from("cash_entries")
    .select("direction, amount_vnd")
    .eq("fund", "cash")
    .is("deleted_at", null)
    .gt("created_at", since);

  const net = (entries ?? []).reduce((acc, e) => {
    const amt = Number(e.amount_vnd ?? 0);
    return e.direction === "in" ? acc + amt : acc - amt;
  }, 0);

  return openingCash + net;
}

// ==================== CÔNG NỢ NCC ====================

export type SupplierDebt = {
  supplierId: string;
  supplierName: string;
  supplierPhone: string | null;
  totalPurchases: number;  // tổng phiếu nhập completed
  totalPaid: number;       // tổng đã trả
  outstanding: number;     // còn nợ
};

export async function layCongNoNCC(supabase: SupabaseClient): Promise<SupplierDebt[]> {
  // Rà 20/08: KHÔNG nuốt lỗi đọc — ném đúng khuôn `lib/catalog/orders.ts`
  // (`app/error.tsx` hứng). Nuốt thì đọc hỏng ra danh sách rỗng, người dùng
  // tưởng "không nợ ai" — đúng lớp bệnh của bug Két sắt gốc.
  // Lấy phiếu nhập đã hoàn thành cùng dòng hàng — để tính tổng tiền mỗi phiếu
  const { data: purchases, error: errPhieu } = await supabase
    .from("purchases")
    .select("id, supplier_id, purchase_lines(qty_mua, don_gia_mua)")
    .eq("status", "completed");
  if (errPhieu) throw new Error(errPhieu.message);

  // Tổng đã thanh toán theo NCC
  const { data: paymentTotals, error: errTra } = await supabase
    .from("supplier_payments")
    .select("supplier_id, amount_vnd");
  if (errTra) throw new Error(errTra.message);

  // Danh sách NCC
  const { data: suppliers, error: errNcc } = await supabase
    .from("suppliers")
    .select("id, name, phone");
  if (errNcc) throw new Error(errNcc.message);

  if (!suppliers) return [];

  // Tính tổng phiếu nhập theo supplier_id
  const purchaseMap = new Map<string, number>();
  for (const p of purchases ?? []) {
    const sup = p.supplier_id as string | null;
    if (!sup) continue;
    const lines = (p.purchase_lines ?? []) as { qty_mua: number; don_gia_mua: number }[];
    const lineTotal = lines.reduce((s, l) => s + Number(l.qty_mua ?? 0) * Number(l.don_gia_mua ?? 0), 0);
    purchaseMap.set(sup, (purchaseMap.get(sup) ?? 0) + lineTotal);
  }

  // Tính tổng đã trả theo supplier_id
  const paidMap = new Map<string, number>();
  for (const p of paymentTotals ?? []) {
    const sid = p.supplier_id as string;
    paidMap.set(sid, (paidMap.get(sid) ?? 0) + Number(p.amount_vnd ?? 0));
  }

  return suppliers
    .map((s) => {
      const totalPurchases = purchaseMap.get(s.id as string) ?? 0;
      const totalPaid = paidMap.get(s.id as string) ?? 0;
      return {
        supplierId: s.id as string,
        supplierName: s.name as string,
        supplierPhone: s.phone as string | null,
        totalPurchases,
        totalPaid,
        outstanding: totalPurchases - totalPaid,
      };
    })
    .filter((s) => s.totalPurchases > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
}

/**
 * Phiếu nhập CÒN NỢ của một NCC — để chọn khi ghi trả tiền.
 *
 * Bản trước có hai lỗi (#215):
 *   1. `.limit(50)` cứng — tiệm mua đều 2–4 lần/tháng thì sau ~1–2 năm phiếu cũ
 *      rơi khỏi danh sách và KHÔNG ghi trả tiền cho nó được. Supabase không báo
 *      lỗi khi chạm trần, chỉ trả ít dòng hơn.
 *   2. Trả về `total` = TỔNG tiền phiếu, không trừ phần đã trả. Người ghi trả
 *      tiền cần biết CÒN NỢ bao nhiêu, không phải tổng gốc.
 *
 * Nay lọc thẳng "còn nợ" (tổng dòng − đã trả > 0): danh sách vừa ĐÚNG VIỆC (ai
 * đi trả tiền chỉ quan tâm phiếu chưa trả hết) vừa TỰ NGẮN LẠI (phiếu trả xong
 * biến mất), nên không cần trần cứng nữa. Lấy hết trang bằng `.range` — số phiếu
 * một NCC là hữu hạn (đo 20/08: nhiều nhất 9 phiếu/NCC).
 */
export type PurchaseRef = { id: string; createdAt: string; total: number; conNo: number };

export async function layPhieuNhapNCC(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<PurchaseRef[]> {
  type Hang = {
    id: string;
    created_at: string;
    purchase_lines: { qty_mua: number; don_gia_mua: number }[] | null;
    supplier_payments: { amount_vnd: number }[] | null;
  };
  const tatCa: Hang[] = [];
  const CO_TRANG = 500;
  for (let tu = 0; ; tu += CO_TRANG) {
    const { data, error } = await supabase
      .from("purchases")
      .select("id, created_at, purchase_lines(qty_mua, don_gia_mua), supplier_payments(amount_vnd)")
      .eq("supplier_id", supplierId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .range(tu, tu + CO_TRANG - 1);
    // Hụt một trang mà vẫn trả về = giấu bớt phiếu còn nợ, đúng lỗi đang chữa.
    if (error || !data) return [];
    tatCa.push(...(data as Hang[]));
    if (data.length < CO_TRANG) break;
  }

  return tatCa
    .map((p) => {
      const total = (p.purchase_lines ?? []).reduce(
        (s, l) => s + Number(l.qty_mua ?? 0) * Number(l.don_gia_mua ?? 0), 0);
      const daTra = (p.supplier_payments ?? []).reduce((s, x) => s + Number(x.amount_vnd ?? 0), 0);
      return { id: p.id as string, createdAt: p.created_at as string, total, conNo: total - daTra };
    })
    .filter((p) => p.conNo > 0);
}
