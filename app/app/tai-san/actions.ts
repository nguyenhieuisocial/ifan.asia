"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { TINH_TRANG_TAI_SAN } from "@/lib/catalog/tai-san-chung";

/**
 * THAO TÁC TÀI SẢN (thẻ `man-tai-san`, migration #358).
 *
 * ⚠️ KHÔNG hàm nào ở đây đặt "đang dùng" như một tình trạng. Chỗ giao suy từ
 *   lượt bàn giao còn mở — xem chú thích đầu migration #358.
 */

type KetQua = { error: string | null };

async function xacThuc() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "not_authenticated" };
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .maybeSingle();
  if (!tenant) return { ok: false as const, error: "not_found" };
  return {
    ok: true as const,
    supabase,
    userId: user.id,
    tenantId: tenant.id as string,
  };
}

const veLai = () => revalidatePath("/app/tai-san");

/** Mã lỗi CSDL → chuỗi màn hiểu được. Không nuốt lỗi lạ thành "lưu hỏng" chung chung. */
function doiLoi(code: string | undefined): string {
  if (code === "23505") return "trung_ma";
  if (code === "23514") return "invalid_input";
  if (code === "42501") return "forbidden";
  return "save_failed";
}

const taiSanSchema = z.object({
  id: z.uuid().nullable(),
  ten: z.string().trim().min(1).max(200),
  ma: z.string().trim().max(60).nullable(),
  loai: z.string().trim().max(60).nullable(),
  viTri: z.string().trim().max(120).nullable(),
  ngayMua: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  giaMuaVnd: z.number().int().min(0).max(100_000_000_000).nullable(),
  baoHanhDen: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  ghiChu: z.string().trim().max(500).nullable(),
  tinhTrang: z.enum(TINH_TRANG_TAI_SAN),
});

/** Thêm mới hoặc sửa. `id = null` là thêm mới. */
export async function luuTaiSan(
  input: z.infer<typeof taiSanSchema>,
): Promise<KetQua & { id?: string }> {
  const parsed = taiSanSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };
  const d = parsed.data;

  // Chuỗi rỗng và null là CÙNG một ý ("không khai"), nhưng chỉ mục duy nhất
  // trên `ma` coi hai chuỗi rỗng là trùng nhau. Chuẩn hoá về null.
  const rong = (s: string | null) => (s === null || s === "" ? null : s);
  const ban = {
    ten: d.ten,
    ma: rong(d.ma),
    loai: rong(d.loai),
    vi_tri: rong(d.viTri),
    ngay_mua: d.ngayMua,
    gia_mua_vnd: d.giaMuaVnd,
    bao_hanh_den: d.baoHanhDen,
    ghi_chu: rong(d.ghiChu),
    tinh_trang: d.tinhTrang,
  };

  if (d.id) {
    const { error } = await auth.supabase
      .from("assets")
      .update(ban)
      .eq("id", d.id);
    if (error) return { error: doiLoi(error.code) };
    veLai();
    return { error: null, id: d.id };
  }

  const { data, error } = await auth.supabase
    .from("assets")
    .insert({ ...ban, tenant_id: auth.tenantId, created_by: auth.userId })
    .select("id")
    .single();
  if (error) return { error: doiLoi(error.code) };
  veLai();
  return { error: null, id: data.id as string };
}

const giaoSchema = z
  .object({
    assetId: z.uuid(),
    employeeId: z.uuid().nullable(),
    boPhan: z.string().trim().max(120).nullable(),
    ghiChu: z.string().trim().max(500).nullable(),
  })
  // Đúng MỘT trong hai — khớp ràng buộc `asset_assignments_giao_cho_ai` ở CSDL.
  // Kiểm ở đây để người dùng nhận câu tiếng Việt thay vì mã lỗi Postgres.
  .refine(
    (x) => (x.employeeId === null) !== (x.boPhan === null || x.boPhan === ""),
    {
      message: "phai_chon_mot",
    },
  );

