/**
 * Cấu hình CÔNG KHAI của app (Supabase URL + anon key vốn được gửi tới mọi
 * trình duyệt — không phải bí mật). TUYỆT ĐỐI không đặt secret (service_role,
 * DB password...) vào file này.
 *
 * NGUỒN SỰ THẬT LÀ BIẾN MÔI TRƯỜNG — không còn giá trị dự phòng nhúng cứng.
 * Thiếu biến là GÃY NGAY LÚC BUILD, không bao giờ âm thầm nối vào dự án
 * Supabase khác. Trước đây URL + anon key nhúng cứng làm mặc định, hệ quả là
 * KHÔNG đổi được sang dự án Supabase khác nếu không build lại code — chặn đúng
 * hai việc đã thấy trước:
 *   (a) chuyển vùng máy chủ Mumbai → Singapore;
 *   (b) tách môi trường thử khỏi môi trường thật (có khách trả tiền rồi thì
 *       không được thử nghiệm trên dữ liệu khách).
 *
 * NƠI ĐẶT 2 BIẾN BẮT BUỘC:
 *     NEXT_PUBLIC_SUPABASE_URL
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   · Máy dev: `.env.local` (đã gitignore — KHÔNG commit).
 *   · Vercel: Settings → Environment Variables, đủ cả Production + Preview +
 *     Development.
 *   · CI: `.github/workflows/ci.yml` ánh xạ từ secret của kho code.
 */

/**
 * Đọc cấu hình công khai từ env; thiếu là ném lỗi ngay khi nạp module — tức gãy
 * lúc `next build`, nơi dễ thấy nhất và trước khi kịp deploy nhầm.
 *
 * Nhận sẵn `value` chứ không tra theo tên: Next chỉ thay `process.env.NEXT_PUBLIC_X`
 * bằng giá trị thật khi thấy ĐÚNG chữ đó trong mã nguồn, tra động sẽ ra rỗng.
 * Chuỗi rỗng tính là thiếu — CI truyền secret chưa cài sẽ ra chuỗi rỗng.
 */
function requiredPublicEnv(name: string, value: string | undefined) {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;

  throw new Error(
    `[config] Thiếu biến môi trường bắt buộc ${name}. ` +
      `App KHÔNG chạy khi thiếu biến này — cố ý như vậy để không bao giờ âm thầm ` +
      `nối vào nhầm dự án Supabase. Cách sửa: máy dev thì thêm ${name} vào .env.local; ` +
      `Vercel thì Settings → Environment Variables (đủ Production + Preview + Development); ` +
      `CI thì kiểm secret tương ứng trong .github/workflows/ci.yml.`,
  );
}

/** Origin công khai của site — dùng cho metadataBase, robots, sitemap và mã
 *  nhúng Chat trên web. Đổi được bằng env để bản thử không phát mã nhúng trỏ
 *  về bản thật. Thiếu thì dùng origin production: sai lắm cũng chỉ lệch đường
 *  dẫn hiển thị, không kéo theo rủi ro nối nhầm cơ sở dữ liệu. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://ifan-web.vercel.app";

export const SUPABASE_URL = requiredPublicEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = requiredPublicEnv(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
