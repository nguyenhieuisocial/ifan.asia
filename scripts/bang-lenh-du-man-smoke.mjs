#!/usr/bin/env node
/**
 * CỔNG: MỌI màn cố định trong /app đều tới được bằng bảng lệnh (Ctrl K).
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Đo 22/08/2026: bảng lệnh với tới **27 trong 66** màn cố định. 39 màn còn
 * lại — gần hết là Cài đặt, cộng 4 báo cáo và 2 màn kho — chỉ tới được bằng
 * cách bấm vào màn cha rồi dò danh sách bằng mắt.
 *
 * Đây là kiểu hỏng **không ai báo**: màn vẫn chạy, vẫn có đường vào, chỉ là
 * đường ấy dài. Nó chỉ lộ ra khi số màn tăng gấp đôi và người dùng bắt đầu
 * không tìm nổi thứ họ biết chắc là có. Kế hoạch phủ 20 khối MISA đưa số màn
 * lên khoảng 150 (thẻ `ke-hoach-ux-cos`), nên phải chặn từ bây giờ.
 *
 * ⚠️ CÁI CỔNG NÀY CANH LÀ "QUÊN KHAI", KHÔNG PHẢI "GÕ SAI ĐƯỜNG DẪN".
 *   Đường dẫn hỏng đã có `bang-lenh-smoke.mjs` mở từng cái bằng trình duyệt
 *   thật. Ở đây chỉ đối chiếu DANH SÁCH MÀN TRÊN ĐĨA với DANH SÁCH MÀN ĐÃ KHAI
 *   — nhanh, không cần trình duyệt, chạy được trong CI.
 *
 * ⚠️ DANH SÁCH BỎ QUA PHẢI CÓ LÝ DO, VÀ PHẢI ĐÚNG.
 *   Một danh sách bỏ qua cứ dài dần ra là cách êm ái nhất để giết một cái
 *   cổng. Mỗi dòng dưới đây ghi rõ vì sao màn đó KHÔNG PHẢI chỗ để đi tới —
 *   và cổng tự bắt đỏ nếu có dòng bỏ qua nào trỏ tới màn không còn tồn tại,
 *   để danh sách không tích rác.
 *
 * Chạy: node scripts/bang-lenh-du-man-smoke.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOC_APP = path.join(GOC, "app", "app");

/** Màn CÓ THẬT nhưng cố ý không phải đích đến của bảng lệnh. */
const BO_QUA = new Map([
  ["/app", "Màn nhà — chính là chỗ bảng lệnh mở ra từ đó. Một dòng 'đi tới màn nhà' trong bảng lệnh là dòng thừa."],
  ["/app/share", "Màn nhận nội dung chia sẻ từ app khác. Chỉ tới được khi hệ điều hành chuyển vào kèm tệp; mở tay ra trang rỗng."],
  ["/app/orders/new", "Đã có trong bảng lệnh ở mục VIỆC ('Tạo đơn'), không cần thêm một dòng MÀN trùng nghĩa."],
  ["/app/approvals/new", "Như trên — đã có ở mục VIỆC ('Yêu cầu duyệt')."],
]);

function quet(thu, ra = []) {
  for (const x of readdirSync(thu)) {
    const d = path.join(thu, x);
    if (statSync(d).isDirectory()) quet(d, ra);
    else ra.push(d);
  }
  return ra;
}

/** Mọi màn cố định (bỏ trang chi tiết `[id]` — chúng tới từ danh sách cha). */
const manTrenDia = quet(GOC_APP)
  .filter((f) => f.endsWith(`${path.sep}page.tsx`))
  .map((f) => {
    const con = path.relative(GOC_APP, path.dirname(f)).replace(/\\/g, "/");
    return con === "" ? "/app" : `/app/${con}`;
  })
  .filter((d) => !d.includes("["))
  .sort();

/**
 * Ba nguồn khai màn. Đọc bằng regex trên MÃ NGUỒN thay vì import: ba file kia
 * đều là module client của Next (`"use client"`, import `next-intl`), nạp thẳng
 * bằng node sẽ nổ — mà thứ cần đối chiếu chỉ là danh sách đường dẫn.
 */
const layHref = (duong) =>
  [...readFileSync(path.join(GOC, duong), "utf8").matchAll(/href:\s*"(\/app[^"?]*)"/g)].map((m) => m[1]);

const daKhai = new Set([
  ...layHref("app/app/sidebar-nav.tsx"),
  ...layHref("app/app/settings/access.ts"),
  ...layHref("components/global-search/lenh.ts"),
]);

const thieu = manTrenDia.filter((d) => !daKhai.has(d) && !BO_QUA.has(d));
const boQuaChet = [...BO_QUA.keys()].filter((d) => !manTrenDia.includes(d));

if (thieu.length === 0 && boQuaChet.length === 0) {
  console.log(
    `✓ ${manTrenDia.length} màn cố định · ${daKhai.size} đường dẫn đã khai · ` +
      `${BO_QUA.size} bỏ qua có lý do · 0 màn bị quên.`,
  );
  process.exit(0);
}

if (thieu.length) {
  console.log(`✗ ${thieu.length} màn KHÔNG tới được bằng bảng lệnh và cũng không được khai là cố ý bỏ qua:\n`);
  thieu.forEach((d) => console.log("   " + d));
  console.log(
    `\nKhai nó vào MỘT trong ba chỗ:\n` +
      `   · app/app/sidebar-nav.tsx        — nếu là màn dùng hằng ngày (cột trái đang có 27 mục, đừng để phình)\n` +
      `   · app/app/settings/access.ts     — nếu là màn khai báo\n` +
      `   · components/global-search/lenh.ts (MAN_PHU) — nếu là màn con của một mục khác\n` +
      `Hoặc thêm vào BO_QUA trong chính file này, KÈM LÝ DO thật.`,
  );
}
if (boQuaChet.length) {
  console.log(`\n✗ ${boQuaChet.length} dòng BO_QUA trỏ tới màn không còn tồn tại — xoá đi kẻo danh sách tích rác:\n`);
  boQuaChet.forEach((d) => console.log("   " + d));
}
process.exit(1);
