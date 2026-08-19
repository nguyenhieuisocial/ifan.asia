"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Hoa hồng (V7, migration #180). Thẻ man-hoa-hong.html.
 *
 * QUYỀN: không siết lại ở tầng này. `commission_rates_manage` (owner/admin) và
 * hàm `commission_sinh_ky` (tự kiểm owner/admin/manager vì nó `security
 * definer`) đã là hàng rào thật. Màn hình chỉ ẩn nút cho đúng vai — quản lý gọi
 * thẳng action đổi tỉ lệ vẫn bị CSDL từ chối (ca 17 của scripts/hoa-hong-smoke.mjs).
 *
 * ⚠️ `commission_rates.tenant_id` là `not null` KHÔNG default: RLS `with check`
 * chỉ chặn ghi sang tiệm khác chứ không tự điền tiệm đúng.
 */

type ActionResult = { error: string | null };

function loiGhi(message: string): string {
  if (/forbidden/i.test(message)) return "forbidden";
  if (/no_tenant_context/i.test(message)) return "no_tenant";
  if (/row-level security/i.test(message)) return "forbidden";
  return "save_failed";
}

type BoiCanh =
  | { ok: false; error: string }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      userId: string;
      tenantId: string;
    };

async function boiCanh(): Promise<BoiCanh> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { ok: false, error: "not_found" };
  return { ok: true, supabase, userId: user.id, tenantId: tenant.id as string };
}

const kySchema = z.string().regex(/^\d{4}-\d{2}-01$/);

/**
 * Tính lại hoa hồng cho ĐÚNG một tháng.
 *
 * Trigger `orders_sinh_hoa_hong` (#180) đã sinh khoản ngay lúc chốt đơn, nên
 * đường này KHÔNG phải đường chính — nó dành cho hai việc: bắt kịp dữ liệu có
 * TRƯỚC bản #180, và sinh bù sau khi chủ tiệm sửa tỉ lệ. Chạy bao nhiêu lần cũng
 * ra cùng một tập khoản (chỉ mục duy nhất `commission_mot_dong_mot_nguoi`).
 */
export async function tinhLaiHoaHong(input: {
  period: string;
}): Promise<{ error: string | null; created?: number }> {
  const parsed = z.object({ period: kySchema }).safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };

  const { data, error } = await ctx.supabase.rpc("commission_sinh_ky", {
    p_period: parsed.data.period,
  });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/commissions");
  revalidatePath("/app/payroll");
  return { error: null, created: Number(data ?? 0) };
}

const tiLeSchema = z.object({
  jobType: z.enum(["service", "product", "package"]),
  /** Phần trăm, tối đa 2 chữ số thập phân — khớp `numeric(5,2)` của #180. */
  percent: z.number().min(0).max(100),
});

/**
 * Đặt tỉ lệ THEO LOẠI VIỆC (quyết định 1 của thẻ).
 *
 * Không có tham số `employeeId` ở đây, và đó là chủ đích: tỉ lệ theo người là
 * thứ thẻ gạch đi ("theo người là sinh so bì và tranh cãi không dứt"). Thêm
 * tham số đó sau này = mở lại đúng cuộc tranh cãi ấy.
 *
 * Đổi tỉ lệ KHÔNG sửa ngược các khoản đã sinh: `commission_entries` chụp sẵn
 * `percent` lúc sinh (#180). Muốn áp mức mới cho tháng đang chạy thì bấm "tính
 * lại" — và những khoản đã có vẫn giữ nguyên mức cũ, đúng như sổ phải thế.
 */
export async function datTiLe(input: z.infer<typeof tiLeSchema>): Promise<ActionResult> {
  const parsed = tiLeSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };

  const { error, count } = await ctx.supabase
    .from("commission_rates")
    .upsert(
      {
        tenant_id: ctx.tenantId,
        job_type: parsed.data.jobType,
        percent: parsed.data.percent,
        updated_by: ctx.userId,
      },
      { onConflict: "tenant_id,job_type", count: "exact" },
    );
  if (error) return { error: loiGhi(error.message) };
  // RLS từ chối im lặng: `upsert` không lỗi nhưng không đổi dòng nào. Không bắt
  // ở đây thì quản lý bấm xong thấy "đã lưu" mà tỉ lệ giữ nguyên.
  if (count === 0) return { error: "forbidden" };

  revalidatePath("/app/commissions");
  return { error: null };
}
