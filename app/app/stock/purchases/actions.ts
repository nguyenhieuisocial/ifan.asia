"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { layPhieuNhap, type DongPhieuNhap } from "./queries";

/**
 * Phiếu nhập hàng + nhà cung cấp (ADR-0021 mục 6, thẻ `man-phieu-nhap.html`).
 *
 * QUYỀN: không siết thêm ở tầng này — RLS `purchases_rw`/`purchase_lines_rw`/
 * `suppliers_rw` (owner/admin/manager) đã đúng luật, cùng nguyên tắc
 * `app/app/cashbook/actions.ts`. Lỗi RLS được dịch thành `forbidden` để màn nói
 * "Bạn không có quyền làm việc này" thay vì "Lưu thất bại".
 *
 * MỘT CÁI BẤM LƯU = HAI VIỆC, và cả hai đều do CSDL làm (migration #151):
 * chốt phiếu sinh dòng sổ kho dấu cộng + đè giá vốn `item_costs` theo giá lần
 * nhập này. Tầng này CỐ Ý không tự ghi hai thứ đó — chốt nằm ở CSDL để mọi
 * đường ghi khác (bot, nhập Excel) cũng phải đi qua.
 * Việc thứ ba — ghi sổ chi bên Sổ quỹ — CỐ Ý KHÔNG làm: nhận hàng và trả tiền
 * thường không cùng ngày, tự ghi chi lúc nhập là sổ quỹ báo âm khoản tiền chưa
 * hề chi ra. Công nợ nhà cung cấp thuộc V5.
 */

type KetQuaLuu = { error: string | null };

const QTY_MAX = 1_000_000;
const HE_SO_MAX = 100_000;
const DON_GIA_MAX = 100_000_000_000;
export const GHI_CHU_MAX = 500;
export const NCC_TEN_MAX = 120;
export const NCC_DIEN_THOAI_MAX = 30;

const dongSchema = z.object({
  itemId: z.uuid(),
  qtyMua: z.number().finite().positive().max(QTY_MAX),
  heSo: z.number().finite().positive().max(HE_SO_MAX),
  donGiaMua: z.number().int().min(0).max(DON_GIA_MAX),
});

const phieuSchema = z.object({
  supplierId: z.uuid(),
  /** `yyyy-MM-dd` do ô ngày của trình duyệt trả về. */
  ngayNhap: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ghiChu: z.string().trim().max(GHI_CHU_MAX).nullable(),
  dong: z.array(dongSchema).min(1).max(200),
});

export type PhieuNhapInput = z.infer<typeof phieuSchema>;

function loiGhi(message: string): string {
  return /row-level security/i.test(message) ? "forbidden" : "save_failed";
}

/**
 * Ghi một phiếu nhập rồi CHỐT ngay.
 *
 * Ba bước, cố ý theo đúng thứ tự này: tạo phiếu ở trạng thái **nháp** → thêm
 * dòng hàng (khoá `purchase_lines_lock_guard` chỉ cho ghi khi phiếu còn nháp)
 * → đổi sang **completed** để trigger CSDL vào kho và cập nhật giá vốn.
 *
 * Hỏng giữa chừng thì DỌN phiếu nháp vừa tạo: để lại một phiếu nháp mà màn
 * không có đường nào chốt tiếp là để lại rác người dùng không hiểu và không xoá
 * được. Dữ liệu người dùng vừa gõ vẫn nằm nguyên ở màn — đây là màn gõ lâu nhất
 * mảng kho, mất phiếu đang gõ là mất cả buổi.
 */
export async function taoPhieuNhap(input: PhieuNhapInput): Promise<KetQuaLuu> {
  const parsed = phieuSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "not_found" };

  const { data: phieu, error: loiPhieu } = await supabase
    .from("purchases")
    .insert({
      tenant_id: tenant.id,
      supplier_id: parsed.data.supplierId,
      status: "draft",
      note: parsed.data.ghiChu,
      // Ngày người dùng chọn là ngày theo giờ VN — ghim múi giờ để không lệch
      // sang hôm trước khi máy chủ chạy ở UTC.
      received_at: `${parsed.data.ngayNhap}T00:00:00+07:00`,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (loiPhieu || !phieu) return { error: loiPhieu ? loiGhi(loiPhieu.message) : "save_failed" };

  const { error: loiDong } = await supabase.from("purchase_lines").insert(
    parsed.data.dong.map((d, i) => ({
      tenant_id: tenant.id,
      purchase_id: phieu.id,
      item_id: d.itemId,
      qty_mua: d.qtyMua,
      he_so: d.heSo,
      don_gia_mua: d.donGiaMua,
      sort_order: i,
    })),
  );
  if (loiDong) {
    await supabase.from("purchases").delete().eq("id", phieu.id);
    return { error: loiGhi(loiDong.message) };
  }

  const { error: loiChot } = await supabase.from("purchases").update({ status: "completed" }).eq("id", phieu.id);
  if (loiChot) {
    await supabase.from("purchases").delete().eq("id", phieu.id);
    return { error: loiGhi(loiChot.message) };
  }

  revalidatePath("/app/stock/purchases");
  revalidatePath("/app/stock");
  return { error: null };
}

const nccSchema = z.object({
  ten: z.string().trim().min(1).max(NCC_TEN_MAX),
  dienThoai: z.string().trim().max(NCC_DIEN_THOAI_MAX).nullable(),
  ghiChu: z.string().trim().max(GHI_CHU_MAX).nullable(),
});

/** Thêm nhà cung cấp NGAY TRONG phiếu nhập — người đang cầm thùng hàng không
 *  nên bị bắt đi sang màn khác khai hồ sơ rồi quay lại. Đúng ba ô, không hơn:
 *  công nợ nhà cung cấp thuộc V5 (ADR-0021 mục 6). */
export async function themNhaCungCap(
  input: z.infer<typeof nccSchema>,
): Promise<{ error: string | null; id: string | null }> {
  const parsed = nccSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input", id: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated", id: null };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "not_found", id: null };

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      tenant_id: tenant.id,
      name: parsed.data.ten,
      phone: parsed.data.dienThoai,
      note: parsed.data.ghiChu,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error ? loiGhi(error.message) : "save_failed", id: null };

  revalidatePath("/app/stock/purchases");
  return { error: null, id: data.id as string };
}

export type KetQuaTrangPhieu = { phieu: DongPhieuNhap[]; cursorTiep: string | null; error: string | null };

/** Trang tiếp của danh sách phiếu — con trỏ ghép, xem `queries.ts`. */
export async function layThemPhieuNhap(cursor: string): Promise<KetQuaTrangPhieu> {
  const rong: { phieu: DongPhieuNhap[]; cursorTiep: null } = { phieu: [], cursorTiep: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...rong, error: "not_authenticated" };

  try {
    const trang = await layPhieuNhap(supabase, cursor);
    return { ...trang, error: null };
  } catch {
    return { ...rong, error: "load_failed" };
  }
}
