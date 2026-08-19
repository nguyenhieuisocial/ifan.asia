"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Ghi nhận (đóng) một cảnh báo hệ thống trên bảng điều hành.
 *
 * Defense in depth: layout /admin đã chặn 404, nhưng server action gọi được
 * trực tiếp qua POST nên kiểm lại `is_platform_admin()` ở đây; RLS trên
 * `system_alerts` (policy system_alerts_ack, migration #44) vẫn là lưới cuối.
 *
 * Chỉ đóng cảnh báo ĐANG MỞ (`acknowledged_at is null`) — job hỏng tiếp sau khi
 * đóng sẽ mở cảnh báo mới nhờ unique partial index, không ghi đè lịch sử cũ.
 */
export async function acknowledgeSystemAlert(alertId: number): Promise<void> {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin !== true) return;

  // Hàm trả `void` nên KHÔNG có đường nào báo hỏng ra màn hình. Trước đây nó
  // còn không đọc cả `error` ⇒ policy bị thu hồi hay CSDL trục trặc thì cảnh
  // báo vẫn nằm nguyên mà không một dòng nào ghi lại.
  //
  // Ở đây 0 dòng KHÔNG phải dấu hiệu hỏng: câu lệnh lọc thêm
  // `acknowledged_at is null`, nên 0 dòng thường chỉ nghĩa là cảnh báo đã được
  // người khác đóng trước — chuyện bình thường, không cần kêu. Cái phải kêu là
  // `error`. Ghi nhật ký máy chủ là mức đúng cho việc này: người dùng không
  // thấy khác gì (nên không cần thẻ design), nhưng lần sau có sự cố thì có vết
  // để lần. Đo 20/08, việc #193.
  const { error } = await supabase
    .from("system_alerts")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", alertId)
    .is("acknowledged_at", null);
  if (error) console.error("[admin] không đóng được cảnh báo", alertId, error.message);

  revalidatePath("/admin");
}

const paymentSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(40),
  amount: z.number().int().positive(),
  ref: z.string().trim().min(1).max(100),
});

export type RecordPaymentResult =
  | {
      error: null;
      outcome: "applied" | "duplicate" | "underpaid" | "alreadyPaid";
      invoice: string;
      amountDue?: number;
    }
  | { error: string };

/** Ánh xạ lỗi RPC sang khoá dịch — không ném chuỗi Postgres ra giao diện. */
function mapPaymentError(message: string): string {
  if (message.includes("forbidden")) return "forbidden";
  if (message.includes("invoice_not_found")) return "notFound";
  return "failed";
}

/**
 * Founder bấm "Đã nhận tiền" sau khi thấy tiền về tài khoản.
 *
 * Defense in depth như acknowledgeSystemAlert: layout /admin đã chặn 404, nhưng
 * server action gọi được trực tiếp qua POST nên kiểm lại `is_platform_admin()`
 * ở đây; RPC `admin_record_payment` (migration #48) kiểm lần nữa ở dòng đầu.
 *
 * Logic tiền nằm trọn trong `record_subscription_payment` (#27) — ĐÃ idempotent:
 * bấm trùng số biên lai trả `duplicate`, không ghi 2 lần. Action chỉ dịch jsonb
 * trả về thành kết quả cho UI nói bằng lời dễ hiểu.
 */
export async function recordManualPayment(input: {
  invoiceNumber: string;
  amount: number;
  ref: string;
}): Promise<RecordPaymentResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin !== true) return { error: "forbidden" };

  const { data, error } = await supabase.rpc("admin_record_payment", {
    p_invoice_number: parsed.data.invoiceNumber,
    p_amount: parsed.data.amount,
    p_ref: parsed.data.ref,
  });
  if (error) return { error: mapPaymentError(error.message) };

  const res = data as {
    applied?: boolean;
    duplicate?: boolean;
    underpaid?: boolean;
    already_paid?: boolean;
    invoice: string;
    amount_due?: number;
  };
  revalidatePath("/admin");
  return {
    error: null,
    outcome: res.applied
      ? "applied"
      : res.duplicate
        ? "duplicate"
        : res.underpaid
          ? "underpaid"
          : "alreadyPaid",
    invoice: res.invoice,
    amountDue: res.amount_due != null ? Number(res.amount_due) : undefined,
  };
}

const openSessionSchema = z.object({
  tenantId: z.uuid(),
  reason: z.string().trim().min(10).max(500),
});

/** Ánh xạ lỗi RPC open_support_session sang khoá dịch — không ném chuỗi Postgres ra giao diện. */
function mapSupportError(message: string): string {
  if (message.includes("forbidden")) return "forbidden";
  if (message.includes("reason_required")) return "reasonRequired";
  if (message.includes("invalid_duration")) return "invalidDuration";
  if (message.includes("tenant_not_found")) return "tenantNotFound";
  return "failed";
}

/**
 * Founder bấm "Bắt đầu xem (chỉ đọc)" (thẻ design man-ho-tro-chi-doc.html).
 * Defense in depth như 2 action trên: layout /admin đã chặn 404, nhưng
 * open_support_session (migration #77) tự kiểm is_platform_admin() lần nữa
 * ở dòng đầu — đây LÀ cửa ghi xuyên-tenant duy nhất được phép (ADR-0006).
 *
 * BẮT BUỘC switch_tenant + refreshSession (cùng lý do ADR-0001 #11 đã ghi ở
 * switchTenant()): claim tenant_id/role chỉ có trong token MỚI, và
 * open_support_session() không tự đổi profiles.active_tenant_id — nếu không
 * gọi, hook chọn nhầm tenant khi platform admin lỡ có sẵn thành viên tiệm khác.
 */
export async function openSupportSession(input: {
  tenantId: string;
  reason: string;
}): Promise<{ error: string | null }> {
  const parsed = openSessionSchema.safeParse(input);
  if (!parsed.success) return { error: "reasonRequired" };

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin !== true) return { error: "forbidden" };

  const { data: sessionId, error } = await supabase.rpc("open_support_session", {
    p_tenant_id: parsed.data.tenantId,
    p_reason: parsed.data.reason,
    p_minutes: 60,
  });
  if (error || !sessionId) return { error: mapSupportError(error?.message ?? "") };

  // Phiên hỗ trợ đã MỞ nhưng đổi tiệm hỏng thì quản trị viên vẫn đang ở tiệm của
  // chính mình — nhìn dữ liệu của mình mà tưởng đang xem tiệm của khách, rồi
  // "sửa giúp" nhầm chỗ. Phải báo, không được lẳng lặng chuyển màn.
  const { error: loiDoiTiem } = await supabase.rpc("switch_tenant", {
    p_tenant_id: parsed.data.tenantId,
  });
  if (loiDoiTiem) {
    console.error("[admin] mở phiên hỗ trợ xong nhưng không đổi được tiệm:", loiDoiTiem.message);
    return { error: "switchFailed" };
  }
  await supabase.auth.refreshSession();
  redirect("/app/today");
}
