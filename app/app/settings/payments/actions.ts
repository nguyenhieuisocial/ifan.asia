"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Cài đặt → Nhận thanh toán (ADR-0019 mục 6). Số tài khoản để KHÁCH trả tiền
 * cho TIỆM — khác hẳn `/app/settings/billing` (tiệm trả tiền cho iFan), xem
 * ghi chú ranh giới ở thẻ design man-thu-tien-vietqr.html.
 */

type ActionResult = { error: string | null };

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

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "not_found" };

  const { error } = await supabase
    .from("tenants")
    .update({ bank_code: bankBin, bank_account_no: accountNo, bank_account_name: accountName })
    .eq("id", tenant.id);
  if (error) {
    if (/row-level security/i.test(error.message)) return { error: "forbidden" };
    return { error: "save_failed" };
  }

  revalidatePath("/app/settings/payments");
  // Màn Đơn hàng đọc trực tiếp cấu hình này để bật/tắt cách Thu tiền VietQR.
  revalidatePath("/app/orders");
  return { error: null };
}
