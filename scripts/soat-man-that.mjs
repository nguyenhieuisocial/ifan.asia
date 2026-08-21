#!/usr/bin/env node
/**
 * Cổng soát: MỞ TỪNG MÀN TRÊN BẢN CHẠY THẬT VÀ NHÌN.
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO DỰNG — mọi cổng đều xanh mà màn thật vẫn hỏng
 * ════════════════════════════════════════════════════════════════════
 *
 * Ngày 21/08 founder chốt nghĩa của chữ "xong": *"Xong tức là tôi thấy được,
 * chạy được thực tế và không có bug!"*
 *
 * Ngay hôm đó, hai lần liên tiếp, cổng báo xanh mà màn thật vẫn sai:
 *   · màn Chia sẻ báo cáo — 5 câu chữ hỏng, 5 lỗi đỏ, hiện MÃ MÁY cho người
 *     dùng; cả `soat-chu-thieu`, `soat-hai-ban-dich`, dựng bản đều xanh
 *   · màn Mã QR — vừa sửa xong cho gọn, thẻ vẽ đúng, cổng xanh; mở ra thì ảnh
 *     mã vẫn chiếm trọn một hàng riêng, ăn mất khoảng bằng cả một dòng
 *
 * Không cổng nào đọc-mã bắt được hai thứ đó, vì cả hai chỉ tồn tại LÚC CHẠY.
 * Cổng này mở màn thật bằng trình duyệt, khổ điện thoại, rồi hỏi ba câu:
 *
 *   1. có chữ nào còn là MÃ MÁY không (`settings.abc.def` thay vì tiếng Việt)
 *   2. có LỖI ĐỎ nào trong bảng điều khiển không
 *   3. một màn điện thoại THẤY ĐƯỢC MẤY DÒNG (chuẩn mật độ 21/08: ≥ 5)
 *
 * ⚠️ **Không chạy trong CI.** Nó cần mạng, cần bản chạy sống và cần tài khoản
 *   demo — ba thứ CI không nên phụ thuộc. Chạy tay trước khi tuyên bố "xong".
 *
 * ⚠️ **Chỗ phép đo này có thể sai:** "dòng" được đoán bằng cấu trúc (con của
 *   một khối có ≥3 anh em cùng thẻ cùng lớp). Màn dựng khác kiểu sẽ đếm lệch,
 *   và màn KHÔNG CÓ DỮ LIỆU đếm ra 0 — đó là trạng thái rỗng, không phải lỗi.
 *   Cột "dòng thấy" là để ĐỌC, không phải để chặn.
 *
 * Dùng:
 *   node scripts/soat-man-that.mjs
 *   NEN=http://localhost:3000 node scripts/soat-man-that.mjs
 *   TAI_KHOAN=a@b.c MAT_KHAU=xxx node scripts/soat-man-that.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
/**
 * Tên các nhánh GỐC của bộ chữ (`settings`, `contacts`, `common`…).
 * Dùng để phân biệt MỘT KHOÁ DỊCH BỊ LỘ với một chuỗi chấm bình thường.
 * Bản đầu coi mọi chuỗi kiểu `a.b` là mã máy và báo oan hai màn:
 *   · Đường nối — `appointment.arrived` là TÊN SỰ KIỆN, hiện ra là đúng
 *   · Nhân sự  — `nguyen.thu.hang` là TÊN ĐĂNG NHẬP của người thật
 * ⚠️ Cái giá: khoá thiếu nằm dưới một nhánh gốc KHÔNG tồn tại sẽ lọt lưới.
 */
const NHANH_GOC = Object.keys(
  JSON.parse(readFileSync(path.join(GOC, "messages", "vi.json"), "utf8")),
);

// Bản chạy là `ifan-web.vercel.app` — CHỦ Ý của founder, không phải tạm bợ.
// ⛔ Đừng trỏ cổng này sang `ifan.asia`: địa chỉ đó nằm ngoài phạm vi và founder
//    đã dặn rõ không truy cập, không can thiệp. Founder sẽ báo khi đổi.
const NEN = process.env.NEN ?? "https://ifan-web.vercel.app";
// Cent Browser — luật máy (CLAUDE.md §7): không dùng Chrome/Chromium mặc định.
const CENT =
  process.env.TRINH_DUYET ??
  "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";
