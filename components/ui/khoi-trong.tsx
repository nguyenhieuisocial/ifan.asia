import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * KHỐI RỖNG DÙNG CHUNG — thẻ design `sau-khuon-man`, khuôn 1, luật 1.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Đo 22/08/2026: **0 trong 229** file màn dùng một khối rỗng chung, và **34**
 * file bày ra đúng MỘT dòng chữ xám khi danh sách rỗng — không tiêu đề, không
 * nút, không dạy được bước tiếp theo. Tiệm mới mở app lần đầu gặp mười màn
 * trống câm như thế thì kết luận hợp lý nhất của họ là "phần mềm chưa chạy".
 *
 * ⚠️ HAI KIỂU RỖNG LÀ HAI CHUYỆN KHÁC NHAU, và đây là chỗ hay nhập một:
 *   · **Chưa có gì** — phải DẠY VIỆC: đây là màn gì, thêm cái đầu tiên bằng cách nào.
 *   · **Lọc không ra** — phải GỠ LỐI RA: nói rõ đang lọc gì, và cho nút bỏ lọc.
 *   Dùng chung một câu "không có kết quả" cho cả hai thì người mới tưởng hỏng,
 *   còn người đang lọc thì không biết đường lui.
 *
 * ⚠️ CHỖ NÀY KHÔNG PHẢI ĐỂ TRỪU TƯỢNG HOÁ CHO ĐẸP. Luật của kho là đợi tới chỗ
 *   dùng THỨ BA mới tách component; khối rỗng đã có 66 chỗ dùng, xa mốc đó lâu
 *   rồi. Ngược lại, bố cục lịch và bảng cột kéo thả mới 2 chỗ nên CỐ Ý để riêng.
 */

/**
 * Rỗng vì CHƯA CÓ GÌ. Bắt buộc có `tieuDe` và `moTa` — một khối rỗng không nói
 * được bước tiếp theo thì không hơn gì dòng chữ xám nó vừa thay thế.
 */
export function KhoiTrong({
  bieuTuong,
  tieuDe,
  moTa,
  hanhDong,
  goiY,
  giongTichCuc = false,
  className,
}: {
  /** Biểu tượng ~32px. Bọc sẵn trong vòng tròn nền nhạt, đừng tự bọc lại. */
  bieuTuong?: ReactNode;
  tieuDe: string;
  /** Một tới hai câu: màn này để làm gì, và thêm cái đầu tiên thế nào. */
  moTa: string;
  /** Nút chính. Bỏ trống khi vai đang xem không có quyền tạo. */
  hanhDong?: ReactNode;
  /** Lối phụ, chữ nhỏ dưới nút — ví dụ "hoặc nhập từ file Excel". */
  goiY?: ReactNode;
  /**
   * Rỗng là TIN VUI (không có hồ sơ trùng, không có việc quá hạn). Đổi màu
   * biểu tượng sang màu thương hiệu — màn toàn xám đọc ra như "chưa làm xong",
   * trong khi ý là "mọi thứ ổn".
   */
  giongTichCuc?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-8 text-center sm:p-12",
        className,
      )}
    >
      {bieuTuong && (
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-full [&_svg]:size-8",
            giongTichCuc
              ? "bg-primary-tint [&_svg]:text-primary"
              : "bg-muted [&_svg]:text-muted-foreground",
          )}
          aria-hidden
        >
          {bieuTuong}
        </span>
      )}
      <h2 className="text-[15px] font-semibold">{tieuDe}</h2>
      <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{moTa}</p>
      {hanhDong && <div className="flex flex-wrap items-center justify-center gap-2">{hanhDong}</div>}
      {goiY && <p className="text-[11px] text-muted-foreground">{goiY}</p>}
    </div>
  );
}

/**
 * Rỗng vì BỘ LỌC. Khác hẳn khối trên: không dạy việc, chỉ gỡ lối ra.
 *
 * `moTa` nên nhắc lại ĐÚNG cái đang lọc ("Không có khách nào khớp “hà” trong
 * nguồn Facebook") — câu chung chung "không có kết quả" buộc người dùng tự nhớ
 * mình đã bấm những gì.
 */
export function KhoiTrongDoLoc({
  moTa,
  hanhDong,
  className,
}: {
  moTa: string;
  /** Nút bỏ lọc. Luôn nên có — đây là toàn bộ lý do khối này tồn tại. */
  hanhDong?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 p-8 text-center sm:p-12", className)}
    >
      <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{moTa}</p>
      {hanhDong}
    </div>
  );
}

/**
 * KHÔNG TẢI ĐƯỢC — khác hẳn hai khối trên và không được nhập vào chúng.
 *
 * "Mạng hỏng" hiện ra như "chưa có khách nào" là lỗi nguy hiểm nhất trong ba:
 * chủ tiệm tưởng mất sạch dữ liệu, và việc tiếp theo họ làm là nhập lại một
 * bản trùng.
 */
export function KhoiTrongLoi({
  bieuTuong,
  moTa,
  hanhDong,
  className,
}: {
  bieuTuong?: ReactNode;
  moTa: string;
  /** Nút thử lại. */
  hanhDong?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 p-8 text-center sm:p-12", className)}
    >
      {bieuTuong && (
        <span
          className="flex size-16 items-center justify-center rounded-full bg-destructive/10 [&_svg]:size-8 [&_svg]:text-destructive"
          aria-hidden
        >
          {bieuTuong}
        </span>
      )}
      <p className="max-w-sm text-[13px] leading-relaxed text-destructive">{moTa}</p>
      {hanhDong}
    </div>
  );
}
