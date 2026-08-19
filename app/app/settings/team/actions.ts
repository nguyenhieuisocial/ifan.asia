"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { createServiceClient } from "@/lib/supabase/service";
import { KPI_METRICS } from "@/lib/kpi";
import {
  generateTempPassword,
  staffSyntheticEmail,
} from "@/lib/auth/staff-accounts";
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
  const [member, { data: tenant }] = await Promise.all([
    getCurrentMembership(supabase, user.id),
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

const staffAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  phone: z.string().regex(/^0\d{9,10}$/, "phoneInvalid"),
  role: z.enum(INVITE_ROLES),
});

export type StaffAccountResult =
  // KHÔNG trả mã tiệm nữa: từ 11/08 nhân viên đăng nhập bằng SĐT + mật khẩu,
  // hệ thống tự tra ra tiệm (migration #68). Mã tiệm vẫn dùng NỘI BỘ để dựng
  // email tổng hợp, nhưng không còn là thứ người dùng phải biết.
  | { error: null; phone: string; tempPassword: string }
  | { error: string; phone?: undefined; tempPassword?: undefined };

/**
 * Tạo tài khoản nhân viên KHÔNG cần email (31.29) — chủ/quản trị viên gõ
 * tên + SĐT, hệ thống sinh mật khẩu tạm, hiện đúng MỘT LẦN cho chủ tiệm đưa
 * lại cho nhân viên. Khác `inviteMember`: không có bước "chờ nhận" — thành
 * viên có mặt ngay, chiếm ghế ngay.
 *
 * HAI BƯỚC không cùng một transaction (Admin API tạo user không phải SQL):
 * (1) admin.createUser() → trigger handle_new_user tự tạo profiles (migration
 * #62); (2) RPC staff_account_add_member() thêm vào tenant_members — RPC này
 * là chốt chặn ghế THẬT (trigger tầng DB, không phải hàng rào ở đây). Bước
 * (2) hỏng thì XÓA LẠI user vừa tạo ở bước (1) — không để lại tài khoản mồ
 * côi không thuộc tiệm nào mà vẫn đăng nhập được.
 */
export async function createStaffAccount(input: {
  displayName: string;
  phone: string;
  role: string;
}): Promise<StaffAccountResult> {
  const parsed = staffAccountSchema.safeParse(input);
  if (!parsed.success) {
    // Nút bấm ở màn đã khoá khi tên/SĐT rỗng — schema fail thực tế gần như
    // luôn là SĐT sai định dạng, báo đúng lý do thay vì "email chưa đúng"
    // (thông điệp invalidInput cũ là của luồng mời email).
    const phoneIssue = parsed.error.issues.some((i) => i.path[0] === "phone");
    return { error: phoneIssue ? "phoneInvalid" : "invalidInput" };
  }

  const ctx = await currentContext();
  if (!ctx) return { error: "notAuthenticated" };
  if (ctx.role !== "owner" && ctx.role !== "admin") return { error: "forbidden" };

  const { data: seatsRaw, error: seatsError } = await ctx.supabase.rpc("tenant_seats");
  if (seatsError) return { error: "failed" };
  const seats = seatsRaw as SeatInfo;
  if (seats.limit !== null && seats.used >= seats.limit) {
    return { error: "seatLimitReached" };
  }

  const { data: tenant } = await ctx.supabase
    .from("tenants")
    .select("slug")
    .eq("id", ctx.tenantId)
    .maybeSingle();
  const slug = tenant?.slug as string | undefined;
  if (!slug) return { error: "failed" };

  const admin = createServiceClient();
  if (!admin) return { error: "serviceUnavailable" };

  const email = staffSyntheticEmail(parsed.data.phone, slug);
  const tempPassword = generateTempPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      display_name: parsed.data.displayName,
      phone: parsed.data.phone,
      must_change_password: true,
    },
  });
  if (createErr || !created?.user) {
    if (createErr?.code === "email_exists" || /already.*registered/i.test(createErr?.message ?? "")) {
      return { error: "phoneTaken" };
    }
    return { error: "failed" };
  }

  const { error: memberErr } = await ctx.supabase.rpc("staff_account_add_member", {
    p_user_id: created.user.id,
    p_role: parsed.data.role,
  });
  if (memberErr) {
    // Dọn tài khoản vừa tạo — không để mồ côi (đăng nhập được nhưng không vào tiệm nào)
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { error: mapError(memberErr.message) };
  }

  revalidatePath("/app/settings/team");
  revalidatePath("/app/settings/billing");
  return { error: null, phone: parsed.data.phone, tempPassword };
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
 *
 * PHẢI CẮT LUÔN LIÊN KẾT BOT của họ trong tiệm này. Đổi mỗi `tenant_members` là
 * chưa xong việc: nếu tiệm bật bot Zalo, danh sách nhận bản tin hằng ngày lấy
 * thẳng từ `staff_channel_links` (không hỏi lại còn là người của tiệm không),
 * nên người đã nghỉ vẫn nhận số việc quá hạn KÈM tên việc, tên thương vụ, giờ
 * hẹn vào Zalo riêng — vô thời hạn. Chủ tiệm không tự cắt được: policy đọc/xoá
 * bảng đó chỉ cho CHÍNH CHỦ dòng (đo được: chủ tiệm xoá = 0 dòng, đọc = 0 dòng),
 * mà người đã nghỉ thì không vào app được nữa để tự gỡ ⇒ phải đi bằng service
 * role. Xoá có khoá `tenant_id`: người đó có thể còn làm ở tiệm khác.
 */
export async function removeMember(userId: string): Promise<SimpleResult> {
  if (!z.uuid().safeParse(userId).success) return { error: "invalidInput" };
  const ctx = await currentContext();
  if (!ctx) return { error: "notAuthenticated" };
  if (ctx.role !== "owner" && ctx.role !== "admin") return { error: "forbidden" };
  if (userId === ctx.userId) return { error: "cannotRemoveSelf" };

  // Hỏi TRƯỚC khi đụng gì: thiếu khoá dịch vụ thì không cắt được liên kết, mà gỡ
  // nửa vời (người rời tiệm nhưng bot vẫn gửi) đúng là con bệnh đang chữa.
  const admin = createServiceClient();
  if (!admin) return { error: "botUnlinkFailed" };

  const { error } = await ctx.supabase
    .from("tenant_members")
    .update({ status: "removed" })
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) return { error: mapError(error.message) };

  // Xoá KHÔNG điều kiện theo (tiệm này, người này): bấm Gỡ lần hai — khi dòng
  // thành viên đã `removed` nên câu trên không đổi dòng nào — vẫn cắt được liên
  // kết còn sót của lần trước hỏng giữa chừng.
  const { error: unlinkError } = await admin
    .from("staff_channel_links")
    .delete()
    .eq("tenant_id", ctx.tenantId)
    .eq("user_id", userId);
  if (unlinkError) return { error: "botUnlinkFailed" };

  revalidatePath("/app/settings/team");
  revalidatePath("/app/settings/billing");
  return { error: null };
}
