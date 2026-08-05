/**
 * Cấu hình CÔNG KHAI của app (Supabase URL + anon key vốn được gửi tới mọi
 * trình duyệt — không phải bí mật). TUYỆT ĐỐI không đặt secret (service_role,
 * DB password...) vào file này.
 *
 * NGUỒN SỰ THẬT LÀ BIẾN MÔI TRƯỜNG. Trước đây URL + anon key nhúng cứng làm
 * giá trị mặc định, hệ quả là KHÔNG đổi được sang dự án Supabase khác nếu
 * không build lại code — chặn đúng hai việc đã thấy trước:
 *   (a) chuyển vùng máy chủ Mumbai → Singapore;
 *   (b) tách môi trường thử khỏi môi trường thật (có khách trả tiền rồi thì
 *       không được thử nghiệm trên dữ liệu khách).
 *
 * ⚠️ CÒN GIÁ TRỊ DỰ PHÒNG TẠM THỜI (khối FALLBACK bên dưới): tính đến lúc viết,
 * dự án Vercel `ifan-web` CHƯA có biến nào ngoài ZALO_INGEST_KEY. Bỏ dự phòng
 * ngay bây giờ = production gãy ở lần deploy kế tiếp. Nên: thiếu biến thì vẫn
 * chạy được NHƯNG kêu to trong log, không im lặng.
 *
 * VIỆC CỦA FOUNDER — thêm 2 biến này trên Vercel (Settings → Environment
 * Variables, đủ cả Production + Preview + Development):
 *     NEXT_PUBLIC_SUPABASE_URL
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY
 * XONG RỒI THÌ: xóa khối FALLBACK bên dưới (hoặc đặt IFAN_REQUIRE_PUBLIC_ENV=1)
 * → từ đó thiếu biến là GÃY NGAY LÚC BUILD, không bao giờ âm thầm chạy nhầm dự án.
 */

/**
 * Bật để thiếu biến là ném lỗi ngay khi nạp module — tức gãy lúc `next build`,
 * nơi dễ thấy nhất và trước khi kịp deploy nhầm. Dùng sau khi Vercel đã có biến.
 */
const REQUIRE_ENV = process.env.IFAN_REQUIRE_PUBLIC_ENV === "1";

/**
 * ⚠️ KHỐI FALLBACK TẠM THỜI — XÓA khi Vercel đã có 2 biến ở trên.
 * Đây là dự án Supabase hiện hành (`ifan-db`, vùng Mumbai). Anon key là khóa
 * công khai, không phải bí mật; vấn đề duy nhất của việc nhúng cứng là không
 * đổi dự án được bằng biến môi trường.
 */
const FALLBACK_SUPABASE_URL = "https://espdwbxibylgzsvldsgd.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcGR3YnhpYnlsZ3pzdmxkc2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzAwMTIsImV4cCI6MjEwMTE0NjAxMn0.m51dZoSbsp9kK4T5p2D1tMF8Q4rqjdInuY8wfMck8aQ";

/**
 * Lấy cấu hình công khai từ env; thiếu thì kêu to rồi dùng giá trị dự phòng.
 *
 * Nhận sẵn `value` chứ không tra theo tên: Next chỉ thay `process.env.NEXT_PUBLIC_X`
 * bằng giá trị thật khi thấy ĐÚNG chữ đó trong mã nguồn, tra động sẽ ra rỗng.
 * Chuỗi rỗng tính là thiếu — CI truyền secret chưa cài sẽ ra chuỗi rỗng.
 */
function publicEnv(name: string, value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;

  const message =
    `[config] Thiếu biến môi trường ${name}. ` +
    `App đang chạy bằng giá trị dự phòng nhúng sẵn (dự án Supabase mặc định) — ` +
    `nếu đây là môi trường thử thì NÓ ĐANG NỐI VÀO DỮ LIỆU THẬT. ` +
    `Thêm ${name} trên Vercel/CI rồi xóa giá trị dự phòng trong lib/config.ts.`;
  if (REQUIRE_ENV) throw new Error(message);
  console.warn(message);
  return fallback;
}

/** Origin công khai của site — dùng cho metadataBase, robots, sitemap và mã
 *  nhúng Chat trên web. Đổi được bằng env để bản thử không phát mã nhúng trỏ
 *  về bản thật. Thiếu thì dùng origin production: sai lắm cũng chỉ lệch đường
 *  dẫn hiển thị, không kéo theo rủi ro nối nhầm cơ sở dữ liệu. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://ifan-web.vercel.app";

export const SUPABASE_URL = publicEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  FALLBACK_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = publicEnv(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  FALLBACK_SUPABASE_ANON_KEY,
);
