"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CASH_AMOUNT_MAX, CASH_CATEGORIES, CASH_NOTE_MAX } from "@/lib/finance/cash-ledger";

/**
 * Sổ quỹ (ADR-0019 mục 8 việc 6). Ghi TAY — khoản tự sinh từ thu tiền đơn
 * hàng đi qua trigger `order_payments_emit_cash_entry` (migration #127),
 * KHÔNG qua action này (D1: một đường ghi cho mỗi nguồn).
 *
 * QUYỀN: không siết thêm ở đây — RLS `cash_entries_rw` (owner/admin/manager)
 * đã đúng luật, cùng nguyên tắc app/app/calendar/actions.ts.
 */

type ActionResult = { error: string | null };

const schema = z.object({
  direction: z.enum(["in", "out"]),
  amountVnd: z.number().int().positive().max(CASH_AMOUNT_MAX),
  fund: z.enum(["cash", "bank"]),
  category: z.enum(CASH_CATEGORIES),
  note: z.string().trim().max(CASH_NOTE_MAX).nullable(),
});

export async function recordCashEntry(
  input: z.infer<typeof schema>,
): Promise<ActionResult & { id?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "not_found" };

  // Trả về mã phiếu để nơi gọi đính ảnh chứng từ ngay sau đó (#351). Không
  // gộp ảnh vào chính câu ghi này: phép chốt đường dẫn nằm trong hàm
  // `dinh_chung_tu`, ghi thẳng ở đây là đi vòng qua nó.
  const { data: moi, error } = await supabase
    .from("cash_entries")
    .insert({
      tenant_id: tenant.id,
      direction: parsed.data.direction,
      amount_vnd: parsed.data.amountVnd,
      fund: parsed.data.fund,
      category: parsed.data.category,
      note: parsed.data.note,
      recorded_by: user.id,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (/row-level security/i.test(error.message)) return { error: "forbidden" };
    return { error: "save_failed" };
  }

  revalidatePath("/app/cashbook");
  return { error: null, id: (moi?.id as string | undefined) ?? undefined };
}

/**
 * Đính ảnh chứng từ vào một phiếu chi (thẻ `man-anh-chung-tu-phieu-chi`, #351).
 *
 * ⚠️ ĐI QUA HÀM `dinh_chung_tu` CỦA CSDL, KHÔNG `update` thẳng. Phép chốt "ảnh
 *   phải nằm trong thư mục của chính tiệm" nằm trong hàm đó. Ghi thẳng từ đây
 *   là bỏ qua phép chốt — và tầng web thì ai cũng gọi được qua API.
 */
export async function dinhChungTu(input: {
  entryId: string;
  chungTu: { duong_dan: string; ten: string; co: number }[];
}): Promise<ActionResult> {
  const parsed = z
    .object({
      entryId: z.uuid(),
      chungTu: z
        .array(
          z.object({
            duong_dan: z.string().min(1).max(500),
            ten: z.string().max(200),
            co: z.number().int().nonnegative(),
          }),
        )
        .max(3),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dinh_chung_tu", {
    p_id: parsed.data.entryId,
    p_chung_tu: parsed.data.chungTu,
  });
  if (error) return { error: "save_failed" };
  const ket = (data ?? {}) as { ok?: boolean; loi?: string };
  if (!ket.ok) return { error: ket.loi ?? "save_failed" };

  revalidatePath("/app/cashbook");
  return { error: null };
}

/**
 * Xin đường dẫn KÝ HẠN GIỜ để xem ảnh chứng từ.
 *
 * ⚠️ DÙNG CLIENT CỦA NGƯỜI ĐANG ĐĂNG NHẬP, không dùng khoá dịch vụ. Kho
 *   `tenant-files` còn chứa ảnh chấm công (mặt nhân viên) và tệp khách gửi
 *   trong Chat; ký bằng khoá dịch vụ nghĩa là bất cứ đường dẫn nào lọt vào đây
 *   cũng ký được. Để RLS của kho tự chặn theo thư mục tiệm.
 *
 * ⚠️ Ký HỎNG thì trả null cho ĐÚNG tấm đó chứ không bỏ khỏi danh sách — bỏ đi
 *   nghĩa là màn hình nói "phiếu này không có chứng từ" trong khi nó CÓ.
 */
export async function kyChungTu(
  duongDans: string[],
): Promise<{ duong_dan: string; url: string | null }[]> {
  if (duongDans.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("tenant-files")
    .createSignedUrls(duongDans.slice(0, 3), 3600);
  const theo = new Map(
    ((data ?? []) as { path: string | null; signedUrl: string | null }[]).map((x) => [
      x.path ?? "",
      x.signedUrl,
    ]),
  );
  return duongDans.slice(0, 3).map((d) => ({ duong_dan: d, url: theo.get(d) ?? null }));
}
