"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";

export type SaveCapsResult = { error: string | null };

/**
 * Khớp ĐÚNG check constraint của bảng `discount_caps` (migration #165):
 * mỗi mức 0–100, và trần vai cao KHÔNG được thấp hơn vai thấp — cấu hình ngược
 * làm quản lý phải xin duyệt cho mức mà nhân viên tự quyết được, không ai hiểu.
 * Kiểm ở đây để người dùng nhận câu tiếng Việt thay vì lỗi ràng buộc thô.
 */
const capsSchema = z
  .object({
    staffMaxPct: z.number().int().min(0).max(100),
    managerMaxPct: z.number().int().min(0).max(100),
    adminMaxPct: z.number().int().min(0).max(100),
  })
  .refine((v) => v.staffMaxPct <= v.managerMaxPct && v.managerMaxPct <= v.adminMaxPct, {
    path: ["staffMaxPct"],
  });

export type DiscountCapsInput = z.infer<typeof capsSchema>;

/**
 * Lưu trần. Dùng `upsert` vì tiệm chưa khai thì CHƯA CÓ dòng nào — chính chỗ
 * "chưa có dòng" là thứ màn hình đang cảnh báo, nên lần lưu đầu tiên vừa đặt số
 * vừa tắt cảnh báo.
 *
 * RLS `discount_caps_manage` là lưới cuối; action vẫn kiểm vai trước (cùng khuôn
 * settings/tiers, settings/sla) — hai lớp, không phải một.
 */
export async function saveDiscountCaps(input: DiscountCapsInput): Promise<SaveCapsResult> {
  const parsed = capsSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const member = await getCurrentMembership(supabase, user.id);
  if (member?.role !== "owner" && member?.role !== "admin") return { error: "forbidden" };

  // `discount_caps.tenant_id` là khoá chính, KHÔNG có default và KHÔNG trigger
  // nào điền hộ — RLS `with check` chỉ chặn SAI tiệm chứ không tự điền tiệm
  // ĐÚNG. Cùng khuôn `app/app/loyalty/actions.ts` (RLS đã lọc nên `tenants`
  // chỉ trả về đúng tiệm đang chọn).
  const { data: tenantRow } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenantRow) return { error: "no_tenant" };

  const { error } = await supabase.from("discount_caps").upsert(
    {
      tenant_id: tenantRow.id,
      staff_max_pct: parsed.data.staffMaxPct,
      manager_max_pct: parsed.data.managerMaxPct,
      admin_max_pct: parsed.data.adminMaxPct,
    },
    { onConflict: "tenant_id" },
  );
  if (error) return { error: "failed" };

  revalidatePath("/app/settings/discount-caps");
  revalidatePath("/app/orders");
  return { error: null };
}
