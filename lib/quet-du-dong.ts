/**
 * QUÉT ĐỦ DÒNG — vá một lớp bệnh đã đo được, không phải phòng xa.
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ════════════════════════════════════════════════════════════════════
 *
 * Cửa dữ liệu của kho này (PostgREST) **cắt ở 1.000 dòng và trả về
 * THÀNH CÔNG** — không cờ, không cảnh báo, không lỗi. Đã đo trực tiếp: xin
 * 5.000 dòng vẫn chỉ nhận 1.000, kèm mã thành công.
 *
 * Hậu quả đo trên dữ liệu thật (Cafe Góc Phố, tháng 5/2026):
 *   · lãi gộp thật 282.209.000đ — màn hình hiện ~33.040.000đ, **thiếu 88%**
 *   · sổ quỹ tháng đó 2.110 phiếu — chỉ 1.000 được cộng, **mất 53%**
 *   · số sai này còn chảy sang Bảng lương làm căn cứ tính thưởng
 *
 * Chua nhất: mấy đoạn mã bị hại đều **có sẵn chú thích khẳng định "quét ĐỦ,
 * KHÔNG cắt"**. Lời hứa ngược hẳn việc mã đang làm — nên người đọc sau tin
 * và không kiểm lại. Đó là lý do lỗi này sống được nhiều tháng.
 *
 * ════════════════════════════════════════════════════════════════════
 * HAI ĐIỀU BẮT BUỘC, ĐỪNG BỎ
 * ════════════════════════════════════════════════════════════════════
 *
 * 1. **PHẢI có `.order()` ổn định trước khi gọi.** Cắt trang mà không sắp
 *    xếp thì bỏ rơi dòng nào là TUỲ LÚC — cùng một màn, bấm tải lại ra số
 *    khác. Sổ quỹ đang dính đúng chỗ này. Hàm dưới không tự thêm `.order()`
 *    vì nó không biết bảng nào có cột gì; nó chỉ **bắt người gọi phải nghĩ**.
 *
 * 2. **Có trần cứng.** Quét vô hạn ở một tiệm khổng lồ là đổi một lỗi im
 *    lặng lấy một trang treo. Chạm trần thì **NÉM LỖI**, không trả về số
 *    cộng thiếu — vì con số thiếu trông y hệt con số đúng.
 */

/** Mỗi lượt xin 1.000 — đúng bằng trần của cửa dữ liệu, ít lượt gọi nhất. */
const MOI_LUOT = 1000;

/**
 * Trần cứng: 200.000 dòng. Một tiệm bán 500 đơn/ngày, mỗi đơn 3 dòng hàng thì
 * chạm mốc này sau hơn 4 tháng — tức là quá xa nhu cầu "một kỳ báo cáo", đủ
 * chỗ cho tiệm lớn nhất mình dám nhận. Chạm trần là dấu hiệu phép cộng nên
 * chuyển hẳn xuống CSDL, không phải dấu hiệu nên nới trần.
 */
const TRAN_CUNG = 200_000;

/**
 * Chỉ cần đúng một khả năng: xin được một khoảng dòng. Khai hẹp như vậy để
 * hàm này dùng được cho MỌI bảng mà không phải kéo theo kiểu của lược đồ.
 */
type CoTheXinKhoang<T> = {
  range: (tu: number, den: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

/**
 * Quét đủ mọi dòng khớp bộ lọc, xin nhiều lượt cho tới hết.
 *
 * @param tao  Hàm dựng lại truy vấn cho MỖI lượt. Nhận truy vấn mới mỗi lần
 *             vì builder của Supabase dùng một lần là hỏng — tái dùng một
 *             builder cho lượt thứ hai sẽ ném lỗi khó hiểu.
 * @param ten  Tên chỗ gọi, chỉ dùng để câu lỗi nói được nó gãy ở đâu.
 */
export async function quetDuDong<T>(
  tao: () => CoTheXinKhoang<T>,
  ten: string,
): Promise<T[]> {
  const ra: T[] = [];
  for (let tu = 0; ; tu += MOI_LUOT) {
    const { data, error } = await tao().range(tu, tu + MOI_LUOT - 1);
    if (error) throw new Error(`${ten}: ${error.message}`);
    const lo = data ?? [];
    ra.push(...lo);
    // Lượt trả về ít hơn một lô đầy ⇒ đã hết dòng.
    if (lo.length < MOI_LUOT) return ra;
    if (ra.length >= TRAN_CUNG) {
      throw new Error(
        `${ten}: vượt ${TRAN_CUNG.toLocaleString("vi")} dòng. ` +
          `KHÔNG trả về số cộng thiếu — hãy chuyển phép cộng này xuống CSDL.`,
      );
    }
  }
}
