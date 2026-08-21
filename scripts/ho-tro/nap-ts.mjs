/**
 * Móc phân giải để cổng kiểm chạy được ĐÚNG file .ts trong kho.
 *
 * Node không tự thêm đuôi `.ts` cho `import "./datetime"`, còn Next thì có.
 * Móc này chỉ thêm đuôi — không chép file, không sửa gì. Quan trọng: cổng phải
 * thử đúng mã đang chạy, không phải một bản dịch có thể lệch.
 *
 * Dùng: node --import ./scripts/ho-tro/dang-ky-nap-ts.mjs <cong>.mjs
 */
// Móc phân giải: Node không tự thêm đuôi .ts cho `import "./datetime"`, còn
// Next thì có. Móc này chỉ thêm đuôi để chạy được ĐÚNG file trong kho — không
// chép, không sửa.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) {
      return next(specifier + ".ts", context);
    }
    if (specifier.startsWith("@/")) {
      return next("./" + specifier.slice(2) + ".ts", { ...context, parentURL: new URL("./x.ts", "file:///C:/dev/ifan.asia/").href });
    }
    throw e;
  }
}
