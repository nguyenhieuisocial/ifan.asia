import type { SupabaseClient } from "@supabase/supabase-js";
import { formatVN } from "@/lib/datetime";

/**
 * Đọc quyển nhật ký quản trị nền tảng (`public.admin_audit_logs`, việc #207).
 *
 * ⚠️ KHÔNG DÙNG PHÉP NỐI LỒNG CỦA PostgREST Ở ĐÂY.
 * `admin_audit_logs.actor_user_id` có khoá ngoại trỏ `auth.users(id)` — đã đo
 * trên CSDL thật — chứ KHÔNG có khoá ngoại trực tiếp tới `public.profiles`.
 * PostgREST chỉ suy được phép nối qua khoá ngoại TRỰC TIẾP, nên
 * `profiles!actor_user_id(display_name)` trả HTTP 400 (PGRST200) và mã nào
 * nuốt lỗi thành mảng rỗng sẽ cho ra một màn trắng không lời giải thích. Đúng
 * cái bẫy vừa vá hôm nay ở `app/app/ketsat/queries.ts` và
 * `app/app/calendar/queries.ts`. Cách đi đúng: TÁCH truy vấn rồi tự ghép —
 * xem `traTen()` bên dưới. (Và `profiles` có `display_name`, KHÔNG có
 * `full_name`.)
 *
 * ⚠️ MỌI LỆNH ĐỌC Ở ĐÂY ĐỀU NÉM LỖI, KHÔNG TRẢ MẢNG RỖNG.
 * Nhật ký kiểm toán mà đọc hỏng lại hiện ra "chưa có dòng nào" thì tệ hơn báo
 * lỗi: người đọc kết luận "không ai đụng vào dữ liệu" trong khi thật ra là
 * không đọc được gì. Trang gọi bắt lỗi và hiện ô đỏ (thẻ
 * `design-system/man-nhat-ky-quan-tri.html`, khối "Đọc hỏng").
 */

/** Số dòng mỗi trang trên màn. */
export const CO_TRANG = 50;

/**
 * Cỡ trang khi quét cột hẹp để dựng danh sách lựa chọn trong ô lọc.
 * KHÔNG phải trần đếm: vòng lặp chạy tới khi hết dòng (xem `quetKhoaLoc`).
 */
const CO_TRANG_QUET = 1000;

export type BoLoc = {
  /** `actor_user_id` đang lọc, null = tất cả người. */
  nguoi: string | null;
  /** `tenant_id` đang lọc; "nen-tang" = chỉ dòng toàn nền tảng; null = tất cả. */
  tiem: string | null;
  /** Mốc đầu, đã quy về ISO (bao gồm). */
  tuIso: string;
  /** Mốc cuối, đã quy về ISO (KHÔNG bao gồm — nửa khoảng `[tu, den)`). */
  denIso: string;
  /** Trang hiện tại, đếm từ 1. */
  trang: number;
};

/** Giá trị đặc biệt của ô lọc tiệm: chỉ lấy dòng KHÔNG thuộc tiệm nào. */
export const CHI_TOAN_NEN_TANG = "nen-tang";

