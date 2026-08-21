import { NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { createClient as createSSRClient } from "@/lib/supabase/server";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import {
  RP_ID,
  RP_ORIGIN,
  catThuThach,
  khoDichVu,
  layVaXoaThuThach,
  sanSang,
} from "@/lib/passkey/may-chu";

/**
 * ĐĂNG NHẬP BẰNG VÂN TAY / KHUÔN MẶT.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ĐÂY LÀ CỬA VÀO TÀI KHOẢN — mọi phép kiểm dưới đây đều bắt buộc
 * ═══════════════════════════════════════════════════════════════════
 * Sai một chỗ là ai cũng đăng nhập được thành người khác. Liệt kê ra để lần
 * sau ai sửa file này còn biết đâu là chốt và đâu là chuyện phụ:
 *
 *   1. Thử thách phải TỒN TẠI trong cơ sở dữ liệu, còn hạn, và bị XOÁ ngay
 *      khi lấy ra — dùng một lần. Không có nó thì một chữ ký chặn được trên
 *      đường truyền phát lại được mãi mãi.
 *   2. `expectedOrigin` và `expectedRPID` lấy từ CẤU HÌNH MÁY CHỦ, tuyệt đối
 *      không lấy từ header người dùng gửi lên.
 *   3. `requireUserVerification: true` — bắt buộc chạm vân tay/khuôn mặt.
 *      Không bắt thì chỉ cần CẦM được máy là vào được, mà máy ở quầy thì ai
 *      cũng cầm được — đúng cái tính năng này sinh ra để chặn.
 *   4. BỘ ĐẾM phải TĂNG. Chữ ký mang bộ đếm nhỏ hơn hoặc bằng lần trước là
 *      chữ ký cũ bị phát lại.
 *   5. CÓ GIỚI HẠN SỐ LẦN THỬ theo địa chỉ mạng.
 *
 * ⚠️ Phiên đăng nhập được tạo bằng cách sinh một liên kết đăng nhập một lần
 *   rồi ĐỔI NÓ NGAY TẠI MÁY CHỦ. Liên kết đó KHÔNG BAO GIỜ đi ra ngoài — nó
 *   sinh ra và tiêu thụ trong cùng một lượt xử lý. Gửi nó về trình duyệt là
 *   biến một liên kết đăng nhập thành thứ có thể bị chặn giữa đường.
 */

export const dynamic = "force-dynamic";

type HangKhoa = {
  credential_id: string;
  user_id: string;
  public_key: string;
  counter: string | number;
};

/** Bước 1 — xin một chuỗi thử thách. */
export async function GET(req: Request) {
  if (!sanSang()) return NextResponse.json({ error: "serverNotReady" }, { status: 503 });

  const { allowed } = await rateLimit(`passkey:opt:${clientIpFrom(req.headers)}`, 20, 60);
  if (!allowed) return NextResponse.json({ error: "tooMany" }, { status: 429 });

  const tuyChon = await generateAuthenticationOptions({
    rpID: RP_ID,
    // ⚠️ KHÔNG liệt kê thiết bị nào. Liệt kê nghĩa là bất kỳ ai gõ một email
    //   vào cũng biết được email đó có tài khoản hay không, và có mấy thiết bị
    //   — một cửa dò tài khoản. Để trống thì trình duyệt tự chọn khoá nó có.
    userVerification: "required",
  });

  await catThuThach({ challenge: tuyChon.challenge, userId: null, loai: "dang_nhap" });
  return NextResponse.json({ tuyChon });
}

/** Bước 2 — nhận chữ ký, xác minh, và mở phiên đăng nhập. */
export async function POST(req: Request) {
  if (!sanSang()) return NextResponse.json({ error: "serverNotReady" }, { status: 503 });

  const ip = clientIpFrom(req.headers);
  // Chặt hơn bước 1: đây là chỗ THỬ CHÌA. Mười lần một phút là quá đủ cho
  // người thật, và đủ chậm để dò tự động không đi tới đâu.
  const { allowed } = await rateLimit(`passkey:vao:${ip}`, 10, 60);
  if (!allowed) return NextResponse.json({ error: "tooMany" }, { status: 429 });

  let traLoi: AuthenticationResponseJSON;
  try {
    traLoi = (await req.json()) as AuthenticationResponseJSON;
  } catch {
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  }
  if (!traLoi?.id || !traLoi?.response?.clientDataJSON) {
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  }

  const challenge = docThuThach(traLoi.response.clientDataJSON);
  if (!challenge) return NextResponse.json({ error: "invalidInput" }, { status: 400 });

  // (1) Thử thách: phải có, còn hạn, và bị xoá ngay.
  const thuThach = await layVaXoaThuThach(challenge, "dang_nhap");
  if (!thuThach) return NextResponse.json({ error: "challengeExpired" }, { status: 401 });

  const db = khoDichVu();
  const { data: khoaRaw } = await db
    .from("passkeys")
    .select("credential_id, user_id, public_key, counter")
    .eq("credential_id", traLoi.id)
    .maybeSingle();
  const khoa = khoaRaw as HangKhoa | null;
  if (!khoa) return NextResponse.json({ error: "unknownDevice" }, { status: 401 });

  // `bytea` về dưới dạng chuỗi hex có tiền tố `\x`.
  const congKhai = Uint8Array.from(
    Buffer.from(String(khoa.public_key).replace(/^\\x/, ""), "hex"),
  );

  let kq;
  try {
    kq = await verifyAuthenticationResponse({
      response: traLoi,
      expectedChallenge: challenge,
      // (2) Lấy từ cấu hình máy chủ, không từ header người dùng.
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      // (3) Bắt buộc chạm vân tay / khuôn mặt.
      requireUserVerification: true,
      credential: {
        id: khoa.credential_id,
        publicKey: congKhai,
        counter: Number(khoa.counter),
      },
    });
  } catch {
    return NextResponse.json({ error: "verifyFailed" }, { status: 401 });
  }
  if (!kq.verified) return NextResponse.json({ error: "verifyFailed" }, { status: 401 });

  // (4) Bộ đếm phải TĂNG — Ổ KHOÁ THỨ HAI, cố ý trùng với thư viện.
  //
  // Thư viện `@simplewebauthn` đã kiểm đúng luật này ở trên. Giữ lại đây là
  // CHỦ Ý: đây là cửa vào tài khoản, và một lần nâng cấp thư viện làm đổi hành
  // vi sẽ không có gì báo. Ai đọc tới đây đừng xoá vì thấy "thừa".
  //
  // ⚠️ Ngoại lệ đúng chuẩn: khoá đồng bộ qua đám mây của Apple/Google LUÔN báo
  //   bộ đếm bằng 0. Chuẩn WebAuthn nói rõ: cả hai bên cùng 0 thì BỎ QUA phép
  //   so này. So cứng sẽ khoá cửa với chính loại thiết bị phổ biến nhất.
  //
  // ⚠️ VÀ VÌ VẬY: với đúng loại khoá đó, ổ này NGHỈ — chốt chống phát lại duy
  //   nhất còn lại là thử thách dùng một lần ở (1). Đo riêng nó bằng
  //   `scripts/passkey-smoke.mjs`; đo chung thì ổ này che mất, và một lỗ thật
  //   sẽ đi qua với màu xanh.
  const demMoi = kq.authenticationInfo.newCounter;
  const demCu = Number(khoa.counter);
  if (!(demMoi === 0 && demCu === 0) && demMoi <= demCu) {
    return NextResponse.json({ error: "replay" }, { status: 401 });
  }

  // ⚠️ ĐẾM DÒNG, đừng ghi rồi đi tiếp. Lệnh ghi trúng 0 dòng trả về y hệt lúc
  //   thành công. Ở đây "0 dòng" nghĩa là bộ đếm KHÔNG BAO GIỜ tăng nữa — ổ
  //   khoá chống phát lại số một tắt vĩnh viễn cho thiết bị đó, mà không có gì
  //   báo. Thà từ chối lần đăng nhập này còn hơn mở một cửa im lặng.
  const { data: daGhi } = await db
    .from("passkeys")
    .update({ counter: demMoi, last_used_at: new Date().toISOString() })
    .eq("credential_id", khoa.credential_id)
    .select("credential_id");
  if (!daGhi || daGhi.length === 0) {
    return NextResponse.json({ error: "counterNotSaved" }, { status: 500 });
  }

  // ── Mở phiên đăng nhập ───────────────────────────────────────────
  const { data: nguoi } = await db.auth.admin.getUserById(khoa.user_id);
  const email = nguoi?.user?.email;
  if (!email) return NextResponse.json({ error: "noEmail" }, { status: 401 });

  const { data: lienKet, error: loiLienKet } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const maMotLan = lienKet?.properties?.hashed_token;
  if (loiLienKet || !maMotLan) {
    return NextResponse.json({ error: "sessionFailed" }, { status: 500 });
  }

  // Đổi mã một lần lấy phiên NGAY TẠI ĐÂY. Mã không đi ra ngoài máy chủ.
  const ssr = await createSSRClient();
  const { error: loiPhien } = await ssr.auth.verifyOtp({
    token_hash: maMotLan,
    type: "magiclink",
  });
  if (loiPhien) return NextResponse.json({ error: "sessionFailed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * Đọc chuỗi thử thách từ `clientDataJSON`.
 *
 * ⚠️ CHỈ để TRA CỨU trong cơ sở dữ liệu. Việc xác minh chữ ký vẫn do thư viện
 *   làm với chính chuỗi đó — không có chuyện tin vào dữ liệu người dùng gửi.
 */
function docThuThach(clientDataJSON: string): string | null {
  try {
    const raw = Buffer.from(clientDataJSON, "base64url").toString("utf8");
    const v = JSON.parse(raw) as { challenge?: string };
    return typeof v.challenge === "string" ? v.challenge : null;
  } catch {
    return null;
  }
}
