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

const voucherFields = z
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
  });

const voucherSchema = voucherFields
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
 * Sửa một mã đã tạo.
 *
 * ═══════════════════════════════════════════════════════════════════
 * TRƯỜNG NÀO CÒN SỬA ĐƯỢC SAU KHI MÃ ĐÃ CÓ NGƯỜI DÙNG
 * ═══════════════════════════════════════════════════════════════════
 * ĐO trước khi chốt (19/08, đọc thẳng lược đồ + thân hàm trong CSDL):
 *
 *  · `voucher_redemptions.discount_vnd` là cột LƯU THẬT (bigint not null), do
 *    `voucher_apply` ghi số tiền giảm ĐÃ TÍNH tại đúng lúc dùng. `order_lines
 *    .discount_vnd` cũng đã bị trừ sẵn tại lúc đó. Cả hai KHÔNG đọc lại mức
 *    giảm của mã về sau.
 *  · Mọi phép cộng báo cáo (`layVouchers` ở đây, `campaign_tong_ket` trong
 *    CSDL) đều cộng từ `voucher_redemptions.discount_vnd`, không nhân lại từ
 *    `percent_off`.
 *  ⇒ Sửa mức giảm KHÔNG viết lại đơn cũ và KHÔNG làm sai báo cáo cũ.
 *
 * Nhưng vẫn KHOÁ mức giảm, vì một lý do khác và có thật: thẻ mã chỉ hiện được
 * MỘT mức giảm. Đổi "giảm 15%" thành "giảm 20%" trên một mã đã dùng 30 lượt là
 * dựng ra một thẻ ghi "Giảm 20% · đã dùng 30 lượt · đã giảm 4.500.000đ" — ba
 * con số không thể cùng đúng, và màn hình không có chỗ nào nói được "30 lượt kia
 * là mức cũ". Sai lệch nằm ở chỗ NGƯỜI ĐỌC, không ở chỗ dữ liệu.
 *
 * Vạch chia đo được: trường có mặt trong phép TÍNH TIỀN của `voucher_check`
 * (`kind` · `percent_off` · `amount_off_vnd` · `max_discount_vnd`) thì khoá lại
 * khi đã có lượt dùng. Trường chỉ là CỬA CHẶN đúng/sai (`expires_at` ·
 * `max_uses` · `min_order_vnd` · `per_customer_limit` · `new_customer_only`)
 * chỉ có tác dụng về SAU, không mô tả lượt đã qua ⇒ luôn sửa được.
 *
 * `code` cũng khoá khi đã dùng: khách đang cầm chuỗi cũ trong tay, và
 * `vouchers_code_unique` cho phép người khác chiếm lại chuỗi vừa bỏ ra.
 * `note` là ghi chú nội bộ, không ai ngoài tiệm đọc ⇒ luôn sửa được.
 *
 * ⚠️ Trường bị khoá KHÔNG được đưa vào câu ghi. Chặn ở màn hình là chưa đủ —
 * hộp thoại có thể bị gọi thẳng, và một ô `disabled` vẫn gửi giá trị lên được.
 */
export async function suaVoucher(
  id: string,
  input: z.infer<typeof voucherFields>,
): Promise<ActionResult> {
  const idParsed = z.uuid().safeParse(id);
  if (!idParsed.success) return { error: "invalid_input" };
  // KHÔNG đòi hạn phải ở tương lai như lúc tạo: mã đã hết hạn vẫn phải sửa được
  // ghi chú, nếu không thì một trường luôn-mở lại bị một trường khác khoá hộ.
  const parsed = voucherFields.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" };

  const supabase = await createClient();

  // Lượt dùng ĐẾM TỪ SỔ, đúng luật 1 của `queries.ts` — không có bộ đếm rời.
  const { count, error: demError } = await supabase
    .from("voucher_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("voucher_id", idParsed.data);
  if (demError) return { error: loiGhi(demError.message) };
  const daDung = count ?? 0;

  const d = parsed.data;
  // Hạ trần lượt xuống DƯỚI số đã dùng sinh ra thẻ ghi "đã dùng 30/5" với thanh
  // tiến trình vượt 100% — một câu không đọc được. Muốn ngừng phát thì đã có nút
  // Tạm dừng.
  if (d.maxUses < daDung) return { error: "tran_luot_thap_hon_da_dung" };

  const patch: Record<string, unknown> = {
    max_uses: d.maxUses,
    expires_at: d.expiresAt,
    min_order_vnd: d.minOrderVnd,
    per_customer_limit: d.perCustomerLimit,
    new_customer_only: d.newCustomerOnly,
    note: d.note,
  };
  if (daDung === 0) {
    patch.code = d.code.toUpperCase();
    patch.kind = d.kind;
    patch.percent_off = d.kind === "percent" ? d.percentOff : null;
    patch.amount_off_vnd = d.kind === "amount" ? d.amountOffVnd : null;
    patch.max_discount_vnd = d.maxDiscountVnd;
  }

  const { data, error } = await supabase
    .from("vouchers")
    .update(patch)
    .eq("id", idParsed.data)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // Cùng cái bẫy đã dính 18/08: RLS lọc hết thì UPDATE trả error null và 0 dòng,
  // im lặng y hệt lúc thành công.
  if (!data || data.length === 0) return { error: "forbidden" };

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
