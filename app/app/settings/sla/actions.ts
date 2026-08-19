"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { SLA_MAX_MINUTES } from "./constants";

/**
 * Kết quả action: `error` là KHÓA lỗi (không phải câu tiếng Việt) — màn hình tra
 * sang messages `sla.toasts.*`, giữ nguyên quy ước của setSlaPolicyActive.
 */
type ActionResult = { error: string | null };

/** Chỉ chủ tài khoản / quản trị viên đụng được chính sách (khớp RLS sla_policies_manage). */
const MANAGE_ROLES = ["owner", "admin"];

type Manager = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

/** Auth + vai trò dùng chung (defense in depth — RLS migration #17 vẫn là lưới cuối). */
async function requireManager(): Promise<Manager | { errorKey: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errorKey: "not_authenticated" };

  const member = await getCurrentMembership(supabase, user.id);
  if (!MANAGE_ROLES.includes(member?.role ?? "")) return { errorKey: "forbidden" };

  return { supabase, userId: user.id };
}

/**
 * Bật/tắt một chính sách cam kết phản hồi.
 * RLS `sla_policies_manage` (migration #17) là lưới cuối: chỉ owner/admin của
 * đúng tenant ghi được; action vẫn tự kiểm vai trò trước.
 */
export async function setSlaPolicyActive(
  policyId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const parsed = z
    .object({ policyId: z.uuid(), isActive: z.boolean() })
    .safeParse({ policyId, isActive });
  if (!parsed.success) return { error: "invalid_input" };

  const m = await requireManager();
  if ("errorKey" in m) return { error: m.errorKey };

  const { data: daDoi, error } = await m.supabase
    .from("sla_policies")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.policyId)
    .select("id");
  if (error) return { error: "failed" };
  // Cùng khuôn `setSlaPolicyThresholds` ngay dưới, và vì đúng một lý do: đo
  // 20/08, quản lý / nhân viên / vai Chỉ xem ĐỌC được luật SLA (1 dòng) nhưng
  // `sla_policies_manage` chỉ mở cho owner/admin ⇒ bật/tắt ra 0 dòng, KHÔNG
  // lỗi. Người bấm tưởng đã tắt cảnh báo trễ hạn, mà nó vẫn đang chạy.
  if (!daDoi?.length) return { error: "forbidden" };

  revalidatePath("/app/settings/sla");
  return { error: null };
}

// SLA_MAX_MINUTES imported from ./constants (export non-async bị cấm trong "use server")

const thresholdsSchema = z
  .object({
    policyId: z.uuid(),
    warnAfterMinutes: z
      .number()
      .int("invalid_input")
      .min(1, "warn_too_small")
      .max(SLA_MAX_MINUTES, "too_large"),
    breachAfterMinutes: z
      .number()
      .int("invalid_input")
      .min(1, "breach_too_small")
      .max(SLA_MAX_MINUTES, "too_large"),
    // 'owner' | 'manager' | uuid của một thành viên cụ thể (check constraint DB)
    escalateTo: z.union([z.literal("owner"), z.literal("manager"), z.uuid()]),
  })
  // Ràng buộc DB `sla_policies_order` — chặn ở đây để người dùng thấy lời giải
  // thích tiếng Việt, không phải lỗi kỹ thuật của Postgres
  .refine((v) => v.breachAfterMinutes > v.warnAfterMinutes, {
    message: "breach_not_after_warn",
  });

export type SlaThresholdInput = {
  warnAfterMinutes: number;
  breachAfterMinutes: number;
  escalateTo: string;
};

/** Sửa mốc nhắc / mốc vi phạm / người leo thang của một chính sách. */
export async function updateSlaPolicyThresholds(
  policyId: string,
  input: SlaThresholdInput,
): Promise<ActionResult> {
  const parsed = thresholdsSchema.safeParse({ policyId, ...input });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  const m = await requireManager();
  if ("errorKey" in m) return { error: m.errorKey };

  // Người leo thang chỉ định đích danh phải còn là thành viên hoạt động của tenant
  // (RLS tenant_members chỉ trả người cùng tenant) — không để cảnh báo rò ra ngoài.
  if (parsed.data.escalateTo !== "owner" && parsed.data.escalateTo !== "manager") {
    const { data: target } = await m.supabase
      .from("tenant_members")
      .select("user_id")
      .eq("user_id", parsed.data.escalateTo)
      .eq("status", "active")
      .maybeSingle();
    if (!target) return { error: "escalate_not_member" };
  }

  const { data, error } = await m.supabase
    .from("sla_policies")
    .update({
      warn_after_minutes: parsed.data.warnAfterMinutes,
      breach_after_minutes: parsed.data.breachAfterMinutes,
      escalate_to: parsed.data.escalateTo,
    })
    .eq("id", parsed.data.policyId)
    .select("id");
  if (error) return { error: "failed" };
  // RLS chặn thì UPDATE không báo lỗi, chỉ không chạm dòng nào → nói rõ là không đủ quyền
  if (!data || data.length === 0) return { error: "forbidden" };

  revalidatePath("/app/settings/sla");
  return { error: null };
}