export type DongNhatKy = {
  id: number;
  actorId: string;
  /** null = có id nhưng KHÔNG tra được tên (xem `traTen`). */
  actorName: string | null;
  action: string;
  /** null = thao tác toàn nền tảng, không thuộc tiệm nào. */
  tenantId: string | null;
  tenantName: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

export type TrangNhatKy = {
  dong: DongNhatKy[];
  /** Tổng số dòng KHỚP BỘ LỌC do CSDL đếm — không phải độ dài mảng đã tải. */
  tong: number;
  /** Trang THẬT SỰ đã đọc (đã kéo về trong khoảng hợp lệ) — màn phải dùng số này. */
  trang: number;
};

/** Bảng tra tên: id → tên hiển thị. Thiếu khoá = chưa tra được. */
export type BangTen = { nguoi: Map<string, string>; tiem: Map<string, string> };

/** Danh sách lựa chọn cho hai ô lọc, dựng từ chính khoảng ngày đang xem. */
export type KhoaLoc = { nguoi: string[]; tiem: string[]; coDongToanNenTang: boolean };

const COT = "id, actor_user_id, action, tenant_id, meta, created_at";

type HangTho = {
  id: number;
  actor_user_id: string;
  action: string;
  tenant_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Một TRANG của quyển sổ.
 *
 * Cố ý KHÔNG đặt trần cứng kiểu `.limit(200)`: đây là bảng chỉ-thêm, mỗi lần
 * người của iFan mở dữ liệu xuyên tiệm lại dài thêm một dòng, nên trần cứng
 * chỉ là quả bom hẹn giờ (Supabase không báo lỗi khi chạm trần, nó chỉ trả ít
 * dòng hơn). Phân trang thật bằng `.range()`, và tổng số do `count: "exact"`
 * của CSDL trả về nên nó đúng kể cả khi trang hiện tại chỉ có vài dòng.
 *
 * Mốc phụ `id` khi sắp xếp: năm hàm ghi sổ đều chạy trong CÙNG một lệnh gọi
 * RPC nên `created_at` của chúng có thể trùng tới từng micro-giây. Sắp theo
 * mỗi `created_at` thì thứ tự giữa các dòng trùng mốc không được đảm bảo
 * giống nhau qua hai lần hỏi ⇒ phân trang theo số thứ tự có thể hiện một
 * dòng hai lần và giấu mất dòng khác.
 *
 * ⚠️ ĐẾM TRƯỚC, ĐỌC SAU — không gộp làm một câu. Đo thật 20/08 trên CSDL
 * thật, và hai phép đo chỉ khác nhau đúng một tiêu đề:
 *
 *     Range: 50-99 + Prefer: count=exact  →  HTTP 416  (PGRST103) — LỖI
 *     Range: 50-99 (không xin đếm)        →  HTTP 200, mảng rỗng
 *
 * Bản gộp một câu chính là vế trên (`select(..., { count: "exact" })` của
 * supabase-js tự gắn `Prefer: count=exact`). Nghĩa là ai gõ tay `?trang=3`
 * trên thanh địa chỉ — hoặc mở lại dấu trang cũ sau khi thu hẹp bộ lọc — sẽ
 * thấy ô đỏ "không đọc được nhật ký". Báo hỏng cho chuyện không hề hỏng, mà
 * cảnh báo sai là thứ làm người ta thôi tin cảnh báo.
 *
 * Tách ra còn được thêm một cái đúng: biết tổng TRƯỚC thì kéo được trang về
 * trang cuối CÓ THẬT, người đọc thấy dữ liệu thay vì một danh sách trắng.
 */
export async function docTrangNhatKy(
  supabase: SupabaseClient,
  loc: BoLoc,
): Promise<TrangNhatKy> {
  let cauDem = supabase
    .from("admin_audit_logs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", loc.tuIso)
    .lt("created_at", loc.denIso);
  if (loc.nguoi) cauDem = cauDem.eq("actor_user_id", loc.nguoi);
  if (loc.tiem === CHI_TOAN_NEN_TANG) cauDem = cauDem.is("tenant_id", null);
  else if (loc.tiem) cauDem = cauDem.eq("tenant_id", loc.tiem);

  const { count, error: loiDem } = await cauDem;
  if (loiDem) throw new Error(`Không đếm được nhật ký: ${loiDem.message}`);

  const tong = count ?? 0;
  const soTrang = Math.max(1, Math.ceil(tong / CO_TRANG));
  const trang = Math.min(Math.max(1, loc.trang), soTrang);
  if (tong === 0) return { dong: [], tong: 0, trang: 1 };

  const tu = (trang - 1) * CO_TRANG;
  let cau = supabase
    .from("admin_audit_logs")
    .select(COT)
    .gte("created_at", loc.tuIso)
    .lt("created_at", loc.denIso)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(tu, tu + CO_TRANG - 1);
  if (loc.nguoi) cau = cau.eq("actor_user_id", loc.nguoi);
  if (loc.tiem === CHI_TOAN_NEN_TANG) cau = cau.is("tenant_id", null);
  else if (loc.tiem) cau = cau.eq("tenant_id", loc.tiem);

  const { data, error } = await cau;
  if (error) throw new Error(`Không đọc được nhật ký: ${error.message}`);

  return {
    dong: ((data ?? []) as unknown as HangTho[]).map((r) => ({
      id: Number(r.id),
      actorId: r.actor_user_id,
      actorName: null, // ghép ở `ghepTen`
      action: r.action,
      tenantId: r.tenant_id,
      tenantName: null,
      meta: r.meta ?? {},
      createdAt: r.created_at,
    })),
    tong,
    trang,
  };
}

/**
 * Những ai / những tiệm nào CÓ MẶT trong khoảng ngày đang xem — để dựng hai ô lọc.
 *
 * Cố ý chỉ quét ĐÚNG khoảng ngày đang xem chứ không quét cả lịch sử: vừa không
 * đẻ ra lựa chọn chết (chọn xong ra 0 dòng), vừa giữ phép quét bị chặn bởi
 * khoảng ngày thay vì bởi tuổi của quyển sổ. Vòng lặp chạy tới khi hết dòng —
 * `CO_TRANG_QUET` là cỡ mỗi lượt hỏi, KHÔNG phải trần.
 */
export async function quetKhoaLoc(
  supabase: SupabaseClient,
  tuIso: string,
  denIso: string,
): Promise<KhoaLoc> {
  const nguoi = new Set<string>();
  const tiem = new Set<string>();
  let coDongToanNenTang = false;

  for (let tu = 0; ; tu += CO_TRANG_QUET) {
    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select("actor_user_id, tenant_id")
      .gte("created_at", tuIso)
      .lt("created_at", denIso)
      .order("id")
      .range(tu, tu + CO_TRANG_QUET - 1);
    // Câu này CỐ Ý không xin đếm (`count`): đã đo 20/08 — hỏi quá cuối bảng
    // mà KHÔNG xin đếm thì PostgREST trả HTTP 200 kèm mảng rỗng, còn xin đếm
    // thì trả HTTP 416. Không xin đếm nên lượt hỏi thừa (khi tổng số dòng
    // đúng bằng bội số của cỡ trang) rơi êm vào nhánh `length === 0` bên dưới
    // thay vì thành một lỗi giả.
    //
    // Hụt một trang giữa chừng mà vẫn dựng tiếp = ô lọc thiếu người/thiếu
    // tiệm trong im lặng, người đọc tưởng người đó chưa từng mở dữ liệu.
    if (error) throw new Error(`Không quét được khoá lọc: ${error.message}`);
    const trang = (data ?? []) as { actor_user_id: string; tenant_id: string | null }[];
    if (trang.length === 0) break;
    for (const r of trang) {
      nguoi.add(r.actor_user_id);
      if (r.tenant_id) tiem.add(r.tenant_id);
      else coDongToanNenTang = true;
    }
    if (trang.length < CO_TRANG_QUET) break;
  }

  return { nguoi: [...nguoi], tiem: [...tiem], coDongToanNenTang };
}

/**
 * Tra tên người và tên tiệm bằng HAI truy vấn RIÊNG rồi tự ghép (xem cảnh báo
 * đầu file — không dùng phép nối lồng).
 *
 * ⚠️ GIỚI HẠN ĐÃ ĐO, nói thẳng ra chứ không giấu: RLS `profiles_select` là
 * `shares_tenant_with(user_id)` và `tenants_select` chỉ mở đúng tiệm đang mở,
 * nên một người quản trị nền tảng KHÔNG chắc tra được tên của đồng nghiệp
 * khác tiệm hay tên của tiệm khác. Thiếu khoá trong bảng tra ⇒ màn hiện mã
 * rút gọn ("Người quản trị acf5f897"), KHÔNG để trống và KHÔNG bịa tên.
 */
export async function traTen(
  supabase: SupabaseClient,
  idNguoi: string[],
  idTiem: string[],
): Promise<BangTen> {
  const [hoSo, cacTiem] = await Promise.all([
    idNguoi.length
      ? supabase.from("profiles").select("user_id, display_name").in("user_id", idNguoi)
      : Promise.resolve({ data: [], error: null }),
    idTiem.length
      ? supabase.from("tenants").select("id, name").in("id", idTiem)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (hoSo.error) throw new Error(`Không tra được tên người: ${hoSo.error.message}`);
  if (cacTiem.error) throw new Error(`Không tra được tên tiệm: ${cacTiem.error.message}`);

  return {
    nguoi: new Map(
      ((hoSo.data ?? []) as { user_id: string; display_name: string | null }[])
        .filter((p) => p.display_name?.trim())
        .map((p) => [p.user_id, p.display_name!.trim()]),
    ),
    tiem: new Map(
      ((cacTiem.data ?? []) as { id: string; name: string | null }[])
        .filter((t) => t.name?.trim())
        .map((t) => [t.id, t.name!.trim()]),
    ),
  };
}

/** Gắn tên đã tra vào từng dòng. Không tra được thì để null — màn tự hiện mã rút gọn. */
export function ghepTen(dong: DongNhatKy[], ten: BangTen): DongNhatKy[] {
  return dong.map((d) => ({
    ...d,
    actorName: ten.nguoi.get(d.actorId) ?? null,
    tenantName: d.tenantId ? (ten.tiem.get(d.tenantId) ?? null) : null,
  }));
}

// ==================== KHOẢNG NGÀY ====================

/** Đúng dạng `yyyy-MM-dd` hay không — chặn chuỗi lạ trên thanh địa chỉ. */
export function laNgay(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/**
 * `yyyy-MM-dd` (hiểu theo giờ VN) → mốc ISO của 00:00 ngày đó.
 * `themNgay = 1` cho mốc CUỐI của nửa khoảng `[tu, den)` — "đến ngày 20/08"
 * phải bao trọn cả ngày 20/08 chứ không dừng lúc 00:00.
 *
 * Việt Nam không có giờ mùa hè nên +07:00 cố định là đúng quanh năm — cùng
 * cách `monthKeyToRangeVN` trong lib/finance/gross-margin.ts đang làm.
 */
export function mocVN(ngay: string, themNgay = 0): string {
  const [y, m, d] = ngay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + themNgay) - 7 * 3600 * 1000).toISOString();
}

/**
 * Hôm nay theo giờ VN, dạng `yyyy-MM-dd`.
 *
 * Để ở đây chứ KHÔNG gọi thẳng `Date.now()` trong thân trang: luật
 * `react-hooks/purity` cấm gọi hàm không thuần khi dựng hình, và cả kho đã đi
 * theo nếp đó (`currentMonthVN`, `nowVN`).
 */
export function homNayVN(): string {
  return formatVN(Date.now(), "yyyy-MM-dd");
}

/** Ngày lùi `soNgay` ngày so với hôm nay, theo giờ VN, dạng `yyyy-MM-dd`. */
export function ngayLuiVN(soNgay: number): string {
  return formatVN(Date.now() - soNgay * 86_400_000, "yyyy-MM-dd");
}
