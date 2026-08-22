/**
 * Móc phân giải để cổng kiểm chạy được ĐÚNG file .ts trong kho.
 *
 * Node không tự thêm đuôi `.ts` cho `import "./datetime"`, còn Next thì có.
 * Móc này chỉ thêm đuôi — không chép file, không sửa gì. Quan trọng: cổng phải
 * thử đúng mã đang chạy, không phải một bản dịch có thể lệch.
 *
 * Dùng: node --import ./scripts/ho-tro/dang-ky-nap-ts.mjs <cong>.mjs
 *
 * ⚠️ GỐC KHO PHẢI TỰ TÌM, KHÔNG ĐƯỢC NHÚNG CỨNG. Bản đầu ghi thẳng
 *   `file:///C:/dev/ifan.asia/` — đường dẫn trên máy một người. Nó chạy ngon ở
 *   máy đó và HỎNG HẲN trên máy CI (Linux, không có ổ C), với câu lỗi khó lần
 *   ra: *"Cannot find module '/C:/dev/ifan.asia/lib/booking/schedule.ts'"*.
 *   Lỗi này nằm im rất lâu vì mấy bước trước nó trong CI đang đỏ, nên bước này
 *   chưa từng chạy tới — hỏng mà không ai thấy.
 *   File này nằm ở `scripts/ho-tro/`, nên gốc kho là hai cấp trên.
 */
const GOC_KHO = new URL("../../", import.meta.url).href;

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) {
      return next(specifier + ".ts", context);
    }
    if (specifier.startsWith("@/")) {
      // `x.ts` là một tên giả chỉ để làm mốc "một file nằm ở gốc kho" — Node
      // cần một parentURL để phân giải đường dẫn tương đối, không cần file thật.
      return next("./" + specifier.slice(2) + ".ts", {
        ...context,
        parentURL: new URL("./x.ts", GOC_KHO).href,
      });
    }
    throw e;
  }
}
