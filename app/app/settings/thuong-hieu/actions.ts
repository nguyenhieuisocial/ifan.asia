"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MA_MAU } from "@/lib/thuong-hieu";

/**
 * ĐẶT THƯƠNG HIỆU TIỆM (#334, thẻ `man-thuong-hieu-tiem`).
 *
 * ⚠️ CHỐT QUYỀN NẰM TRONG HÀM CSDL (`dat_thuong_hieu` tự kiểm `app_role()`),
 *   không ở đây. Lệnh máy chủ gọi được thẳng bằng một lời POST.
 *
 * ⚠️ ĐƯỜNG DẪN LOGO PHẢI NẰM TRONG THƯ MỤC CỦA CHÍNH TIỆM. Nhận đường dẫn tuỳ
 *   ý là cho phép trỏ `logo_url` sang ảnh chấm công của nhân viên hoặc tệp chat
 *   của tiệm khác — rồi đường `/api/logo/<tiệm>` sẽ vui vẻ phát nó ra cho cả
 *   internet. Chốt ở đây, và chốt LẦN HAI ở chính đường phát ảnh.
 */

const schema = z.object({
  duongDanLogo: z.string().max(300).nullable(),
  mau: z.enum(MA_MAU).nullable(),
});

export type DatThuongHieuInput = z.input<typeof schema>;

export async function datThuongHieu(
  input: DatThuongHieuInput,
): Promise<{ error: string | null }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };
  const { duongDanLogo, mau } = parsed.data;

  const supabase = await createClient();
  const { data: tiem } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tiem?.id) return { error: "notFound" };

  if (duongDanLogo && !duongDanLogo.startsWith(`${tiem.id}/thuong-hieu/`)) {
    return { error: "duongDanSai" };
  }

  const { data, error } = await supabase.rpc("dat_thuong_hieu", {
    p_logo_url: duongDanLogo,
    p_mau: mau,
  });
  if (error) return { error: "saveFailed" };
  const r = data as { ok: boolean; ly_do?: string } | null;
  if (!r?.ok) return { error: r?.ly_do ?? "saveFailed" };

  revalidatePath("/app/settings/thuong-hieu");
  return { error: null };
}