// Tài khoản demo, vốn đã nằm công khai trong `scripts/seed-demo.mjs`.
const TAI_KHOAN = process.env.TAI_KHOAN ?? "demo.ifan.2026@gmail.com";
const MAT_KHAU = process.env.MAT_KHAU ?? "DemoIfan#2026";

const MAN = [
  ["Hôm nay", "/app/today"],
  ["Tổng quan", "/app"],
  ["Hộp thư", "/app/inbox"],
  ["Khách hàng", "/app/contacts"],
  ["Cơ hội", "/app/deals"],
  ["Lịch hẹn", "/app/calendar"],
  ["Đơn hàng", "/app/orders"],
  ["Mặt hàng", "/app/items"],
  ["Sổ quỹ", "/app/cashbook"],
  ["Két sắt", "/app/ketsat"],
  ["Bảng lương", "/app/payroll"],
  ["Hoa hồng", "/app/commissions"],
  ["Tuyển dụng", "/app/recruitment"],
  ["Duyệt", "/app/approvals"],
  ["Hợp đồng", "/app/contracts"],
  ["Dự án", "/app/projects"],
  ["Khách thân thiết", "/app/loyalty"],
  ["Hài lòng", "/app/csat"],
  ["Thông báo", "/app/notifications"],
  ["Báo cáo", "/app/reports"],
  ["Cài đặt", "/app/settings"],
  ["Mã QR", "/app/settings/qr"],
  ["Đường nối", "/app/settings/integrations"],
  ["Nhân sự", "/app/settings/team"],
  ["Chia sẻ báo cáo", "/app/settings/report-shares"],
  ["Nhãn", "/app/settings/tags"],
  ["Câu trả lời sẵn", "/app/settings/replies"],
  ["Kho tri thức", "/app/settings/knowledge"],
  ["Việc tự chạy", "/app/settings/workflows"],
  ["Thùng rác", "/app/settings/trash"],
];

const browser = await chromium.launch({ executablePath: CENT, headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "vi-VN" });
const page = await ctx.newPage();
const loi = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  // Bỏ tiếng ồn KHÔNG phải lỗi của mình: ảnh 404 của bên thứ ba, cảnh báo
  // tiện ích trình duyệt. Giữ mọi thứ còn lại.
  if (/favicon|Failed to load resource: net::ERR_/.test(t)) return;
  loi.push(t.slice(0, 150));
});

await page.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
await page.fill("#identifier", TAI_KHOAN);
await page.fill("#password", MAT_KHAU);
await page.click('button[type="submit"]');
await page.waitForURL(/\/app/, { timeout: 45000 }).catch(() => {});
if (!page.url().includes("/app")) {
  console.error(`❌ Không đăng nhập được vào ${NEN} — dừng.`);
  await browser.close();
  process.exit(1);
}

const hong = [];
console.log(`Mở ${MAN.length} màn trên ${NEN}, khổ điện thoại 375×812.\n`);
console.log("MÀN".padEnd(20) + "DÒNG THẤY".padEnd(12) + "CAO/DÒNG".padEnd(11) + "MÃ MÁY / LỖI ĐỎ");

