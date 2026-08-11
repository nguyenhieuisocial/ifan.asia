"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { KPI_METRICS } from "@/lib/kpi";
import type { SeatInfo } from "./types";

export type InviteResult =
  | { error: null; link: string }
  | { error: string; link?: undefined };

export type SimpleResult = { error: string | null };

/** Vai mời được — KHÔNG có 'owner': chuyển quyền chủ tiệm là việc khác. */
const INVITE_ROLES = ["admin", "manager", "staff", "viewer"] as const;

const inviteSchema = z.object({
  email: z.email().max(160),
  role: z.enum(INVITE_ROLES),
});

/**
 * Lỗi Postgres → khoá dịch. `seat_limit_reached` do trigger tầng DB ném ra
 * (migration #28) — là lưới cuối khi có ai gọi thẳng API bỏ qua kiểm ở đây.
 */
function mapError(message: string): string {
  if (message.includes("seat_limit_reached")) return "seatLimitReached";
  if (message.includes("last_owner_cannot_be_removed")) return "lastOwner";
  return "failed";
}

/** Vai + tenant của người đang đăng nhập; null nếu chưa đăng nhập/chưa có tiệm. */
async function currentContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: member }, { data: tenant }] = await Promise.all([
    supabase.from("tenant_members").select("role").eq("user_id", user.id).maybeSingle(),
    supabase.from("tenants").select("id").maybeSingle(),
  ]);
  if (!member || !tenant) return null;
  return { supabase, userId: user.id, role: member.role as string, tenantId: tenant.id as string };
}

/**
 * Mời thêm nhân viên.
 *
 * HAI TẦNG CHẶN GIỚI HẠN GÓI:
 *  1) ở đây — hỏi `tenant_seats()` trước để báo bằng tiếng người và không tạo
 *     lời mời thừa;
 *  2) trigger `invitations_seat_limit` trong DB — chặn thật, kể cả khi ai đó
 *     gọi thẳng PostgREST bỏ qua toàn bộ mã web.
 *
 * Chưa nối dịch vụ gửi email: hàm trả về ĐƯỜNG LINK để chủ tiệm tự gửi
 * (Zalo/tin nhắn). Token gốc chỉ xuất hiện đúng một lần ở đây; DB giữ SHA-256.
 */
export async function inviteMember(input: {
  email: string;
  role: string;
}): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse({
    email: String(input.email ?? "").trim().toLowerCase(),
    role: input.role,
  });
  if (!parsed.success) return { error: "invalidInput" };

  const ctx = await currentContext();
  if (!ctx) return { error: "notAuthenticated" };
  if (ctx.role !== "owner" && ctx.role !== "admin") return { error: "forbidden" };

  const { data: seatsRaw, error: seatsError } = await ctx.supabase.rpc("tenant_seats");
  if (seatsError) return { error: "failed" };
  const seats = seatsRaw as SeatInfo;
  if (seats.limit !== null && seats.used >= seats.limit) {
    return { error: "seatLimitReached" };
  }

  const { count } = await ctx.supabase
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("email", parsed.data.email)
    .eq("status", "pending");
  if (count && count > 0) return { error: "alreadyInvited" };

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { error } = await ctx.supabase.from("invitations").insert({
    tenant_id: ctx.tenantId,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: tokenHash,
    invited_by: ctx.userId,
  });
  if (error) return { error: mapError(error.message) };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  revalidatePath("/app/settings/team");
  revalidatePath("/app/settings/billing");
  return { error: null, link: `${proto}://${host}/invite/${token}` };
}

/** Thu hồi lời mời chưa dùng — ghế được nhả ra ngay. */
export async function revokeInvite(id: string): Promise<SimpleResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalidInput" };
  const ctx = await currentContext();
  if (!ctx) return { error: "notAuthenticated" };
  if (ctx.role !== "owner" && ctx.role !== "admin") return { error: "forbidden" };

  const { error } = await ctx.supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { error: mapError(error.message) };

  revalidatePath("/app/settings/team");
  revalidatePath("/app/settings/billing");
  return { error: null };
}

/* ---------- KPI mục tiêu tháng (migration #59) ---------- */

/** Đặt/sửa/xóa mục tiêu = owner/admin/manager (hồ sơ mục 9 — khớp RLS #59). */
const KPI_MANAGE_ROLES = ["owner", "admin", "manager"];

const kpiTargetSchema = z.object({
  userId: z.uuid().nullable(), // null = mục tiêu cả tiệm
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  metric: z.enum(KPI_METRICS),
});

/**
 * Đặt/sửa một mục tiêu — đi qua RPC kpi_set_target (SECURITY INVOKER, #59):
 * "chưa có thì thêm, có rồi thì sửa" trong MỘT lệnh, bấm lại vô hại; giá trị
 * không đổi thì DB không touch updated_at (khỏi hiện oan "đã đổi ngày N").
 */
export async function setKpiTarget(input: {
  userId: string | null;
  month: string;
  metric: string;
  target: number;
}): Promise<SimpleResult> {
  const parsed = kpiTargetSchema.safeParse(input);
  const target = Math.round(Number(input.target));
  if (!parsed.success || !Number.isFinite(target) || target <= 0) {
    return { error: "invalidInput" };
  }

  const ctx = await currentContext();
  if (!ctx) return { error: "notAuthenticated" };
  if (!KPI_MANAGE_ROLES.includes(ctx.role)) return { error: "forbidden" };

  const { error } = await ctx.supabase.rpc("kpi_set_target", {
    p_user_id: parsed.data.userId,
    p_month: parsed.data.month,
    p_metric: parsed.data.metric,
    p_target: target,
  });
  if (error) return { error: "failed" };

  revalidatePath("/app/settings/team");
  return { error: null };
}

/**
 * Tắt một chỉ số = XÓA dòng mục tiêu (không phải đặt 0). Xóa dòng không có
 * sẵn cũng coi là xong — bấm lại vô hại.
 */
export async function clearKpiTarget(input: {
  userId: string | null;
  month: string;
  metric: string;
}): Promise<SimpleResult> {
  const parsed = kpiTargetSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const ctx = await currentContext();
  if (!ctx) return { error: "notAuthenticated" };
  if (!KPI_MANAGE_ROLES.includes(ctx.role)) return { error: "forbidden" };

  let del = ctx.supabase
    .from("kpi_targets")
    .delete()
    .eq("month", parsed.data.month)
    .eq("metric", parsed.data.metric);
  del =
    parsed.data.userId === null
      ? del.is("user_id", null)
      : del.eq("user_id", parsed.data.userId);
  const { error } = await del;
  if (error) return { error: "failed" };

  revalidatePath("/app/settings/team");
  return { error: null };
}

/**
 * Gỡ một người khỏi tiệm — đánh dấu `removed`, KHÔNG xoá dữ liệu họ đã làm.
 * Trigger `tenant_members_owner_guard` (#2) chặn gỡ chủ tiệm cuối cùng.
 */
export async function removeMember(userId: string): Promise<SimpleResult> {
  if (!z.uuid().safeParse(userId).success) return { error: "invalidInput" };
  const ctx = await currentContext();
  if (!ctx) return { error: "notAuthenticated" };
  if (ctx.role !== "owner" && ctx.role !== "admin") return { error: "forbidden" };
  if (userId === ctx.userId) return { error: "cannotRemoveSelf" };

  const { error } = await ctx.supabase
    .from("tenant_members")
    .update({ status: "removed" })
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) return { error: mapError(error.message) };

  revalidatePath("/app/settings/team");
  revalidatePath("/app/settings/billing");
  return { error: null };
}
