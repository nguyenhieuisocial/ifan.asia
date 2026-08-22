"use client";

/**
 * MẤT MẢNH MÃ SAU KHI LÊN BẢN MỚI — NHẬN MẶT, VÀ TỰ CỨU ĐÚNG MỘT LẦN.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CHUYỆN CÓ THẬT TRONG SỔ LỖI
 * ═══════════════════════════════════════════════════════════════════
 * Chủ tiệm mở tab từ sáng. Giữa ngày có bản mới lên máy chủ, những mảnh mã
 * (chunk) của bản cũ bị dọn đi. Người ta bấm sang màn khác, trình duyệt đi xin
 * một mảnh mã không còn tồn tại, và nhận về màn trắng kèm lời xin lỗi.
 *
 * Nút "Thử lại" trên màn đó KHÔNG chữa được: `reset()` của React chỉ dựng lại
 * cây thành phần bằng chính đống mã đang có trong máy — nó không đi lấy lại thứ
 * đã biến mất khỏi máy chủ. Người không rành máy tính không biết phải F5; họ kết
 * luận phần mềm hỏng rồi đóng luôn. Cách chữa duy nhất là TẢI LẠI TRANG: lượt
 * tải mới nhận bản HTML mới, trong đó là địa chỉ những mảnh mã thật sự đang có.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ VÌ SAO PHẢI CÓ CỜ CHẶN — BẪY NGUY HIỂM NHẤT CỦA CÁCH CHỮA NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Mảnh mã hỏng KHÔNG chỉ vì lên bản mới. Máy chủ tĩnh lỗi thật, mạng của tiệm
 * chặn nhầm tệp, CDN trả 404 — những ca đó tải lại bao nhiêu lần cũng hỏng y
 * nguyên. Tự tải lại mà không nhớ gì thì thành: hỏng → tải lại → hỏng → tải
 * lại, không có điểm dừng. Người dùng không kịp đọc một chữ nào, không bấm được
 * gì, và trang tự đập chính nó. Đó là hỏng NẶNG HƠN màn lỗi ban đầu.
 *
 * Nên luật ở đây là: cứu ĐÚNG MỘT LẦN. Ghi một dấu vào kho phiên TRƯỚC khi tải
 * lại; lượt sau thấy dấu còn mới thì đứng im, để màn lỗi hiện ra bình thường và
 * người dùng còn đường bấm đi chỗ khác.
 */

/** Dấu "vừa tự tải lại vì mất mảnh mã". Kho phiên đóng theo tab — đóng tab là hết. */
const KHOA_TU_CUU = "ifan:tu-tai-lai-mat-manh-ma";

/**
 * Dấu chỉ có giá trị 5 phút.
 *
 * ⚠️ HẾT HẠN CHÍNH LÀ CÁCH CỜ ĐƯỢC XOÁ. Nghe như đi đường vòng, nhưng cả ba cách
 *   "xoá cho tử tế" đều đã soát và đều là bẫy:
 *
 *   1. **Xoá ở màn chạy bình thường thì không có màn nào để xoá.** Khi cách cứu
 *      này CHẠY ĐÚNG, lượt tải sau dựng ra màn thật, không dựng màn lỗi — không
 *      có chỗ nào của mã này được chạy để mà xoá.
 *   2. **Xoá ở khung gốc (`app/providers.tsx`) thì hỏng nặng hơn không xoá.**
 *      Khung gốc VẪN dựng bao ngoài màn lỗi, mà effect chạy từ con lên cha: nó
 *      xoá dấu NGAY SAU khi màn lỗi vừa ghi. Cờ chặn thành vô dụng và ta được
 *      đúng cái vòng lặp vô tận nói ở trên.
 *   3. **Xoá lúc màn lỗi rời đi (cleanup của effect) thì chết ở chế độ dev.**
 *      React StrictMode (Next bật sẵn ở dev) chạy setup → cleanup → setup cho
 *      mỗi lần dựng. Cleanup đó xoá dấu vừa ghi, lượt tải sau lại thấy sạch trơn
 *      và tải lại tiếp — vòng lặp vô tận, chỉ khác là chỉ nổ trên máy người phát
 *      triển. Đã viết ra rồi gỡ đi, ghi lại ở đây để đừng ai thêm lại.
 *
 * Vì sao 5 phút: một vòng lặp thật quay lại sau vài giây nên luôn nằm gọn trong
 * cửa sổ và bị chặn ngay từ lần thứ hai; sau lần bị chặn thì màn lỗi đứng yên,
 * không còn gì tự chạy lại để mà lặp. Đổi lại, hai lần ra bản cách nhau dưới 5
 * phút thì lần sau đành hiện màn lỗi — cái giá có chủ ý, đổi lấy sự chắc chắn
 * rằng không bao giờ có vòng lặp. Một tab mở cả ngày vẫn được cứu cho MỖI lần
 * lên bản mới, chứ không phải chỉ một lần trong cả đời tab.
 */
