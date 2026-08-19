"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Ưu đãi & Tích điểm (V6 retention).
 *
 * QUYỀN: không siết thêm ở tầng này. RLS `vouchers_manage` (owner/admin/manager)
 * và `loyalty_config_manage` (owner/admin) đã đúng luật — thêm một lớp kiểm nữa
 * ở đây chỉ tạo ra hai nơi có thể LỆCH nhau khi một bên sửa mà bên kia quên (D2).
 *
 * BA TRẦN của voucher là ràng buộc CSDL (`not null` + check). Ở đây kiểm lại
 * bằng zod KHÔNG phải để thay thế, mà để người dùng thấy lời giải thích tiếng
 * Việt thay vì lỗi kỹ thuật của Postgres.
 */

type ActionResult = { error: string | null };

function loiGhi(message: string): string {
  if (/row-level security/i.test(message)) return "forbidden";
  if (/vouchers_code_unique/i.test(message)) return "trung_ma";
  return "save_failed";
}

const voucherSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "ma_qua_ngan")
      .max(32, "ma_qua_dai")
      // Mã được đọc qua điện thoại và gõ tay ở quầy — không cho ký tự dễ nhìn nhầm.
      .regex(/^[A-Za-z0-9_-]+$/, "ma_ky_tu_la"),
    kind: z.enum(["percent", "amount"]),
    percentOff: z.number().int().min(1).max(100).nullable(),
    amountOffVnd: z.number().int().min(1).nullable(),
    maxUses: z.number().int().min(1, "thieu_tran_luot"),
    maxDiscountVnd: z.number().int().min(1, "thieu_tran_tien"),
    expiresAt: z.string().min(1, "thieu_han"),
    minOrderVnd: z.number().int().min(0),
    perCustomerLimit: z.number().int().min(1).nullable(),
    newCustomerOnly: z.boolean(),
    note: z.string().trim().max(500).nullable(),
  })
  .refine((v) => (v.kind === "percent" ? v.percentOff !== null : v.amountOffVnd !== null), {
    message: "thieu_gia_tri_giam",
  })
  // Hạn phải ở TƯƠNG LAI: tạo sẵn mã đã hết hạn là tạo ra một thứ trông như
  // đang chạy mà không ai dùng được, và nhân viên sẽ đứng giải thích với khách.
  .refine((v) => new Date(v.expiresAt).getTime() > Date.now(), { message: "han_da_qua" });

export async function taoVoucher(input: z.infer<typeof voucherSchema>): Promise<ActionResult> {
  const parsed = voucherSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  // `vouchers.tenant_id` là NOT NULL, KHÔNG có default và KHÔNG có trigger điền
  // hộ — thiếu nó thì mọi lần "Tạo mã" đều rơi vào thông báo chung chung "Chưa
  // lưu được". Bản đầu quên đúng chỗ này; RLS `with check` chỉ chặn SAI tiệm chứ
  // không tự điền tiệm ĐÚNG. Cùng khuôn `luuLuatTichDiem` bên dưới.
  const { data: tenantRow } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenantRow) return { error: "no_tenant" };

  const d = parsed.data;
  const { error } = await supabase.from("vouchers").insert({
    tenant_id: tenantRow.id,
    code: d.code.toUpperCase(),
    kind: d.kind,
    percent_off: d.kind === "percent" ? d.percentOff : null,
    amount_off_vnd: d.kind === "amount" ? d.amountOffVnd : null,
    max_uses: d.maxUses,
    max_discount_vnd: d.maxDiscountVnd,
    expires_at: d.expiresAt,
    min_order_vnd: d.minOrderVnd,
    per_customer_limit: d.perCustomerLimit,
    new_customer_only: d.newCustomerOnly,
    note: d.note,
    created_by: user.id,
  });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/loyalty");
  return { error: null };
}

/**
 * Bật/dừng một mã. KHÔNG cho xoá: mã đã phát ra ngoài thì lượt dùng là sự thật
 * lịch sử, xoá đi là báo cáo giảm giá của tháng đó tự nhiên hụt một khoản.
 */
export async function doiTrangThaiVoucher(
  id: string,
  status: "active" | "paused",
): Promise<ActionResult> {
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(["active", "paused"]) })
    .safeParse({ id, status });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vouchers")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // RLS chặn thì UPDATE không báo lỗi, chỉ chạm 0 dòng — phải tự nhận ra, nếu
  // không màn hình báo "đã lưu" trong khi chẳng lưu gì (bẫy đã dính 18/08).
  if (!data || data.length === 0) return { error: "forbidden" };

  revalidatePath("/app/loyalty");
  return { error: null };
}

const luatSchema = z.object({
  isActive: z.boolean(),
  vndPerPoint: z.number().int().min(1000, "moc_tich_qua_nho").max(10000000),
  redeemPointsUnit: z.number().int().min(1).max(1000000),
  redeemValueVnd: z.number().int().min(1000).max(100000000),
  referralPoints: z.number().int().min(0).max(1000000),
  // Trần 120 tháng khớp check constraint của CSDL; sàn 1 tháng để không ai vô
  // tình đặt 0 rồi điểm bốc hơi ngay khi vừa cộng.
  expireMonths: z.number().int().min(1, "han_qua_ngan").max(120, "han_qua_dai"),
});

export async function luuLuatTichDiem(
  input: z.infer<typeof luatSchema>,
): Promise<ActionResult> {
  const parsed = luatSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" };

  const supabase = await createClient();
  const { data: tenantRow } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenantRow) return { error: "no_tenant" };

  const d = parsed.data;
  const { data, error } = await supabase
    .from("loyalty_config")
    .upsert(
      {
        tenant_id: tenantRow.id,
        is_active: d.isActive,
        vnd_per_point: d.vndPerPoint,
        redeem_points_unit: d.redeemPointsUnit,
        redeem_value_vnd: d.redeemValueVnd,
        referral_points: d.referralPoints,
        expire_months: d.expireMonths,
      },
      { onConflict: "tenant_id" },
    )
    .select("tenant_id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "forbidden" };

  revalidatePath("/app/loyalty");
  return { error: null };
}
