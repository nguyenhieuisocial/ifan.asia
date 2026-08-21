"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * THỬ NGHIỆM A/B — lệnh ghi của chủ SaaS (#336).
 *
 * ⚠️ CHỐT QUYỀN NẰM TRONG HÀM CSDL (`admin_dat_thu_nghiem` tự kiểm
 *   `is_platform_admin()`). Lệnh máy chủ gọi được thẳng bằng một lời POST.
 *
 * ⚠️ KHÔNG có lệnh XOÁ thử nghiệm. Xoá đi là mất luôn cơ sở để đọc lại số liệu
 *   cũ — bảng đếm vẫn còn nhánh 'a'/'b' nhưng không còn ai biết câu A là câu
 *   gì. Muốn ngưng thì đặt `dangChay = false`, hàng vẫn nằm đó.
 */

const TRANG = ["/", "/bang-gia", "/tinh-nang", "/lo-trinh"] as const;

const schema = z.object({
  khoa: z.string().regex(/^[a-z][a-z0-9-]{1,48}$/),
  trang: z.enum(TRANG),
  cauA: z.string().trim().min(1).max(120),
  cauB: z.string().trim().min(1).max(120),
  dangChay: z.boolean(),
});

export type DatThuNghiemInput = z.input<typeof schema>;

export async function datThuNghiem(
  input: DatThuNghiemInput,
): Promise<{ error: string | null }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };
  const d = parsed.data;

  // Hai câu giống hệt nhau thì thử nghiệm không đo được gì — chặn sớm thay vì
  // để nó chạy hai tuần rồi mới thấy hai cột bằng nhau.
  if (d.cauA === d.cauB) return { error: "haiCauGiongNhau" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dat_thu_nghiem", {
    p_khoa: d.khoa,
    p_trang: d.trang,
    p_cau_a: d.cauA,
    p_cau_b: d.cauB,
    p_dang_chay: d.dangChay,
  });
  if (error) return { error: "saveFailed" };
  const r = data as { ok: boolean; ly_do?: string } | null;
  if (!r?.ok) return { error: r?.ly_do ?? "saveFailed" };

  revalidatePath("/admin/thu-nghiem");
  return { error: null };
}
