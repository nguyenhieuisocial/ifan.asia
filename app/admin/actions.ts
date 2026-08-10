"use server";

import { revalidatePath } from "next/cache";
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

  await supabase
    .from("system_alerts")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", alertId)
    .is("acknowledged_at", null);

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
