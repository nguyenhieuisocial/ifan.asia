import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/config";

/**
 * GHI LỖI ỨNG DỤNG vào sổ (`app_errors`, migration #327).
 *
 * ⚠️ HÀM NÀY KHÔNG ĐƯỢC NÉM LỖI, BAO GIỜ CŨNG VẬY. Nó chạy trên đường xử lý
 *   MỘT LỖI ĐÃ XẢY RA. Nếu nó tự hỏng thì lỗi gốc bị nuốt mất và người dùng
 *   nhận một màn trắng không lý do — tệ hơn hẳn tình trạng chưa có gì. Vì vậy
 *   mọi thứ bên trong bọc `try` và thất bại trong im lặng.
 *
 * ⚠️ CẮT NGẮN Ở ĐÂY, không tin phía gửi. Lời lỗi và vết gọi hàm đến từ trình
 *   duyệt người dùng — tức là dữ liệu người lạ gửi lên. Không cắt thì một
 *   người gửi vài megabyte mỗi lượt là làm phình kho.
 */

/**
 * Dấu vân tay của một LOẠI lỗi.
 *
 * ⚠️ CHỈ lấy DÒNG ĐẦU của vết gọi hàm. Vết đầy đủ chứa số dòng và tên tệp đã
 *   băm — chúng đổi sau mỗi lần dựng bản, nên gom theo vết đầy đủ thì cùng một
 *   lỗi lại đẻ ra một dòng mới sau mỗi lần lên bản, và sổ đầy bản sao.
 */
function dauVanTay(noi: string, loi: string, vet: string | undefined): string {
  const dongDau = (vet ?? "").split("\n").find((d) => d.trim().length > 0) ?? "";
  return createHash("sha256")
    .update([noi, loi.slice(0, 300), dongDau.slice(0, 200)].join("|"))
    .digest("hex")
    .slice(0, 32);
}

export async function ghiLoi(input: {
  noi: "client" | "server";
  loi: string;
  vet?: string;
  duongDan?: string;
  trinhDuyet?: string;
  tenantId?: string | null;
  userId?: string | null;
}): Promise<void> {
  try {
    const khoa = process.env.SUPABASE_SERVICE_ROLE_KEY;
    // Không có khoá dịch vụ (máy lập trình thiếu cấu hình) ⇒ im lặng bỏ qua.
    // Không bao giờ để chuyện thiếu cấu hình làm hỏng đường xử lý lỗi.
    if (!khoa) return;
    const loi = String(input.loi ?? "").slice(0, 500);
    if (!loi.trim()) return;
    const vet = input.vet ? String(input.vet).slice(0, 3000) : null;

    const db = createClient(SUPABASE_URL, khoa, { auth: { persistSession: false } });
    await db.rpc("ghi_loi_ung_dung", {
      p_dau_van_tay: dauVanTay(input.noi, loi, vet ?? undefined),
      p_noi: input.noi,
      p_loi: loi,
      p_vet: vet,
      p_duong_dan: input.duongDan ? String(input.duongDan).slice(0, 300) : null,
      p_trinh_duyet: input.trinhDuyet ? String(input.trinhDuyet).slice(0, 300) : null,
      p_tenant_id: input.tenantId ?? null,
      p_user_id: input.userId ?? null,
    });
  } catch {
    // Cố ý nuốt: xem ghi chú đầu file.
  }
}
