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
 * LỖI NÀY XẢY RA Ở ĐÂU: bản chạy thật, bản thử, hay máy lập trình.
 *
 * ⚠️ VÌ SAO PHẢI GHI. `.env.local` trên máy lập trình cầm đúng khoá dịch vụ của
 *   dự án Supabase THẬT, nên mọi lỗi ở máy dev — kể cả lỗi cố tình ném ra để
 *   thử — vào chung cuốn sổ mà chuông báo động đọc. Ngày 22/08 chuông kêu 6 lần
 *   trong 3 tiếng ("việc hỏng ảnh hưởng người dùng"), soi ra CẢ 7 dòng trong sổ
 *   đều sinh ra trên máy này: một tiến trình `next dev` và một trình duyệt tự
 *   động của bộ kiểm. Không có dòng nào của người dùng thật.
 *
 * Vercel tự đặt `VERCEL_ENV` (đã kiểm 22/08: dự án bật "expose system env"), giá
 * trị là production | preview | development. Máy dev không có biến này.
 */
function moiTruong(): "production" | "preview" | "local" {
  const v = process.env.VERCEL_ENV;
  return v === "production" || v === "preview" ? v : "local";
}

/**
 * Dấu vân tay của một LOẠI lỗi.
 *
 * ⚠️ CHỈ lấy DÒNG ĐẦU của vết gọi hàm. Vết đầy đủ chứa số dòng và tên tệp đã
 *   băm — chúng đổi sau mỗi lần dựng bản, nên gom theo vết đầy đủ thì cùng một
 *   lỗi lại đẻ ra một dòng mới sau mỗi lần lên bản, và sổ đầy bản sao.
 *
 * ⚠️ NƠI XẢY RA NẰM TRONG DẤU VÂN TAY, không chỉ là một cột đi kèm (#372). Gom
 *   chung thì cùng một lỗi gặp ở hai nơi dồn vào MỘT dòng, và mọi cách chọn
 *   nhãn cho dòng đó đều sai theo một hướng: giữ nhãn lượt đầu thì một lỗi từng
 *   thấy ở máy dev, sau này hỏng thật với khách, vẫn mang nhãn 'local' và
 *   CHUÔNG KHÔNG BAO GIỜ KÊU; còn nâng nhãn lên 'production' thì lỗi đã sửa
 *   xong mà lập trình viên chạm lại ở máy mình là CHUÔNG KÊU OAN mãi. Tách ra
 *   thì mỗi nơi một dòng, mỗi dòng một bộ đếm, không phải chọn giữa hai cái sai.
 */
function dauVanTay(
  noi: string,
  loi: string,
  vet: string | undefined,
  noiXayRa: string,
): string {
  const dongDau = (vet ?? "").split("\n").find((d) => d.trim().length > 0) ?? "";
  return createHash("sha256")
    .update([noi, loi.slice(0, 300), dongDau.slice(0, 200), noiXayRa].join("|"))
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

    const noiXayRa = moiTruong();
    const db = createClient(SUPABASE_URL, khoa, { auth: { persistSession: false } });
    await db.rpc("ghi_loi_ung_dung", {
      p_dau_van_tay: dauVanTay(input.noi, loi, vet ?? undefined, noiXayRa),
      p_noi: input.noi,
      p_loi: loi,
      p_vet: vet,
      p_duong_dan: input.duongDan ? String(input.duongDan).slice(0, 300) : null,
      p_trinh_duyet: input.trinhDuyet ? String(input.trinhDuyet).slice(0, 300) : null,
      p_tenant_id: input.tenantId ?? null,
      p_user_id: input.userId ?? null,
      p_moi_truong: noiXayRa,
    });
  } catch {
    // Cố ý nuốt: xem ghi chú đầu file.
  }
}
