"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { INDUSTRIES } from "@/lib/industries";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import {
  consumePendingInvite,
  forgetPendingInvite,
  type PendingInviteOutcome,
} from "@/app/invite/pending";

/** Chống brute-force/spam đăng nhập-đăng ký: 10 lượt/phút mỗi IP (bộ đếm trong DB, migration #25). */
async function authRateLimited(scope: "signin" | "signup"): Promise<boolean> {
  const ip = clientIpFrom(await headers());
  const { allowed } = await rateLimit(`${scope}:ip:${ip}`, 10, 60);
  return !allowed;
}

// Message zod = key trong messages/<locale>.json namespace "auth.errors"
const credentialsSchema = z.object({
  email: z.email("emailInvalid"),
  password: z.string().min(8, "passwordMin"),
});

const signUpSchema = credentialsSchema.extend({
  displayName: z.string().trim().max(80, "displayNameTooLong").optional(),
});

const workspaceSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120, "nameTooLong"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/, "slugInvalid"),
  industry: z.enum(INDUSTRIES, "industryRequired"),
});

/** ?error= luôn mang KEY trong namespace "auth.errors" — page dịch qua whitelist, không bao giờ render chuỗi thô. */
function fail(path: string, errorKey: string): never {
  redirect(`${path}?error=${encodeURIComponent(errorKey)}`);
}

/**
 * Đi tiếp sau khi đã thử nhận lời mời ghi nhớ từ đường link mời:
 *   nhận được  → vào THẲNG tiệm đã mời (bỏ qua bước tạo tiệm mới);
 *   không nhận được → về màn tạo tiệm, kèm lý do bằng tiếng người.
 *
 * `refreshSession` lấy token mới mang claim tenant_id — cùng lý do như
 * `createWorkspace` (ADR-0001 #11).
 */
async function afterInvite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invite: PendingInviteOutcome,
): Promise<never> {
  if (invite.joined) {
    await supabase.auth.refreshSession();
    redirect("/app");
  }
  if (invite.errorKey) fail("/onboarding", invite.errorKey);
  redirect("/onboarding");
}

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName") ?? undefined,
  });
  if (!parsed.success) fail("/signup", parsed.error.issues[0].message);
  if (await authRateLimited("signup")) fail("/signup", "tryLater");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    // Không leak error.message của Supabase — map về key dịch được
    const key =
      error.code === "user_already_exists" ||
      /already registered/i.test(error.message)
        ? "emailTaken"
        : error.status === 429 || /rate limit/i.test(error.message)
          ? "tryLater"
          : "signUpFailed";
    fail("/signup", key);
  }

  // Email đã có tài khoản: Supabase trả "user giả" (identities rỗng, không session,
  // không error) để chống dò email — báo emailTaken thay vì giả vờ đã gửi mail
  if (!data.session && data.user && (data.user.identities?.length ?? 0) === 0) {
    fail("/signup", "emailTaken");
  }

  // Nếu project tắt email confirmation thì có session ngay → vào onboarding
  if (data.session) {
    // Tên hiển thị tùy chọn — trống thì bỏ qua, trigger DB đã đặt mặc định từ email
    const name = parsed.data.displayName;
    if (name && data.user) {
      await supabase
        .from("profiles")
        .upsert({ user_id: data.user.id, display_name: name });
    }
    // Đăng ký từ đường link mời: tài khoản vừa tạo chắc chắn chưa thuộc tiệm nào
    // nên nhận lời mời ngay tại đây là an toàn.
    await afterInvite(supabase, await consumePendingInvite(supabase));
  }
  // Còn chờ xác nhận email: mã lời mời vẫn nằm trong cookie, xác nhận xong đăng
  // nhập là nhận được — không phải bấm lại đường link.
  redirect("/signup?sent=1");
}

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) fail("/login", parsed.error.issues[0].message);
  if (await authRateLimited("signin")) fail("/login", "tryLater");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) fail("/login", "signInFailed");

  // Có tenant chưa? (claim chỉ có sau refresh — kiểm tra qua bảng)
  const { data: member } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();

  // ĐÃ có tiệm rồi thì KHÔNG tự nhận thêm lời mời sau lưng người ta — bỏ mã đã
  // nhớ, họ tự bấm lại đường link khi muốn (màn nhận lời mời nói rõ từng trường
  // hợp). Chưa có tiệm mới là người được mời thật sự đang cần vào tiệm.
  if (member) {
    await forgetPendingInvite();
    redirect("/app");
  }
  await afterInvite(supabase, await consumePendingInvite(supabase));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Địa chỉ rút gọn còn trống không? Trả lời NGAY lúc gõ, thay vì để chủ tiệm
 * bấm gửi rồi mới bị đá về kèm lỗi.
 *
 * Đọc qua RPC `slug_available` (security definer, migration #32) vì bảng
 * `tenants` bị RLS chặn: người mới đăng ký chưa thuộc tenant nào nên không đọc
 * được hàng nào để tự so. Hàm chỉ trả 4 nhãn cố định, không lộ tên tiệm nào.
 */
export async function checkWorkspaceSlug(
  slug: string,
): Promise<{ status: "ok" | "taken" | "reserved" | "invalid" }> {
  const parsed = z.string().trim().toLowerCase().max(60).safeParse(slug);
  if (!parsed.success) return { status: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "invalid" };

  // Gõ phím nào cũng gọi → nới hơn các thao tác ghi, vẫn chặn dò hàng loạt
  const { allowed } = await rateLimit(`slug-check:user:${user.id}`, 60, 60);
  if (!allowed) return { status: "invalid" };

  const { data, error } = await supabase.rpc("slug_available", {
    p_slug: parsed.data,
  });
  if (error) return { status: "invalid" };
  return { status: data === "ok" || data === "taken" || data === "reserved" ? data : "invalid" };
}

export async function createWorkspace(formData: FormData) {
  const parsed = workspaceSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    industry: formData.get("industry"),
  });
  if (!parsed.success) fail("/onboarding", parsed.error.issues[0].message);

  const supabase = await createClient();

  // Chống tạo tenant kép: đã là thành viên tenant nào thì về thẳng /app
  const { data: existing } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (existing) redirect("/app");

  const { error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });
  if (error) {
    const key = /slug_reserved/.test(error.message)
      ? "slugReserved"
      : /duplicate|unique/i.test(error.message)
        ? "slugTaken"
        : "workspaceFailed";
    fail("/onboarding", key);
  }

  // BẮT BUỘC: claim tenant_id chỉ có trong token MỚI (ADR-0001 #11)
  await supabase.auth.refreshSession();

  // Tiệm mẫu theo ngành (migration #12): seed tag + câu trả lời nhanh theo
  // ngành đã chọn. Gọi SAU refreshSession vì hàm DB đọc tenant từ claim JWT.
  // Lỗi seed KHÔNG chặn onboarding: industry còn null → dashboard hiện card
  // "Chọn ngành" cho owner/admin bấm lại (đường retry tự nhiên, không kẹt).
  await supabase.rpc("seed_industry_template", {
    p_industry: parsed.data.industry,
  });
  redirect("/app");
}