for (const [ten, duong] of MAN) {
  loi.length = 0;
  try {
    await page.goto(NEN + duong, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1000);
  } catch {
    hong.push({ ten, viec: "không mở được" });
    console.log(ten.padEnd(20) + "(không mở được)");
    continue;
  }

  const d = await page.evaluate((nhanhGoc) => {
    const ung = [];
    for (const cha of document.querySelectorAll("main *")) {
      const con = [...cha.children];
      if (con.length < 3) continue;
      const nhom = new Map();
      for (const c of con) {
        const ma = c.tagName + "|" + (c.className || "");
        nhom.set(ma, (nhom.get(ma) ?? 0) + 1);
      }
      for (const [ma, n] of nhom) {
        if (n >= 3) ung.push(...con.filter((c) => c.tagName + "|" + (c.className || "") === ma));
      }
    }
    const hien = ung.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.height > 24 && r.width > 100;
    });
    const cao = hien.length
      ? Math.round(hien.reduce((s, e) => s + e.getBoundingClientRect().height, 0) / hien.length)
      : 0;
    // CHỮ BỊ BÓ TỚI MỨC VỠ DỌC — lỗi bố cục tệ nhất và mắt thường mới thấy.
    // Màn Hợp đồng 21/08: bốn cột chen nhau trong 375px bóp cột chữ hẹp tới
    // mức TÊN NGƯỜI vỡ thành ba hàng ("Đặng / Thuỳ / My"). Cách đo: một mẩu
    // chữ NGẮN (≤ 22 ký tự, không khoảng trắng thừa) mà chiếm từ 3 hàng trở
    // lên thì gần như chắc chắn đang bị ép, không phải xuống dòng tự nhiên.
    const voChu = [];
    for (const e of document.querySelectorAll("main span, main p, main div, main a")) {
      if (e.children.length > 0) continue;
      const t = (e.textContent ?? "").trim();
      if (t.length === 0 || t.length > 22) continue;
      // Số hàng = (chiều cao trong lòng − khoảng đệm) ÷ chiều cao một dòng.
      // ⚠️ Hai cách sai đã thử và đã bỏ:
      //   · `chiều cao phần tử ÷ chiều cao dòng` — tính cả khoảng đệm, báo oan
      //     ngay: ô "Kéo thẻ vào đây" cao 65px vì `py-6`, chữ chỉ MỘT hàng.
      //   · đếm hình chữ nhật của Range — một hàng chữ có nhiều mẩu text rời
      //     (số, dấu cách, chữ dịch) cho ra nhiều hình, nên đếm ra ba hàng ở
      //     những chỗ thật ra nằm gọn một hàng.
      const cs = getComputedStyle(e);
      const cao1 = parseFloat(cs.lineHeight) || 20;
      // `clientHeight` bằng 0 với phần tử INLINE (span thường) — dùng nó là
      // bỏ sót gần hết chữ trong kho. Lấy chiều cao hình bao, và chỉ trừ
      // khoảng đệm khi phần tử KHÔNG phải inline (inline không cộng đệm dọc
      // vào chiều cao dòng).
      const inline = cs.display === "inline";
      const dem = inline ? 0 : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const soHang = Math.round((e.getBoundingClientRect().height - dem) / cao1);
      if (soHang >= 3) voChu.push(t);
    }

    const chu = document.querySelector("main")?.innerText ?? "";
    // MÃ MÁY = chuỗi kiểu `a.b.c` không dấu, không khoảng trắng — hình dạng của
    // một khoá dịch chưa có câu chữ.
    const maMay = [...new Set(chu.match(/\b[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){1,4}\b/g) ?? [])]
      .filter((x) => !/^\d/.test(x))
      .filter((x) => nhanhGoc.includes(x.split(".")[0]));
    return {
      tong: hien.length,
      trongMan: hien.filter((e) => e.getBoundingClientRect().top < 812).length,
      cao,
      maMay,
      voChu: [...new Set(voChu)].slice(0, 3),
    };
  }, NHANH_GOC);

  const xau = [];
  if (d.maMay.length) xau.push(`MÃ MÁY: ${d.maMay.slice(0, 3).join(", ")}`);
  if (d.voChu.length) xau.push(`CHỮ VỠ DỌC: ${d.voChu.join(" · ")}`);
  if (loi.length) xau.push(`${loi.length} lỗi đỏ`);
  if (xau.length) hong.push({ ten, viec: xau.join(" · "), loi: loi[0] });

  console.log(
    ten.padEnd(20) +
      `${d.trongMan}/${d.tong}`.padEnd(12) +
      `${d.cao || "—"}px`.padEnd(11) +
      (xau.length ? "❌ " + xau.join(" · ") : "—"),
  );
}

await browser.close();

if (hong.length === 0) {
  console.log(`\n✅ ${MAN.length} màn: không màn nào hiện mã máy, không màn nào có lỗi đỏ.`);
  process.exit(0);
}
console.error(`\n❌ ${hong.length}/${MAN.length} MÀN CÓ VẤN ĐỀ KHI MỞ THẬT:\n`);
for (const h of hong) {
  console.error(`   ${h.ten} — ${h.viec}`);
  if (h.loi) console.error(`      ↳ ${h.loi}`);
}
console.error(`
   CHỮ VỠ DỌC = một mẩu chữ ngắn bị ép thành ba hàng trở lên. Gần như
   luôn là dấu hiệu có quá nhiều cột chen nhau trên một hàng.

   MÃ MÁY = câu chữ chưa có, người dùng đọc phải tên khoá.
   Chữa: thêm câu vào CẢ HAI \`messages/vi.json\` và \`messages/en.json\`,
   rồi \`node scripts/soat-chu-thieu.mjs\`.`);
process.exit(1);
