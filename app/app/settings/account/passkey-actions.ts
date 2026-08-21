"use server";

import { z } from "zod";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import {
  RP_ID,
  RP_ORIGIN,
  RP_TEN,
  catThuThach,
  khoDichVu,
  layVaXoaThuThach,
  sanSang,
} from "@/lib/passkey/may-chu";

/**
 * ĐĂNG KÝ PASSKEY cho thiết bị đang dùng.
 *
 * Người dùng PHẢI đang đăng nhập — đây là "thêm một cách đăng nhập cho tài
 * khoản của tôi", không phải "tạo tài khoản". Không có bước đăng nhập trước
 * thì bất kỳ ai cũng gắn được vân tay của mình vào một tài khoản bất kỳ.
 */

export async function batDauDangKyPasskey(): Promise<{
  error: string | null;
  tuyChon?: unknown;
}> {
  if (!sanSang()) return { error: "serverNotReady" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated" };

  const db = khoDichVu();
  const { data: daCo } = await db
    .from("passkeys")
    .select("credential_id")
    .eq("user_id", user.id);

  const tuyChon = await generateRegistrationOptions({
    rpName: RP_TEN,
    rpID: RP_ID,
    userName: user.email ?? user.id,
    userDisplayName: user.email ?? "iFan",
    // ⚠️ Loại trừ thiết bị ĐÃ đăng ký. Không loại trừ thì người dùng đăng ký
    //   lại trên cùng một máy và có hai bản ghi cho một thiết bị — danh sách
    //   thiết bị của họ đầy dòng trùng và không ai biết xoá cái nào.
    excludeCredentials: ((daCo ?? []) as { credential_id: string }[]).map((x) => ({
      id: x.credential_id,
    })),
    authenticatorSelection: {
      // BẮT BUỘC xác minh người dùng (vân tay / khuôn mặt / mã máy). Không bắt
      // thì chỉ cần CẦM được máy là đăng nhập được — mà máy ở quầy thì ai cũng
      // cầm được, đúng cái tính năng này sinh ra để chặn.
      userVerification: "required",
      // Ưu tiên khoá nằm ngay trong máy để đăng nhập không phải gõ email.
      residentKey: "preferred",
    },
  });

  await catThuThach({ challenge: tuyChon.challenge, userId: user.id, loai: "dang_ky" });
  return { error: null, tuyChon };
}

export async function xongDangKyPasskey(input: {
  traLoi: RegistrationResponseJSON;
  ten: string;
}): Promise<{ error: string | null }> {
  const parsed = z
    .object({ traLoi: z.any(), ten: z.string().trim().min(1).max(60) })
    .safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };
  if (!sanSang()) return { error: "serverNotReady" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated" };

  const traLoi = parsed.data.traLoi as RegistrationResponseJSON;
  const challenge = docThuThachTuTraLoi(traLoi.response?.clientDataJSON);
  if (!challenge) return { error: "invalidInput" };

  const thuThach = await layVaXoaThuThach(challenge, "dang_ky");
  // ⚠️ Thử thách phải TỒN TẠI, còn hạn, và thuộc ĐÚNG người đang đăng nhập.
  //   Thiếu phép so người là mở đường gắn thiết bị của mình vào tài khoản khác.
  if (!thuThach || thuThach.userId !== user.id) return { error: "challengeExpired" };

  let kq;
  try {
    kq = await verifyRegistrationResponse({
      response: traLoi,
      expectedChallenge: challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch {
    return { error: "verifyFailed" };
  }
  if (!kq.verified || !kq.registrationInfo) return { error: "verifyFailed" };

  const { credential, credentialBackedUp } = kq.registrationInfo;
  const db = khoDichVu();
  const { error } = await db.from("passkeys").insert({
    credential_id: credential.id,
    user_id: user.id,
    public_key: `\\x${Buffer.from(credential.publicKey).toString("hex")}`,
    counter: credential.counter,
    dong_bo_duoc: credentialBackedUp,
    ten: parsed.data.ten,
  });
  if (error) return { error: "saveFailed" };
  return { error: null };
}

/** Danh sách thiết bị đã gắn — để người dùng nhận ra và gỡ được cái không còn dùng. */
export async function danhSachPasskey(): Promise<{
  error: string | null;
  ds: { id: string; ten: string | null; taoLuc: string; dungLanCuoi: string | null }[];
}> {
  if (!sanSang()) return { error: "serverNotReady", ds: [] };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated", ds: [] };

  const db = khoDichVu();
  const { data } = await db
    .from("passkeys")
    .select("credential_id, ten, created_at, last_used_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return {
    error: null,
    ds: ((data ?? []) as {
      credential_id: string;
      ten: string | null;
      created_at: string;
      last_used_at: string | null;
    }[]).map((x) => ({
      id: x.credential_id,
      ten: x.ten,
      taoLuc: x.created_at,
      dungLanCuoi: x.last_used_at,
    })),
  };
}

export async function goPasskey(input: { id: string }): Promise<{ error: string | null }> {
  const parsed = z.object({ id: z.string().min(1).max(500) }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };
  if (!sanSang()) return { error: "serverNotReady" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated" };

  const db = khoDichVu();
  // ⚠️ Lọc theo `user_id` NGAY TRONG câu lệnh. Bảng này không có RLS (nằm ở
  //   schema riêng, chỉ máy chủ đụng) nên phép lọc ở đây LÀ lớp bảo vệ duy
  //   nhất — thiếu nó là ai cũng gỡ được thiết bị của người khác.
  const { data, error } = await db
    .from("passkeys")
    .delete()
    .eq("credential_id", parsed.data.id)
    .eq("user_id", user.id)
    .select("credential_id");
  if (error) return { error: "saveFailed" };
  if (!data || data.length === 0) return { error: "notFound" };
  return { error: null };
}

/**
 * Đọc chuỗi thử thách từ phần `clientDataJSON` mà trình duyệt trả về.
 *
 * ⚠️ CHỈ dùng để TRA CỨU thử thách trong cơ sở dữ liệu. Việc xác minh chữ ký
 *   vẫn do thư viện làm với chính chuỗi đó — không có chuyện tin vào dữ liệu
 *   người dùng gửi lên.
 */
function docThuThachTuTraLoi(clientDataJSON: string | undefined): string | null {
  if (!clientDataJSON) return null;
  try {
    const raw = Buffer.from(clientDataJSON, "base64url").toString("utf8");
    const v = JSON.parse(raw) as { challenge?: string };
    return typeof v.challenge === "string" ? v.challenge : null;
  } catch {
    return null;
  }
}
