import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Khoá API cho tiệm (V6 integrations, migration #160).
 *
 * LUẬT SỐ MỘT: bản gốc của khoá KHÔNG BAO GIỜ được lưu ở đâu cả. Chỉ lưu bản
 * băm. Khoá hiện ĐÚNG MỘT LẦN lúc tạo, đóng cửa sổ là mất — chủ tiệm tạo khoá
 * mới chứ không có đường "xem lại". Đây là quyết định 1 của thẻ design, và nó
 * có nghĩa: CSDL bị lộ cũng không lộ khoá của ai.
 */

export const TIEN_TO = "ifan_sk_";

/** Quyền hiện có — TẤT CẢ đều chỉ đọc. Chưa mở quyền ghi nào (quyết định 2). */
export const QUYEN_HOP_LE = ["read:orders", "read:contacts", "read:appointments"] as const;
export type QuyenApi = (typeof QUYEN_HOP_LE)[number];

/** Khoá không ai dùng quá ngần này ngày thì đánh dấu "bỏ quên?" (quyết định 3). */
export const NGAY_COI_LA_BO_QUEN = 30;

export type KhoaMoi = { khoaGoc: string; hash: string; tienTo: string; hauTo: string };

/**
 * Sinh khoá mới. 32 byte ngẫu nhiên = 256 bit — không dò được.
 * Trả BẢN GỐC cho lời gọi hiện ngay một lần, và bản băm để lưu.
 */
export function sinhKhoa(): KhoaMoi {
  const than = randomBytes(24).toString("base64url"); // 32 ký tự
  const khoaGoc = TIEN_TO + than;
  return {
    khoaGoc,
    hash: bamKhoa(khoaGoc),
    // Đủ để chủ tiệm nhận ra khoá nào là khoá nào trên danh sách, không đủ để dò.
    tienTo: khoaGoc.slice(0, TIEN_TO.length + 4),
    hauTo: khoaGoc.slice(-3),
  };
}

/**
 * Băm khoá. SHA-256 KHÔNG muối là CỐ Ý ở đây, khác hẳn mật khẩu người dùng:
 * khoá là 256 bit ngẫu nhiên nên không có "từ điển" nào dò được, mà tra khoá
 * phải làm được bằng MỘT phép tìm theo chỉ mục — băm chậm có muối thì mỗi lượt
 * gọi API phải quét cả bảng để thử từng dòng.
 */
export function bamKhoa(khoaGoc: string): string {
  return createHash("sha256").update(khoaGoc, "utf8").digest("hex");
}

function bangNhau(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export type KetQuaTraKhoa =
  | { ok: true; tenantId: string; keyId: string; scopes: string[] }
  | { ok: false; lyDo: "thieu_khoa" | "khoa_sai" | "khoa_da_thu_hoi" | "thieu_quyen" | "chua_cau_hinh" };

/**
 * Đối chiếu khoá từ header `Authorization: Bearer ifan_sk_...`.
 *
 * PHẢI gọi bằng client SERVICE ROLE: lúc này chưa biết tiệm nào nên RLS không
 * có gì để lọc theo. Bù lại, hàm này TỰ trả về tenant_id và mọi truy vấn sau đó
 * bắt buộc lọc theo giá trị ấy — đó là hàng rào thay cho RLS.
 */
export async function traKhoa(
  supabase: SupabaseClient | null,
  header: string | null,
  quyenCan: QuyenApi,
): Promise<KetQuaTraKhoa> {
  if (!supabase) return { ok: false, lyDo: "chua_cau_hinh" };

  const raw = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw || !raw.startsWith(TIEN_TO)) return { ok: false, lyDo: "thieu_khoa" };

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, tenant_id, key_hash, scopes, status")
    .eq("key_hash", bamKhoa(raw))
    .maybeSingle();
  if (error || !data) return { ok: false, lyDo: "khoa_sai" };

  // So lại bằng phép so hằng-thời-gian dù đã tra theo chỉ mục: rẻ, và giữ đúng
  // nếp cho người sau khỏi thay bằng `===` ở chỗ khác.
  if (!bangNhau(data.key_hash as string, bamKhoa(raw))) return { ok: false, lyDo: "khoa_sai" };
  if (data.status !== "active") return { ok: false, lyDo: "khoa_da_thu_hoi" };

  const scopes = (data.scopes ?? []) as string[];
  if (!scopes.includes(quyenCan)) return { ok: false, lyDo: "thieu_quyen" };

  return {
    ok: true,
    tenantId: data.tenant_id as string,
    keyId: data.id as string,
    scopes,
  };
}

/**
 * Ghi "vừa dùng lúc nào" — cột quan trọng nhất của màn Khoá API.
 * Cố ý KHÔNG chờ và KHÔNG làm hỏng lời gọi: đây là số liệu vận hành, không phải
 * nghiệp vụ. Ghi hỏng thì thà mất một mốc thời gian còn hơn hỏng cả API.
 */
export async function ghiDaDung(supabase: SupabaseClient | null, keyId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("api_key_touch", { p_key_id: keyId });
  if (error) console.error("[api-key] không ghi được mốc dùng:", error.message);
}
