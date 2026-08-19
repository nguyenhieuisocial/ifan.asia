#!/usr/bin/env node
/**
 * Cổng canh: thẻ design sửa ở máy mà QUÊN đẩy lên Claude Design.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI CANH GIÁN TIẾP
 * ═══════════════════════════════════════════════════════════════════
 * Đẩy thẻ lên Claude Design đi qua phiên đăng nhập claude.ai của founder.
 * Phiên đó có thật và đủ quyền — nhưng nó nằm trong máy founder, KHÔNG nằm
 * trên máy chạy cổng kiểm của GitHub. Nên cổng kiểm không thể tự hỏi thẳng
 * Claude Design "trên đó đang có gì".
 *
 * Cách vòng qua: mỗi lần đẩy xong thì GHI LẠI DẤU VÂN TAY của đúng bộ thẻ vừa
 * đẩy (`design-system/.dong-bo.json`, có trong git). Cổng kiểm so dấu vân tay
 * của thẻ hiện tại với sổ đó. Lệch = có thẻ sửa/thêm/xoá sau lần đẩy cuối.
 *
 * Nó KHÔNG chứng minh được "trên đó đúng" (ai đó có thể sửa thẳng trên web),
 * nhưng nó bắt đúng con bệnh đã xảy ra THẬT: sửa ở máy rồi quên đẩy. Đo 19/08:
 * 4 thẻ mới nhất chưa hề lên, 3 thẻ nói sai về code đang chạy — không gì báo.
 *
 * Dùng:
 *   node scripts/soat-dong-bo-the.mjs         → kiểm (đỏ nếu lệch)
 *   node scripts/soat-dong-bo-the.mjs --ghi   → ghi sổ, CHỈ chạy NGAY SAU khi đẩy
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const THU_MUC = path.join(GOC, "design-system");
const SO = path.join(THU_MUC, ".dong-bo.json");

const vanTay = () => {
  const ra = {};
  for (const f of readdirSync(THU_MUC).filter((x) => x.endsWith(".html")).sort()) {
    ra[f] = createHash("sha256").update(readFileSync(path.join(THU_MUC, f))).digest("hex").slice(0, 16);
  }
  return ra;
};

const nay = vanTay();

if (process.argv.includes("--ghi")) {
  writeFileSync(SO, JSON.stringify({ soThe: Object.keys(nay).length, the: nay }, null, 2) + "\n");
  console.log(`✅ Đã ghi sổ ${Object.keys(nay).length} thẻ. Nhớ commit \`design-system/.dong-bo.json\`.`);
  process.exit(0);
}

let cu;
try {
  cu = JSON.parse(readFileSync(SO, "utf8")).the;
} catch {
  console.error("❌ Chưa có sổ đồng bộ. Đẩy thẻ lên Claude Design rồi chạy:");
  console.error("   node scripts/soat-dong-bo-the.mjs --ghi");
  process.exit(1);
}

const them = Object.keys(nay).filter((f) => !(f in cu));
const bo = Object.keys(cu).filter((f) => !(f in nay));
const doi = Object.keys(nay).filter((f) => f in cu && cu[f] !== nay[f]);

if (!them.length && !bo.length && !doi.length) {
  console.log(`✅ ${Object.keys(nay).length} thẻ khớp sổ — không có thẻ nào sửa sau lần đẩy cuối.`);
  process.exit(0);
}

console.error("❌ Có thẻ design đổi sau lần đẩy lên Claude Design gần nhất:");
for (const f of them) console.error(`   + THÊM MỚI   ${f}`);
for (const f of doi) console.error(`   ~ ĐÃ SỬA     ${f}`);
for (const f of bo) console.error(`   - ĐÃ XOÁ     ${f}`);
console.error("");
console.error("   Luật kho (AGENTS.md): sửa thẻ ở git thì phải đẩy lên Claude Design NGAY TRONG CÙNG LƯỢT.");
console.error("   Đẩy bằng DesignSync (dự án `iFan Design System`), rồi chạy:");
console.error("     node scripts/soat-dong-bo-the.mjs --ghi");
console.error("   ⚠️ ĐỪNG chạy --ghi để làm xanh cổng khi CHƯA đẩy — như vậy là tự bịt mắt mình.");
process.exit(1);
