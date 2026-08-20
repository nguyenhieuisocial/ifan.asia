"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";

/**
 * Cài đặt → Nhận thanh toán (ADR-0019 mục 6). Số tài khoản để KHÁCH trả tiền
 * cho TIỆM — khác hẳn `/app/settings/billing` (tiệm trả tiền cho iFan), xem
 * ghi chú ranh giới ở thẻ design man-thu-tien-vietqr.html.
 */

type ActionResult = { error: string | null };

/** Khớp `tenants_update` (owner/admin) và cổng `canManage` của page.tsx. */
const MANAGE_ROLES = ["owner", "admin"];

const schema = z.object({
  bankBin: z.string().regex(/^\d{6}$/).nullable(),
  accountNo: z
    .string()
    .trim()
    .regex(/^\d{4,30}$/)
    .nullable(),
  accountName: z.string().trim().min(1).max(120).nullable(),
});

export async function saveBankInfo(input: z.infer<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  // Constraint CSDL tenants_bank_all_or_none (migration #127) đòi cả 3 CÙNG có
  // hoặc CÙNG trống — kiểm sớm ở đây để báo lỗi rõ ràng, không phải để người
  // dùng đọc "violates check constraint" khó hiểu.
  const { bankBin, accountNo, accountName } = parsed.data;
  const allNull = bankBin === null && accountNo === null && accountName === null;
  const allSet = bankBin !== null && accountNo !== null && accountName !== null;
  if (!allNull && !allSet) return { error: "bank_fields_partial" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  // Vai phải kiểm Ở ĐÂY chứ không phó mặc RLS. Đây là SỐ TÀI KHOẢN NHẬN TIỀN của
  // tiệm — sửa được là chuyển tiền của khách sang túi người khác. Hai lỗ đo được:
  //  1) màn có gác `canManage` nhưng gọi thẳng action thì không qua gác đó — quản
  //     lý gọi thẳng thì RLS chặn nhưng update trả 0 dòng KHÔNG kèm lỗi, action cũ
  //     báo "Đã lưu" trong khi không lưu gì;
  //  2) `app_role()` của RLS đọc từ CLAIM nên KHÔNG biết chuyện gỡ người: quản trị
  //     viên vừa bị gỡ khỏi tiệm vẫn ĐỔI THẬT được số tài khoản suốt lúc thẻ đăng
  //     nhập cũ còn sống (~1 giờ) — đo được 1 dòng. `getCurrentMembership` lọc
  //     `status='active'` + hạn phiên hỗ trợ nên bịt đúng chỗ đó.
  const [member, { data: tenant }] = await Promise.all([
    getCurrentMembership(supabase, user.id),
    supabase.from("tenants").select("id").maybeSingle(),
  ]);
  if (!tenant) return { error: "not_found" };
  if (!member || !MANAGE_ROLES.includes(member.role)) return { error: "forbidden" };

  const { data: saved, error } = await supabase
    .from("tenants")
    .update({ bank_code: bankBin, bank_account_no: accountNo, bank_account_name: accountName })
    .eq("id", tenant.id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (/row-level security/i.test(error.message)) return { error: "forbidden" };
    return { error: "save_failed" };
  }
  // Lưới cuối: RLS lọc hết thì 0 dòng mà không có lỗi nào để bắt.
  if (!saved) return { error: "forbidden" };

  revalidatePath("/app/settings/payments");
  // Màn Đơn hàng đọc trực tiếp cấu hình này để bật/tắt cách Thu tiền VietQR.
  revalidatePath("/app/orders");
  return { error: null };
}

const vatSchema = z.object({
  enabled: z.boolean(),
  rate: z.number().min(0).max(20),
});

/**
 * #190 — cấu hình VAT (Model A, giá đã gồm VAT). Ghi bảng tax_settings (không
 * đụng tenants nóng). Chỉ owner/admin — cùng khuôn gác vai + đếm dòng như
 * saveBankInfo: đây là con số thuế in ra cho khách, gọi thẳng action mà không
 * qua gác màn thì phải chặn ở đây, không phó mặc RLS trả 0-dòng-không-lỗi.
 */
export async function saveVatSettings(input: z.infer<typeof vatSchema>): Promise<ActionResult> {
  const parsed = vatSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const [member, { data: tenant }] = await Promise.all([
    getCurrentMembership(supabase, user.id),
    supabase.from("tenants").select("id").maybeSingle(),
  ]);
  if (!tenant) return { error: "not_found" };
  if (!member || !MANAGE_ROLES.includes(member.role)) return { error: "forbidden" };

  const { data: saved, error } = await supabase
    .from("tax_settings")
    .upsert(
      { tenant_id: tenant.id, enabled: parsed.data.enabled, rate: parsed.data.rate, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" },
    )
    .select("tenant_id")
    .maybeSingle();
  if (error) {
    if (/row-level security/i.test(error.message)) return { error: "forbidden" };
    return { error: "save_failed" };
  }
  if (!saved) return { error: "forbidden" };

  revalidatePath("/app/settings/payments");
  revalidatePath("/app/orders");
  return { error: null };
}
