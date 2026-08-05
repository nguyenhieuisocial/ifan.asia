import { cookies, headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * GHI NHỚ MÃ LỜI MỜI QUA LUỒNG ĐĂNG KÝ.
 *
 * Trước đây: người được mời chưa có tài khoản iFan bấm link mời → phải đăng ký →
 * đăng ký xong bị dẫn đi TẠO TIỆM MỚI, phải tự bấm lại đúng đường link lần nữa
 * mới vào đúng tiệm. Không mất dữ liệu nhưng là một bước thừa gây bối rối đúng
 * lúc người ta mới làm quen sản phẩm.
 *
 * Cách làm: nhớ mã lời mời trong MỘT COOKIE, rồi tự nhận lời mời ngay sau khi
 * tạo tài khoản xong.
 *
 * VÌ SAO LÀ COOKIE CHỨ KHÔNG PHẢI THAM SỐ URL:
 *   - `httpOnly` → mã không đọc được bằng JavaScript trong trang.
 *   - Không nằm trên thanh địa chỉ → người dùng không vô tình chụp màn hình /
 *     dán lại cho người khác, và mã không đi vào log truy cập của mọi trang
 *     trung gian (/signup, /login) như tham số `?invite=` sẽ gây ra.
 *   - `sameSite: 'lax'` → trang ngoài không ép trình duyệt gửi kèm trong POST.
 *   - Sống đúng 1 giờ và DÙNG MỘT LẦN (xoá ngay sau khi thử nhận, dù thành công
 *     hay thất bại) → không có mã lời mời nào nằm lại trong máy người dùng.
 *
 * Giới hạn ghế KHÔNG kiểm ở đây: `accept_invitation()` (migration #28) đánh dấu
 * lời mời 'accepted' để nhả ghế của chính nó rồi mới thêm thành viên, và cú thêm
 * đó đi qua trigger `tenant_members_seat_limit`. Nghĩa là tiệm hết chỗ TRONG LÚC
 * CHỜ (chủ tiệm hạ gói, gói bị tạm ngưng…) thì đúng lúc nhận sẽ bị chặn.
 */

const COOKIE = "ifan_invite";

/** Token do `inviteMember()` sinh: 32 byte ngẫu nhiên in hệ 16 (migration #28). */
const TOKEN_RE = /^[a-f0-9]{64}$/;

/** Đủ để đăng ký + xác nhận email, không đủ để nằm lại lâu trong máy. */
const MAX_AGE_S = 60 * 60;

/** Nhớ mã lời mời trước khi đưa người ta sang màn đăng ký/đăng nhập. */
export async function rememberPendingInvite(token: string): Promise<void> {
  if (!TOKEN_RE.test(token)) return;
  const proto = (await headers()).get("x-forwarded-proto");
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    // Chạy sau proxy HTTPS (Vercel) thì cookie chỉ đi trên kết nối mã hoá.
    secure: proto === "https",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

/** Bỏ mã đã nhớ mà không dùng tới. */
export async function forgetPendingInvite(): Promise<void> {
  const jar = await cookies();
  if (jar.has(COOKIE)) jar.delete(COOKIE);
}

/** Lỗi RPC `accept_invitation` → khoá dịch trong namespace "auth.errors". */
function inviteErrorKey(message: string): string {
  if (message.includes("invitation_used")) return "inviteUsed";
  if (message.includes("invitation_expired")) return "inviteExpired";
  if (message.includes("invitation_email_mismatch")) return "inviteEmailMismatch";
  if (message.includes("seat_limit_reached")) return "inviteSeatLimit";
  return "inviteFailed";
}

export type PendingInviteOutcome = {
  /** Đã vào tiệm được mời. */
  joined: boolean;
  /** Có mã nhớ sẵn nhưng nhận không thành — khoá dịch để màn sau nói lý do. */
  errorKey: string | null;
};

/**
 * Nhận lời mời đã ghi nhớ (nếu có). Mã bị XOÁ trong mọi trường hợp: lời mời là
 * dùng một lần, giữ lại chỉ tạo ra vòng lặp báo "lời mời đã được dùng".
 */
export async function consumePendingInvite(
  supabase: SupabaseClient,
): Promise<PendingInviteOutcome> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return { joined: false, errorKey: null };
  await forgetPendingInvite();
  if (!TOKEN_RE.test(token)) return { joined: false, errorKey: null };

  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (!error) return { joined: true, errorKey: null };
  return { joined: false, errorKey: inviteErrorKey(error.message) };
}
