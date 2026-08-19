#!/usr/bin/env node
/**
 * Cổng chống tái phát: hàm CSDL KHÔNG được chứa `delete`/`update` thiếu `where`.
 *
 * LỖI THẬT bắt được 19/08 — một câu `delete from private.release_pending
 * returning *` (migration #137) làm băng-rôn "Bản mới đã lên" chết câm ~12
 * tiếng. Supabase bật chốt `safeupdate` cho vai mà cửa công khai dùng: câu xoá
 * không có `where` bị TỪ CHỐI, kể cả bên trong hàm `security definer` (chốt đọc
 * thiết lập của PHIÊN, không đọc quyền của hàm). Hàm vỡ ⇒ cả giao dịch bị huỷ
 * ⇒ mất luôn cả dòng ghi trạng thái ⇒ lượt sau lại vỡ y hệt. Kẹt vĩnh viễn.
 *
 * Vì sao cần cổng máy: gõ tay thì nó CHẠY (vai quản trị không bị chốt), nên đọc
 * code và thử tay đều không lộ ra. Chỉ có quét toàn bộ mới thấy.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (env hoặc .env.local).");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});
await c.connect();
// Đặt hạn chờ khoá dù bộ này CHỈ ĐỌC: một câu ALTER TABLE đang xếp hàng chờ
// khoá độc quyền sẽ khiến MỌI truy vấn sau nó — kể cả SELECT không đụng gì —
// bị Postgres bắt xếp hàng theo sau (luật công bằng FIFO). Đã tái hiện được
// bằng tay, xem chú thích cùng chủ đề trong scripts/rls-smoke.mjs.
await c.query("set lock_timeout = '10s'");
const { rows } = await c.query(
  `select proname, prosrc from pg_proc where pronamespace = 'public'::regnamespace order by proname`,
);
await c.end();

// Bắt `delete from <bảng>` và `update <bảng> set …`, rồi soi TỚI HẾT CÂU LỆNH
// (dấu `;` kế tiếp, hoặc `)` đóng CTE) xem có `where` không.
//
// ⚠️ Bản đầu của công cụ này chỉ soi 60–200 ký tự sau chỗ khớp và BÁO OAN 12
// hàm — câu `update … set` nhiều cột thì `where` nằm xa hơn cửa sổ đó. Một cổng
// kiểm hay báo oan sẽ bị người ta tắt đi, nên nó tệ hơn là không có cổng nào.
const denHetCau = (kho, tu) => {
  let sau = 0;
  for (let i = tu; i < kho.length; i++) {
    const ch = kho[i];
    if (ch === "(") sau++;
    else if (ch === ")") {
      if (sau === 0) return kho.slice(tu, i);
      sau--;
    } else if (ch === ";" && sau === 0) return kho.slice(tu, i);
  }
  return kho.slice(tu);
};
const xau = [];
for (const { proname, prosrc } of rows) {
  const kho = prosrc.replace(/--[^\n]*/g, " "); // bỏ chú thích, tránh báo oan
  const quet = (re) => {
    for (const m of kho.matchAll(re)) {
      const than = denHetCau(kho, m.index + m[0].length).toLowerCase();
      if (!/\bwhere\b/.test(than)) xau.push([proname, m[0].replace(/\s+/g, " ")]);
    }
  };
  quet(/\bdelete\s+from\s+[a-zA-Z_."]+/gi);
  quet(/\bupdate\s+[a-zA-Z_."]+\s+set\b/gi);
}

if (xau.length === 0) {
  console.log(`✅ ${rows.length} hàm CSDL — không có câu xoá/sửa nào thiếu điều kiện.`);
  process.exit(0);
}
console.error(`❌ ${xau.length} câu xoá/sửa THIẾU \`where\` — Supabase sẽ từ chối khi gọi qua cửa công khai,`);
console.error("   và hàm vỡ sẽ kéo CẢ giao dịch đổ theo (đã mất 12 tiếng vì đúng lỗi này 19/08):");
for (const [ten, cau] of xau) console.error(`   · ${ten}(): ${cau} …`);
console.error("   Sửa: thêm điều kiện thật, hoặc `where true` nếu đúng ý là toàn bảng.");
process.exit(1);
