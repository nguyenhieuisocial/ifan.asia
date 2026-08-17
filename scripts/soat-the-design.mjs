#!/usr/bin/env node
/**
 * Soát cấu trúc mọi thẻ trong `design-system/`.
 *
 * VÌ SAO CÓ FILE NÀY (17/08): kỷ luật thẻ ở `design-system/_KE-HOACH-THE.md`
 * mục 1 ghi *"Vẽ → `check-ds.mjs` phải PASS → soi mắt → đồng bộ → commit"*.
 * Nhưng `check-ds.mjs` **CHƯA TỪNG TỒN TẠI** — tìm cả cây thư mục lẫn toàn
 * bộ lịch sử git đều không có. 111 thẻ đã vẽ dưới một cổng kiểm KHÔNG CÓ THẬT.
 *
 * Đây tệ hơn "quên viết test": luật ghi rõ có cổng, nên người sau đọc luật
 * rồi TIN là thẻ đã được kiểm. Cổng không tồn tại không phân biệt được với
 * cổng luôn PASS — đúng họ với luật D3 (cổng chưa từng thấy đỏ).
 *
 * Chạy lần đầu bắt ngay 2 lỗi thật đang nằm im: `man-lich-hen.html` và
 * `man-dat-lich-tu-chat.html` còn dán nhãn "(chưa có code)" ở tiêu đề, trong
 * khi cả hai màn đã CHẠY THẬT từ 13/08 (V2 đóng trọn 6/6). Nhãn sai ở thẻ
 * thiết kế làm người đọc tưởng tính năng chưa có.
 *
 *   node scripts/soat-the-design.mjs              — soát tất cả
 *   node scripts/soat-the-design.mjs a.html b.html — soát vài thẻ
 *
 * CỐ Ý không gắn vào CI: thẻ là bản phác, không phải mã chạy. Đây là cổng
 * chạy tay trước khi commit thẻ — nhưng CÓ THẬT, khác cái tên ma trước đó.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = "C:/dev/ifan.asia/design-system";
// Lọc cờ ra khỏi danh sách tên thẻ — nếu không `--do-phu` bị hiểu là tên file.
const thamSo = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ds = thamSo.length ? thamSo : readdirSync(DIR).filter((f) => f.endsWith(".html"));

// BẢN ĐỒ MÀN → THẺ. Bắt buộc KHAI TƯỜNG MINH: mỗi màn dưới `app/app/**/page.tsx`
// phải có một dòng ở đây — hoặc trỏ tới thẻ, hoặc để `null` kèm lý do miễn.
// Màn MỚI chưa khai ⇒ cổng `--do-phu` báo ĐỎ.
// Cố ý KHÔNG đoán thẻ theo tên thư mục: đoán sai thì cổng vừa kêu oan vừa bỏ
// lọt, mà cổng kêu oan là cổng sẽ bị tắt đi.
const BAN_DO_THE = {
  "app/app/items": "man-hang-hoa.html",
  "app/app/orders": "man-don-hang.html",
  // Tách thẻ (17/08): `man-thu-tien-vietqr.html` giữ CƠ CHẾ thu tiền (3 cách
  // trả, QR, thu nhiều lần) — nó là một KHỐI bên trong trang, không phải cả
  // trang. Trang chi tiết đơn có đường dẫn riêng nên có thẻ riêng, giữ nếp
  // "một thẻ = một màn" mà cả kho đang theo.
  "app/app/orders/[id]": "man-chi-tiet-don.html",
  "app/app/orders/new": "man-don-hang.html",
  "app/app/cashbook": "man-so-quy.html",
  "app/app/reports/gross-margin": "man-lai-gop.html",
  "app/app/settings/payments": "man-nhan-thanh-toan.html",
};
/** Thẻ nào đang mô tả một màn ĐÃ CÓ CODE — dùng cho luật 7. */
const MAN_CO_CODE = new Set(Object.values(BAN_DO_THE).filter(Boolean));

let loi = 0;
for (const ten of ds) {
  const s = readFileSync(path.join(DIR, ten), "utf8");
  const bug = [];

  // 1. Marker @dsCard ở DÒNG ĐẦU — Design System pane dựng thẻ từ đây
  if (!/^<!-- @dsCard group="[^"]+" -->/.test(s)) bug.push("thiếu/sai @dsCard ở dòng đầu");

  // 2. Có <title> (tên hiện trên claude.ai)
  if (!/<title>[^<]+<\/title>/.test(s)) bug.push("thiếu <title>");

  // 3. Thẻ mở/đóng div cân nhau (bắt lỗi HTML vỡ khung)
  const mo = (s.match(/<div\b/g) || []).length;
  const dong = (s.match(/<\/div>/g) || []).length;
  if (mo !== dong) bug.push(`div lệch: ${mo} mở / ${dong} đóng`);

  // 4. KHÔNG tải tài nguyên ngoài (thẻ phải tự chứa, CSP chặn)
  if (/<(script|link|img)\b[^>]*\b(src|href)=["']https?:/i.test(s)) bug.push("có tài nguyên ngoài");

  // 5. Màn chưa có code PHẢI tự khai — luật kỷ luật thẻ mục 3
  const chuaCode = /chưa có code/i.test(s.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  if (chuaCode && !/CHƯA CÓ CODE/.test(s)) bug.push("title nói 'chưa có code' nhưng thân bài không tự khai");

  // 6. Có khối ghi chú giải thích quyết định
  if (!/class="note"/.test(s)) bug.push("thiếu <p class='note'> giải thích");

  // 7. Màn ĐÃ CÓ CODE mà tiêu đề vẫn dán "(chưa có code)" — chiều NGƯỢC của
  // luật 5. Bản đầu chỉ bắt được chiều xuôi nên cả 3 thẻ V3 lọt lưới: vẽ lúc
  // 13:55, code chạy thật lúc 16:00–17:00, tiêu đề vẫn khai "chưa có code" và
  // KHÔNG có gì kêu (việc #161, đợt 43).
  if (chuaCode && MAN_CO_CODE.has(ten)) {
    loi++;
    console.log(`✗ ${ten}\n    tiêu đề khai "chưa có code" nhưng màn ĐÃ CHẠY THẬT — bỏ nhãn đi`);
    continue;
  }

  if (bug.length) { loi++; console.log(`✗ ${ten}\n    ${bug.join("\n    ")}`); }
}

function quetMan(goc, tuongDoi = "") {
  const ra = [];
  for (const m of readdirSync(path.join(goc, tuongDoi), { withFileTypes: true })) {
    const con = tuongDoi ? `${tuongDoi}/${m.name}` : m.name;
    if (m.isDirectory()) ra.push(...quetMan(goc, con));
    else if (m.name === "page.tsx") ra.push(tuongDoi || ".");
  }
  return ra;
}

if (process.argv.includes("--do-phu")) {
  const GOC_APP = path.join(path.dirname(DIR), "app", "app");
  const man = quetMan(GOC_APP).map((d) => (d === "." ? "app/app" : `app/app/${d}`));
  const thieu = [];
  for (const m of man) {
    const the = BAN_DO_THE[m];
    if (the === undefined) { thieu.push(`${m} — CHƯA KHAI vào BAN_DO_THE`); continue; }
    if (the === null) continue; // miễn tường minh
    if (!ds.includes(the) && !readdirSync(DIR).includes(the)) thieu.push(`${m} → ${the} (thẻ KHÔNG tồn tại)`);
  }
  if (thieu.length) {
    loi += thieu.length;
    console.log(`\n✗ ĐỘ PHỦ THẺ — ${thieu.length} màn chưa có thẻ:`);
    for (const t of thieu) console.log(`    ${t}`);
  } else {
    console.log(`\n✓ Độ phủ thẻ: ${man.length} màn đều đã khai thẻ.`);
  }
}

console.log(`\nĐã soát ${ds.length} thẻ · ${loi} vấn đề.`);
process.exit(loi ? 1 : 0);
