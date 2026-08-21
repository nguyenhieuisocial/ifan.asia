import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * CÔNG TẮC TÍNH NĂNG — thẻ design `man-quan-tri-cong-tac-tinh-nang.html`.
 *
 * Hỏi: tính năng này có đang mở cho NGƯỜI ĐANG ĐĂNG NHẬP không.
 *
 * ⚠️ ĐÂY KHÔNG PHẢI PHÂN QUYỀN. Nó chỉ quyết định CÓ HIỆN RA KHÔNG. Ai biết
 *   đường dẫn vẫn gọi tới được. Việc chặn thật nằm ở RLS và ở chốt đầu mỗi
 *   lệnh máy chủ. Dùng công tắc để giấu thứ không được phép xem là sai theo
 *   kiểu nguy hiểm nhất: nó TRÔNG như đã chặn.
 *
 * ⚠️ CHỈ DÙNG Ở MÁY CHỦ. `import "server-only"` chặn lỡ tay mang sang trình
 *   duyệt: bê sang đó thì `tiem_ids` — danh sách tiệm nào đang được ưu ái dùng
 *   thử — sẽ nằm trong gói mã ai cũng đọc được.
 */

/**
 * ⏱️ KHÔNG ĐỆM QUÁ 60 GIÂY, và đây là con số có lý do.
 *
 * Công tắc chỉ đáng tin nếu lúc hoảng nó nhanh. Gạt tắt mà một phút sau vẫn
 * chưa thấy gì đổi thì người gạt sẽ gạt lại lần hai vì tưởng hỏng, rồi gọi
 * điện hỏi, rồi vào sửa mã — tức là quay về đúng cái chậm mà công tắc sinh ra
 * để tránh. Đệm dài hơn tiết kiệm được vài lượt hỏi cơ sở dữ liệu, đổi lại
 * làm hỏng chính công dụng của nó. Không đáng.
 *
 * KHÔNG dùng `unstable_cache`: kết quả phụ thuộc người đang đăng nhập (phạm vi
 * "vài tiệm" và "theo vai"), mà bộ đệm đó dùng chung cho mọi người — đệm ở đó
 * là mở tính năng cho nhầm tiệm.
 */
const HAN_DEM_MS = 60_000;

const dem = new Map<string, { batDau: number; bat: boolean }>();

/**
 * ⚠️ Bộ đệm có khoá là (công tắc × người dùng) nên nó CHỈ TĂNG. Máy chủ chạy
 *   lâu, nhiều người dùng ⇒ rò rỉ bộ nhớ chậm mà chắc. Dọn khi vượt ngưỡng:
 *   mỗi dòng chỉ sống 60 giây, nên dọn sạch không mất gì ngoài một lượt hỏi.
 */
const TRAN_DEM = 2000;
function donNeuPhinh(): void {
  if (dem.size < TRAN_DEM) return;
  const gio = Date.now();
  for (const [k, v] of dem) if (gio - v.batDau >= HAN_DEM_MS) dem.delete(k);
  // Vẫn phình sau khi dọn hết dòng hết hạn ⇒ đang có đợt tải rất lớn. Bỏ sạch
  // còn hơn giữ một bộ đệm không có trần.
  if (dem.size >= TRAN_DEM) dem.clear();
}

/** Khoá đệm phải gồm CẢ tiệm lẫn vai, vì câu trả lời phụ thuộc cả hai. */
function khoaDem(khoa: string, ai: string): string {
  return `${khoa}:${ai}`;
}

export async function coBat(khoa: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ai = user?.id ?? "khach";

  const k = khoaDem(khoa, ai);
  donNeuPhinh();
  const cu = dem.get(k);
  if (cu && Date.now() - cu.batDau < HAN_DEM_MS) return cu.bat;

  const { data, error } = await supabase.rpc("co_bat", { p_khoa: khoa });
  // ⚠️ HỎI KHÔNG ĐƯỢC ⇒ COI NHƯ BẬT. Cùng lý do với "không có công tắc thì vẫn
  //   chạy": một trục trặc mạng không được phép làm cả tính năng biến mất.
  //   Muốn tắt thì phải là một câu trả lời RÕ RÀNG từ cơ sở dữ liệu.
  const bat = error ? true : data !== false;
  dem.set(k, { batDau: Date.now(), bat });
  return bat;
}
