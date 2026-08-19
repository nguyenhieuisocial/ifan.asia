#!/usr/bin/env node
/**
 * Cổng canh KỶ LUẬT của chính các bộ kiểm.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Cổng kiểm tự động chạy trên ĐÚNG kho dữ liệu mà web đang phục vụ khách thật.
 * Đó là chỗ yếu đã biết (đã ghi thành việc theo dõi riêng: tách kho cho việc
 * kiểm — cần quyết định chi phí của founder). Chừng nào chưa tách được, hai
 * luật dưới đây là thứ giữ cho việc dùng chung không gây hại:
 *
 *   LUẬT 1 — Bộ kiểm nào đụng kho dữ liệu thì PHẢI đặt hạn chờ khoá.
 *     Ngày 19/08 đã phải chờ-thử-lại tới 10 lượt khi áp bản vá, vì một lượt
 *     kiểm đang giữ khoá. Không có hạn chờ thì một lượt kiểm treo sẽ chặn cả
 *     việc sửa lỗi khẩn.
 *
 *   LUẬT 2 — Bộ kiểm nào MỞ giao dịch thì phải đóng bằng `rollback`, không
 *     `commit`. Ngoại lệ duy nhất là công cụ áp migration — nó PHẢI ghi thật.
 *
 * ⚠️ GIỚI HẠN, nói thẳng: đây là soát CHỮ trong mã nguồn, không phải soát hành
 * vi lúc chạy. Nó bắt được kiểu quên phổ biến, KHÔNG chứng minh được bộ kiểm
 * không để lại rác. Muốn chắc chuyện đó thì phải tách kho dữ liệu.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const CI = path.join(GOC, ".github", "workflows", "ci.yml");

/** Công cụ áp migration PHẢI ghi thật — đó là việc của nó. */
const MIEN_ROLLBACK = new Set(["ap-migration.mjs"]);

const yml = readFileSync(CI, "utf8");
const files = [...new Set(yml.match(/scripts\/[a-z0-9-]+\.mjs/g) ?? [])].sort();

const loi = [];
let nDb = 0;

for (const rel of files) {
  let src;
  try {
    src = readFileSync(path.join(GOC, rel), "utf8");
  } catch {
    loi.push([rel, "cổng kiểm gọi file này nhưng file KHÔNG tồn tại"]);
    continue;
  }
  const ten = path.basename(rel);
  if (!src.includes("SUPABASE_DB_URL")) continue; // không đụng kho dữ liệu
  nDb += 1;

  if (!src.includes("lock_timeout")) {
    loi.push([rel, "đụng kho dữ liệu nhưng KHÔNG đặt lock_timeout (luật 1)"]);
  }

  // Chỉ xét bộ kiểm CÓ mở giao dịch — bộ chỉ-đọc không cần.
  const moGiaoDich = /query\(\s*["'`]begin/i.test(src);
  if (moGiaoDich && !MIEN_ROLLBACK.has(ten)) {
    if (!/query\(\s*["'`]rollback["'`]\s*\)/i.test(src)) {
      loi.push([rel, "mở giao dịch nhưng không thấy `rollback` đóng lại (luật 2)"]);
    }
    if (/query\(\s*["'`]commit/i.test(src)) {
      loi.push([rel, "GHI THẬT vào kho dữ liệu bằng `commit` — chỉ công cụ áp migration được phép (luật 2)"]);
    }
  }
}

if (loi.length === 0) {
  console.log(
    `✅ ${nDb}/${files.length} bộ kiểm đụng kho dữ liệu — tất cả đều có hạn chờ khoá và đóng bằng rollback.`,
  );
  process.exit(0);
}

console.error(`❌ ${loi.length} vi phạm kỷ luật bộ kiểm:`);
for (const [f, ly] of loi) console.error(`   · ${f} — ${ly}`);
console.error("");
console.error("   Cổng kiểm chạy trên ĐÚNG kho dữ liệu của khách thật. Hai luật này là thứ");
console.error("   giữ cho việc dùng chung không gây hại — xem đầu file để biết vì sao.");
process.exit(1);