const HAN_DAU_MS = 5 * 60_000;

/**
 * Dấu hiệu nhận mặt lỗi mất mảnh mã.
 *
 * ⚠️ KHÔNG chỉ dựa vào `error.name === "ChunkLoadError"`. Bản chạy của Turbopack
 *   CÓ đặt tên đó (đọc hàm dựng lỗi `Failed to load chunk …` trong
 *   `node_modules/next/dist/bundle-analyzer/_next/static/chunks/turbopack-*.js`),
 *   nhưng cái tên là thứ dễ rụng nhất trên đường đi: lỗi bị bọc thêm một lớp, bị
 *   dựng lại từ vết gọi hàm, hoặc do chính trình duyệt ném ra khi `import()` động
 *   hỏng — những lúc đó chỉ còn LỜI LỖI. Sổ lỗi của bản chạy thật ghi nguyên văn
 *   "Failed to load chunk /_next/static/chunks/….js from module 964893", nên bắt
 *   theo lời lỗi mới là đường chắc; bắt theo tên chỉ là lớp thứ hai cho nhanh.
 */
const DAU_HIEU = [
  /failed to load chunk/i, // Turbopack (Next 16) — đúng câu đang có trong sổ lỗi
  /loading (css )?chunk .+ failed/i, // webpack, phòng khi có lúc quay về
  /importing a module script failed/i, // Safari
  /error loading dynamically imported module/i, // Firefox
  /failed to fetch dynamically imported module/i, // Chrome
];

/** Lỗi này có phải là "mảnh mã không tải được" không. */
export function laLoiMatManhMa(loi: unknown): boolean {
  // Turbopack gắn lỗi gốc vào `cause`, và React/Next có thể bọc thêm một lớp
  // nữa. Đi hết chuỗi `cause` để không bỏ sót; chặn ở 5 tầng vì chuỗi này có thể
  // tự trỏ vòng và ta đang chạy trên đường xử lý một lỗi, không được treo máy.
  let hien: unknown = loi;
  for (let tang = 0; tang < 5; tang++) {
    if (!(hien instanceof Error)) return false;
    const loiHien = hien;
    if (loiHien.name === "ChunkLoadError") return true;
    const chu = String(loiHien.message ?? "");
    if (DAU_HIEU.some((dau) => dau.test(chu))) return true;
    hien = loiHien.cause;
  }
  return false;
}

/**
 * Gặp lỗi mất mảnh mã thì tự tải lại trang — nhiều nhất một lần trong 5 phút.
 * Lỗi khác thì không đụng tới, cứ để màn lỗi làm việc của nó.
 */
export function tuCuuKhiMatManhMa(loi: unknown): void {
  if (!laLoiMatManhMa(loi)) return;

  const bayGio = Date.now();
  try {
    const dauCu = Number(sessionStorage.getItem(KHOA_TU_CUU));
    // Vừa cứu xong mà vẫn hỏng ⇒ không phải chuyện lên bản mới. Dừng tay, để màn
    // lỗi hiện ra cho người dùng còn thấy đường mà đi.
    if (dauCu && bayGio - dauCu < HAN_DAU_MS) return;
    sessionStorage.setItem(KHOA_TU_CUU, String(bayGio));
  } catch {
    // ⚠️ Trình duyệt chặn kho lưu trữ (ẩn danh, chặn cookie, khung nhúng) thì
    //   `sessionStorage` NÉM LỖI. Ở đây là đường xử lý một lỗi đã xảy ra rồi —
    //   ném thêm một lỗi nữa là nuốt mất lỗi gốc.
    //   Và quan trọng hơn: không ghi được dấu nghĩa là KHÔNG CÓ PHANH, nên chọn
    //   không tải lại. Thà một màn lỗi nhìn thấy được còn hơn một vòng lặp mà
    //   người dùng không có cách nào thoát ra.
    return;
  }

  window.location.reload();
}