/**
 * GIAO TÀI SẢN.
 *
 * ⚠️ CHỈ GIAO ĐƯỢC MÓN ĐANG "DÙNG ĐƯỢC" — học từ Snipe-IT: form giao chỉ nhận
 *   tình trạng khả dụng, còn form thu hồi thì nhận MỌI tình trạng (thu về để
 *   sửa, để thanh lý). Không có luật này thì người ta giao đi một cái máy đang
 *   hỏng và người nhận phát hiện lúc đã ký nhận.
 */
export async function giaoTaiSan(
  input: z.infer<typeof giaoSchema>,
): Promise<KetQua> {
  const parsed = giaoSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };
  const d = parsed.data;

  const { data: ts } = await auth.supabase
    .from("assets")
    .select("tinh_trang")
    .eq("id", d.assetId)
    .maybeSingle();
  if (!ts) return { error: "not_found" };
  if (ts.tinh_trang !== "dung_duoc") return { error: "khong_giao_duoc" };

  const { error } = await auth.supabase.from("asset_assignments").insert({
    tenant_id: auth.tenantId,
    asset_id: d.assetId,
    employee_id: d.employeeId,
    bo_phan: d.boPhan === "" ? null : d.boPhan,
    giao_boi: auth.userId,
    ghi_chu: d.ghiChu === "" ? null : d.ghiChu,
  });
  // 23505 = đã có lượt giao còn mở. Hai người cùng bấm giao trên hai máy.
  if (error)
    return {
      error: error.code === "23505" ? "dang_giao_roi" : doiLoi(error.code),
    };
  veLai();
  return { error: null };
}

/** Người nhận tự bấm xác nhận. Chính sách RLS `asset_assignments_tu_xac_nhan` chốt ai được bấm. */
export async function xacNhanNhan(banGiaoId: string): Promise<KetQua> {
  if (!z.uuid().safeParse(banGiaoId).success) return { error: "invalid_input" };
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("asset_assignments")
    .update({ xac_nhan_luc: new Date().toISOString() })
    .eq("id", banGiaoId)
    .is("xac_nhan_luc", null)
    .select("id");
  if (error) return { error: doiLoi(error.code) };
  // ⚠️ RLS lọc mất dòng thì Supabase trả `error = null` và 0 dòng — IM LẶNG y
  //   hệt lúc thành công. Phải tự kiểm số dòng, không thì màn báo "đã xác nhận"
  //   trong khi chẳng có gì được ghi.
  if (!data || data.length === 0) return { error: "forbidden" };
  veLai();
  return { error: null };
}

/** Thu hồi — nhận MỌI tình trạng, kể cả hỏng. */
export async function thuHoiTaiSan(banGiaoId: string): Promise<KetQua> {
  if (!z.uuid().safeParse(banGiaoId).success) return { error: "invalid_input" };
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("asset_assignments")
    .update({ thu_hoi_luc: new Date().toISOString(), thu_hoi_boi: auth.userId })
    .eq("id", banGiaoId)
    .is("thu_hoi_luc", null)
    .select("id");
  if (error) return { error: doiLoi(error.code) };
  if (!data || data.length === 0) return { error: "forbidden" };
  veLai();
  return { error: null };
}

const tinhTrangSchema = z.object({
  assetId: z.uuid(),
  tinhTrang: z.enum(TINH_TRANG_TAI_SAN),
});

/** Đổi tình trạng vật lý. Không đụng tới chỗ giao — hai trục độc lập. */
export async function doiTinhTrang(
  input: z.infer<typeof tinhTrangSchema>,
): Promise<KetQua> {
  const parsed = tinhTrangSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase
    .from("assets")
    .update({ tinh_trang: parsed.data.tinhTrang })
    .eq("id", parsed.data.assetId);
  if (error) return { error: doiLoi(error.code) };
  veLai();
  return { error: null };
}
