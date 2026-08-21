import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL, SUPABASE_URL } from "@/lib/config";

/**
 * PASSKEY — phần chạy ở MÁY CHỦ.
 *
 * ┌─ HAI THỨ PHẢI ĐÚNG, KHÔNG CÓ ĐƯỜNG THỨ BA ────────────────────────
 * `rpID` (tên miền) và `origin` (địa chỉ đầy đủ) phải khớp CHÍNH XÁC nơi
 * trình duyệt đang chạy. Sai một chữ thì trình duyệt từ chối ký, và thông báo
 * lỗi của nó cố tình mơ hồ — sẽ mất rất lâu để lần ra.
 *
 * ⚠️ TUYỆT ĐỐI không lấy `rpID` từ thứ người dùng gửi lên (header `Host`,
 *   `Origin`...). Lấy từ đó nghĩa là kẻ tấn công tự khai tên miền của mình và
 *   chữ ký của họ được chấp nhận. Lấy từ cấu hình của chính máy chủ.
 */
/**
 * ⚠️ Ở MÁY LẬP TRÌNH `NEXT_PUBLIC_SITE_URL` thường bỏ trống (xem `.env.example`)
 *   — lúc đó `SITE_URL` trỏ về địa chỉ production, còn trình duyệt lại đang ở
 *   `localhost`. Hai bên lệch nhau thì trình duyệt TỪ CHỐI KÝ, và lời nó báo
 *   cố tình mơ hồ nên người sửa sẽ đi tìm ở chỗ khác rất lâu. Chỉ nhánh phát
 *   triển mới lấy localhost; `NODE_ENV` là hằng số lúc dựng bản, không phải
 *   thứ người dùng gửi lên, nên bản chạy thật không bao giờ đi vào nhánh này.
 */
const goc = new URL(
  process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_SITE_URL
    ? "http://localhost:3000"
    : SITE_URL,
);
export const RP_ID = goc.hostname;
export const RP_ORIGIN = goc.origin;
export const RP_TEN = "iFan";

/**
 * Khoá dịch vụ để đụng vào hai bảng passkey.
 *
 * ⚠️ PHẢI là khoá dịch vụ, không phải khoá của người dùng. Hai bảng này bật
 *   RLS và KHÔNG có policy nào, đồng thời `anon`/`authenticated` không được
 *   cấp một quyền nào (#324, #325) — nghĩa là chỉ vai `service_role` đi qua
 *   được. Đó là toàn bộ thiết kế bảo mật của chúng, đã đo bằng
 *   `scripts/soat-passkey-kho.mjs`.
 */
export function khoDichVu() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

export function sanSang(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Cất một chuỗi thử thách, và DỌN những cái đã quá hạn.
 *
 * ⚠️ Dọn ngay ở đây chứ không bằng một việc nền riêng: việc nền riêng là thứ
 *   người ta quên bật, và lúc đó bảng này phình mãi.
 */
export async function catThuThach(input: {
  challenge: string;
  userId: string | null;
  loai: "dang_ky" | "dang_nhap";
}) {
  const db = khoDichVu();
  // ⚠️ CỐ Ý không đếm dòng ở đây: dọn trúng 0 dòng là kết quả ĐÚNG (chưa có cái
  //   nào quá hạn) chứ không phải bị chặn. Đã khai miễn trừ kèm lý do trong
  //   `scripts/soat-ghi-im-lang.mjs`. Lệnh ghi THẬT SỰ quan trọng của tính năng
  //   này — cập nhật bộ đếm — thì có đếm dòng, xem `api/passkey/dang-nhap`.
  await db.from("passkey_challenges").delete().lt("het_han_luc", new Date().toISOString());
  await db.from("passkey_challenges").insert({
    challenge: input.challenge,
    user_id: input.userId,
    loai: input.loai,
  });
}

/**
 * Lấy RA và XOÁ một chuỗi thử thách — dùng đúng một lần.
 *
 * ⚠️ Xoá NGAY khi lấy, kể cả khi phần xác minh phía sau hỏng. Giữ lại nghĩa là
 *   một chữ ký chặn được trên đường truyền có thể phát lại. Trả `null` nếu
 *   không có hoặc đã quá hạn — và người gọi PHẢI coi đó là từ chối.
 */
export async function layVaXoaThuThach(
  challenge: string,
  loai: "dang_ky" | "dang_nhap",
): Promise<{ userId: string | null } | null> {
  const db = khoDichVu();
  const { data } = await db
    .from("passkey_challenges")
    .delete()
    .eq("challenge", challenge)
    .eq("loai", loai)
    .gt("het_han_luc", new Date().toISOString())
    .select("user_id");
  if (!data || data.length === 0) return null;
  return { userId: (data[0] as { user_id: string | null }).user_id };
}
