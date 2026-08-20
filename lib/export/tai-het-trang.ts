/**
 * Tải HẾT các trang của một truy vấn xuất file — không để file thiếu dòng mà im.
 *
 * VÌ SAO CẦN: PostgREST chặn mỗi lượt gọi ở `max_rows` (dự án đặt 1.000). Ba
 * route xuất CSV trước đây gọi `.select(...).order(...)` trần, không phân trang,
 * nên tiệm có 1.400 đơn tải về đúng 1.000 dòng — file trông sạch sẽ, không một
 * dòng cảnh báo. Chủ tiệm mang đi đối soát với kế toán và lệch ~400 đơn.
 *
 * Đây là ĐÚNG lớp bệnh đã vá cho file Excel danh sách khách (nó có vòng lặp con
 * trỏ). Ba route CSV bị bỏ sót. Gom vào một hàm để lần sau sửa một chỗ là xong,
 * thay vì ba bản chép tay rồi lệch nhau.
 *
 * Trả kèm `chamTran` để nơi gọi CÓ THỂ NÓI RA khi đụng trần an toàn — luật của
 * kho: cắt thì phải báo, không cắt lặng.
 */
export async function taiHetTrang<T>(
  // `PromiseLike` chứ không phải `Promise`: builder của Supabase là "thenable"
  // — await được nhưng không có `.catch`/`.finally`, nên khai `Promise` là
  // TypeScript từ chối ngay tại chỗ gọi.
  layTrang: (
    tu: number,
    den: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  { moiTrang = 1000, tranAnToan = 50_000 } = {},
): Promise<{ rows: T[]; chamTran: boolean }> {
  const rows: T[] = [];
  for (let tu = 0; tu < tranAnToan; tu += moiTrang) {
    const { data, error } = await layTrang(tu, tu + moiTrang - 1);
    if (error) throw new Error(error.message);
    // Hình dạng dòng do NƠI GỌI khai (`taiHetTrang<OrderRow>`): các quan hệ lồng
    // nhau của PostgREST được suy ra thành mảng dù thực tế là một-một, nên ép
    // kiểu ở đây thay vì bắt mỗi route tự vật lộn với kiểu suy diễn.
    const trang = (data ?? []) as T[];
    rows.push(...trang);
    // Trang non hơn kích thước yêu cầu ⇒ đã hết dữ liệu, dừng.
    if (trang.length < moiTrang) return { rows, chamTran: false };
  }
  // Chạm trần an toàn: còn dữ liệu nhưng thôi, đừng để một cú bấm kéo cả CSDL
  // về máy chủ web. Nơi gọi phải nói ra cho người dùng biết file chưa đủ.
  return { rows, chamTran: true };
}
