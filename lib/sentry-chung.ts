/**
 * CẤU HÌNH DÙNG CHUNG CHO CẢ BA MÔI TRƯỜNG CỦA SENTRY (trình duyệt · máy chủ ·
 * biên). Khai một chỗ, ba tệp cấu hình cùng đọc — bất biến 13: hạ tầng dùng
 * chung chỉ có MỘT bản.
 *
 * ⚠️ VÌ SAO CÓ CÔNG TẮC `duocGui` THAY VÌ BẬT LUÔN KHI CÓ KHOÁ:
 *   Ngày 22/08 chuông báo lỗi của sổ `app_errors` kêu 6 lần trong 3 tiếng
 *   ("việc hỏng ảnh hưởng người dùng"), soi ra CẢ 7 dòng đều sinh ra trên máy
 *   lập trình — một tiến trình `next dev` và một trình duyệt của bộ kiểm. Không
 *   dòng nào của người dùng thật. Nguyên nhân: `.env.local` trên máy lập trình
 *   cầm đúng khoá của dự án THẬT, nên mọi lỗi thử nghiệm chảy vào chung sổ.
 *
 *   Sentry sẽ dính y hệt nếu chỉ xét "có khoá thì gửi". Nên mặc định:
 *   CHỈ bản trên Vercel mới gửi. Máy lập trình muốn thử thì bật tay bằng
 *   `NEXT_PUBLIC_SENTRY_GUI_TU_MAY_DEV=1` — cố ý bắt gõ thêm một biến, để không ai vô tình
 *   bơm rác vào sổ lỗi thật.
 */

/** Khoá công khai của dự án Sentry. Không có khoá thì Sentry tắt hoàn toàn. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

/**
 * Lỗi này xảy ra ở đâu — dùng làm bộ lọc trên Sentry. Cùng cách phân loại với
 * `lib/ghi-loi.ts` để hai cuốn sổ nói cùng một thứ tiếng.
 */
export function moiTruongSentry(): "production" | "preview" | "local" {
  const v = process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV;
  return v === "production" || v === "preview" ? v : "local";
}

/** Có được phép gửi lỗi lên Sentry không — xem ghi chú đầu tệp. */
export function duocGuiSentry(): boolean {
  if (!SENTRY_DSN) return false;
  if (moiTruongSentry() !== "local") return true;
  // ⚠️ PHẢI là biến `NEXT_PUBLIC_`: nửa trình duyệt của Sentry không đọc được
  //   biến thường. Dùng tên không-public thì máy chủ gửi mà trình duyệt câm, và
  //   đó đúng là kiểu hỏng một nửa khó thấy nhất.
  return process.env.NEXT_PUBLIC_SENTRY_GUI_TU_MAY_DEV === "1";
}

/** Phần cấu hình giống nhau ở cả ba môi trường. */
export const CAU_HINH_CHUNG = {
  dsn: SENTRY_DSN,
  enabled: duocGuiSentry(),
  environment: moiTruongSentry(),
  /**
   * ⚠️ 100% lỗi được gửi, KHÔNG lấy mẫu. iFan hiện có rất ít người dùng; lấy
   *   mẫu ở quy mô này nghĩa là một lỗi thật có thể không bao giờ hiện ra.
   *   Khi lượng người dùng tăng thì hạ số này, đừng để nguyên mà quên.
   */
  sampleRate: 1,
  /** Vết đo tốc độ: 10% là đủ để thấy màn nào chậm mà không tốn hạn mức. */
  tracesSampleRate: 0.1,
  /**
   * ⛔ KHÔNG bật `sendDefaultPii`. Sổ lỗi không được cầm tên khách, số điện
   *   thoại hay nội dung tin nhắn — dữ liệu của tiệm không rời khỏi Supabase.
   */
  sendDefaultPii: false,
} as const;
