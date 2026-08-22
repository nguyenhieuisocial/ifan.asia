"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Ghi một lần khách hẹn trả nợ (thẻ `man-hen-tra-no`, migration #354).
 *
 * ⚠️ CHỈ GHI THÊM, KHÔNG SỬA. Hẹn mới không ghi đè hẹn cũ — nhờ vậy mới đếm
 *   được "thất hẹn 2 lần", con số có sức nặng nhất trên màn Công nợ vì nó trả
 *   lời câu *còn nên bán chịu cho người này không*. Bảng `hen_tra_no` cố ý
 *   KHÔNG có policy cho sửa/xoá, nên chốt nằm ở CSDL chứ không chỉ ở đây.
 *
 * ⚠️ KHÔNG KIỂM VAI Ở TẦNG WEB. RLS của bảng đã chốt đúng ba vai xem được màn
 *   Công nợ. Viết lại phép kiểm ở đây là dựng lớp phân quyền thứ hai để về sau
 *   lệch với lớp thứ nhất.
 */
export async function ghiHenTra(input: {
  contactId: string;
  ngayHen: string;
  ghiChu: string;
}): Promise<{ error: string | null }> {
  const parsed = z
    .object({
      contactId: z.uuid(),
      // Khuôn `YYYY-MM-DD` — nhận thẳng chuỗi từ ô chọn ngày, không qua `Date`
      // (qua `Date` là lệch múi giờ, đúng cái bẫy đã gặp nhiều lần trong kho).
      ngayHen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ghiChu: z.string().trim().max(300),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "not_found" };

  const { error } = await supabase.from("hen_tra_no").insert({
    tenant_id: tenant.id,
    contact_id: parsed.data.contactId,
    ngay_hen: parsed.data.ngayHen,
    ghi_chu: parsed.data.ghiChu || null,
    tao_boi: user.id,
  });
  if (error) {
    if (/row-level security/i.test(error.message)) return { error: "forbidden" };
    return { error: "save_failed" };
  }

  revalidatePath("/app/cong-no");
  return { error: null };
}
