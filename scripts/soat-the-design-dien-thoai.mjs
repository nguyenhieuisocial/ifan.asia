#!/usr/bin/env node
/**
 * SOÁT THẺ THIẾT KẾ Ở KHỔ ĐIỆN THOẠI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * BA lần liên tiếp một thẻ thiết kế **tự vi phạm lời khuyên của chính nó**:
 *   · `man-nhap-don-kieu-chung-tu` viết "lưới 6 cột không sống nổi trên điện
 *     thoại" rồi ship đúng một lưới 6 cột — 16 chỗ bị cắt ở 375px.
 *   · `ban-do-cos-ifan-vs-misa` — 57 chỗ tràn.
 *   · `sau-khuon-man` — bảng cột kéo thả đẩy cả trang rộng 386px.
 * Cả ba đều lọt qua `soat-the-design.mjs`, vì cổng đó chỉ đọc CẤU TRÚC HTML,
 * không mở trình duyệt nên không thể biết cái gì rộng bao nhiêu.
 *
 * ⚠️ KHÔNG TRÀN ≠ ĐỌC ĐƯỢC. Lần sửa thứ nhất của `sau-khuon-man` chữa được
 *   tràn bằng cách bóp cột chữ xuống **36px** — phép đo tràn báo "sạch" trong
 *   khi thẻ hỏng nặng hơn trước. Vì vậy file này đo HAI chuyện, và chuyện thứ
 *   hai mới là chuyện dễ trượt:
 *     1. Trang có phải cuộn ngang không.
 *     2. Có khối chữ nào bị bóp hẹp tới mức không đọc được không.
 *
 * ⚠️ MỘT NGOẠI LỆ CÓ THẬT: khối cuộn ngang CỐ Ý (bảng cột kiểu kanban, bảng
 *   rộng bọc trong `overflow-x:auto`). Nó cuộn BÊN TRONG khung của nó, còn
 *   trang thì không cuộn — nên phép đo chỉ soi `scrollWidth` của TRANG, không
 *   soi từng khối.
 *
 *   node scripts/soat-the-design-dien-thoai.mjs                 — soát tất cả
 *   node scripts/soat-the-design-dien-thoai.mjs a.html b.html   — soát vài thẻ
 *
 * CỐ Ý không gắn vào CI: cần trình duyệt thật, và thẻ là bản phác chứ không
 * phải mã chạy. Đây là cổng chạy tay TRƯỚC KHI commit thẻ.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const GOC_THE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "design-system");
const KHO = 375; // iPhone SE / máy Android phổ thông — khổ hẹp nhất còn phải phục vụ.
/**
 * Ngưỡng "hẹp tới mức hỏng" = 140px.
 * Ở cỡ chữ 12px, 140px chứa khoảng **22 ký tự** một dòng. Từ tiếng Việt dài
 * trung bình ~5 ký tự, tức khoảng **4 từ mỗi dòng** — vẫn đọc được. Dưới nữa
 * thì xuống còn 1–3 từ mỗi dòng, là chỗ mắt bắt đầu vấp.
 * Đã cân trên số thật: các chỗ hỏng nặng đo được nằm ở 96–131px; các chỗ chỉ
 * "hơi chật" nằm ở 150–167px. Ngưỡng đặt vào giữa hai cụm đó.
 */
const HEP_NHAT = 140;
const DAI_NHAT = 60; // chỉ xét khối có ít nhất chừng này ký tự — nhãn ngắn thì hẹp là bình thường.
/**
 * Chữ nằm TRONG một khung thiết bị vẽ minh hoạ thì hẹp là CỐ Ý — thẻ đang vẽ
 * lại màn điện thoại rộng 290px, nên cột chữ 130px bên trong là đúng cái người
 * dùng sẽ thấy thật. Bắt lỗi ở đó là bắt nhầm bản vẽ.
 */
const TRONG_KHUNG_VE = ".phone, .dt, .mockup, .frame, .khung-dt, .man";

const doiSo = process.argv.slice(2);
const cacThe = (doiSo.length ? doiSo : readdirSync(GOC_THE).filter((f) => f.endsWith(".html")))
  .map((f) => path.resolve(GOC_THE, path.basename(f)));

const trinhDuyet = await chromium.launch({
  headless: true,
  executablePath: "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe",
});
const boiCanh = await trinhDuyet.newContext({ viewport: { width: KHO, height: 900 } });
const trang = await boiCanh.newPage();

let soLoi = 0;
for (const the of cacThe) {
  await trang.goto(pathToFileURL(the).href, { waitUntil: "load" });
  await trang.waitForTimeout(120);

  const ket = await trang.evaluate(
    ({ KHO, HEP_NHAT, DAI_NHAT, TRONG_KHUNG_VE }) => {
      const rong = document.documentElement.scrollWidth;

      // Thủ phạm tràn = phần tử NÔNG NHẤT tự nó vượt khung. Con nó tràn theo
      // chỉ là hệ quả, in ra chỉ làm nhiễu.
      const thuPham = [];
      const di = (el) => {
        if (thuPham.length >= 3) return;
        const h = el.getBoundingClientRect();
        if (h.width > 0 && h.right > KHO + 1) {
          thuPham.push(
            `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).slice(0, 22) : ""}` +
              ` → mép phải ${Math.round(h.right)}px · "${(el.textContent || "").trim().slice(0, 30)}"`,
          );
          return;
        }
        for (const c of el.children) di(c);
      };
      if (rong > KHO + 1) di(document.body);

      const bop = [];
      for (const el of document.querySelectorAll("p, li, td")) {
        if (el.closest(TRONG_KHUNG_VE)) continue;
        const h = el.getBoundingClientRect();
        const chu = (el.textContent || "").trim();
        if (h.width > 0 && h.width < HEP_NHAT && chu.length > DAI_NHAT)
          bop.push(`${el.tagName.toLowerCase()} rộng ${Math.round(h.width)}px cho ${chu.length} ký tự — "${chu.slice(0, 30)}"`);
        if (bop.length >= 3) break;
      }
      return { rong, thuPham, bop };
    },
    { KHO, HEP_NHAT, DAI_NHAT, TRONG_KHUNG_VE },
  );

  const ten = path.basename(the);
  const hong = ket.rong > KHO + 1 || ket.bop.length > 0;
  if (!hong) continue;
  soLoi += 1;
  console.log(`\n✗ ${ten}`);
  if (ket.rong > KHO + 1) {
    console.log(`   trang phải cuộn ngang: rộng ${ket.rong}px / khung ${KHO}px`);
    ket.thuPham.forEach((x) => console.log("     " + x));
  }
  if (ket.bop.length) {
    console.log(`   khối chữ bị bóp hẹp (không tràn nhưng không đọc được):`);
    ket.bop.forEach((x) => console.log("     " + x));
  }
}

await trinhDuyet.close();
console.log(
  soLoi === 0
    ? `\nĐã soát ${cacThe.length} thẻ ở khổ ${KHO}px · 0 vấn đề.`
    : `\nĐã soát ${cacThe.length} thẻ ở khổ ${KHO}px · ${soLoi} thẻ có vấn đề.`,
);
process.exit(soLoi ? 1 : 0);
