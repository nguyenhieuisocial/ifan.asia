"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRecoverySession } from "@/lib/auth/recovery-session";
import { INDUSTRIES } from "@/lib/industries";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import {
  consumePendingInvite,
  forgetPendingInvite,
  type PendingInviteOutcome,
} from "@/app/invite/pending";

/**
 * Chống brute-force/spam đăng nhập-đăng ký (bộ đếm trong DB, migration #25).
 *
 * HAI khóa, không phải một:
 * - theo IP (10/phút) — chặn một máy thử nhiều tài khoản
 * - theo EMAIL (10/5 phút) — chặn NHIỀU MÁY cùng dò MỘT tài khoản. Chỉ đếm
 *   theo IP thì kẻ dò rải qua nhiều IP là lọt hết, mà đó mới là cách dò thật.
 *   Email hạ chữ thường để "A@x.com" và "a@x.com" chung một bộ đếm.
 */
async function authRateLimited(
  scope: "signin" | "signup" | "reset" | "password",
  email?: string,
): Promise<boolean> {
  const ip = clientIpFrom(await headers());
  const byIp = await rateLimit(`${scope}:ip:${ip}`, 10, 60);
  if (!byIp.allowed) return true;
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  const byEmail = await rateLimit(`${scope}:email:${normalized}`, 10, 300);
  return !byEmail.allowed;
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
 * Màn nhà sau khi xác thực xong — "Hôm nay", KHÔNG phải Tổng quan.
 *
 * Mở app buổi sáng thì việc đầu tiên là biết hôm nay gọi ai, ai đang chờ trả lời;
 * Tổng quan là màn ĐỌC LẠI cuối ngày (cùng lý do đã ghi ở MOBILE_NAV_KEYS trong
 * app/app/sidebar-nav.tsx). Khai MỘT chỗ để mọi cửa vào không lệch nhau khi thêm
 * cửa mới — trước đây mỗi cửa tự viết "/app" nên sửa một chỗ là sót chỗ khác.
 *
 * Ngoại lệ có chủ đích: tiệm VỪA TẠO vẫn về "/app" vì thẻ chọn ngành (dựng tiệm
 * mẫu) nằm ở đó.
 */
const AFTER_AUTH_HOME = "/app/today";

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
    redirect(AFTER_AUTH_HOME);
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
  if (await authRateLimited("signup", parsed.data.email)) fail("/signup", "tryLater");

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
  if (await authRateLimited("signin", parsed.data.email)) fail("/login", "tryLater");

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
    redirect(AFTER_AUTH_HOME);
  }
  await afterInvite(supabase, await consumePendingInvite(supabase));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const emailOnlySchema = z.object({ email: z.email("emailInvalid") });

const newPasswordSchema = z
  .object({
    password: z.string().min(8, "passwordMin"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "passwordMismatch" });

const changePasswordSchema = z
  .object({
    current: z.string().min(1, "currentRequired"),
    password: z.string().min(8, "passwordMin"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "passwordMismatch" });

/**
 * Gửi thư đặt lại mật khẩu.
 *
 * LUÔN báo "đã gửi" kể cả khi email không có tài khoản. Báo "email không tồn
 * tại" là biến màn này thành máy dò danh sách khách hàng của iFan: gõ 1000 email
 * là biết tiệm nào đang dùng. Người quên mật khẩu thật vẫn nhận được thư.
 *
 * Link trong thư về /auth/confirm, cửa này nhận CẢ HAI kiểu mã (xem chú thích ở
 * đó) vì Supabase gói miễn phí chưa cho thay mẫu thư.
 */
export async function requestPasswordReset(formData: FormData) {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) fail("/forgot-password", parsed.error.issues[0].message);
  if (await authRateLimited("reset", parsed.data.email))
    fail("/forgot-password", "tryLater");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${proto}://${host}/auth/confirm`,
  });
  redirect("/forgot-password?sent=1");
}

/**
 * Đặt mật khẩu mới sau khi bấm link trong thư. Phiên tạm đã được /auth/confirm
 * tạo trước đó — không có phiên nghĩa là link hỏng/hết hạn.
 */
export async function resetPassword(formData: FormData) {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) fail("/reset-password", parsed.error.issues[0].message);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) fail("/forgot-password", "linkInvalid");
  // Chốt chặn THẬT nằm ở đây, không phải ở màn: chặn ở màn thôi thì gọi thẳng
  // action là qua mặt được. Xem lib/auth/recovery-session.ts.
  if (!(await isRecoverySession(supabase))) redirect("/app/settings/account");

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) fail("/reset-password", "resetFailed");

  // Đá mọi thiết bị KHÁC ra: người đặt lại mật khẩu thường vì nghi bị lộ, để
  // phiên cũ sống tiếp là vô hiệu hóa chính lý do họ đặt lại.
  await supabase.auth.signOut({ scope: "others" });
  redirect(AFTER_AUTH_HOME);
}

/**
 * Đổi mật khẩu khi đang đăng nhập. BẮT BUỘC nhập mật khẩu hiện tại — nếu không,
 * ai mượn được máy đang mở iFan là chiếm luôn tài khoản.
 */
export async function updatePassword(formData: FormData) {
  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success)
    fail("/app/settings/account", parsed.error.issues[0].message);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  if (await authRateLimited("password", user.email))
    fail("/app/settings/account", "tryLater");

  // Xác minh lại bằng chính mật khẩu hiện tại (cùng tài khoản nên phiên không đổi chủ)
  const { error: reauth } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  });
  if (reauth) fail("/app/settings/account", "currentWrong");

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) fail("/app/settings/account", "resetFailed");

  await supabase.auth.signOut({ scope: "others" });
  redirect("/app/settings/account?done=1");
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

  // Chống tạo tenant kép. Chốt THẬT nằm ở `create_tenant` trong DB (migration
  // #41) — hỏi lại đúng chốt đó qua `can_create_tenant()` thay vì chép luật lần
  // hai ở web, nếu không thì tài khoản được founder nâng hạn mức sẽ bị chính
  // dòng này chặn trước khi kịp gọi RPC.
  const { data: canCreate } = await supabase.rpc("can_create_tenant");
  if (canCreate === false) redirect("/app");

  const { error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });
  if (error) {
    const key = /slug_reserved/.test(error.message)
      ? "slugReserved"
      : /duplicate|unique/i.test(error.message)
        ? "slugTaken"
        : /tenant_limit_reached/.test(error.message)
          ? "tenantLimitReached"
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
