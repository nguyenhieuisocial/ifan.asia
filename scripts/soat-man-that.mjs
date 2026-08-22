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
import { chromium } from "playwright-core";
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
/**
 * ⚠️ NHẬN CẢ THAM SỐ DÒNG LỆNH. Trước 22/08 file chỉ đọc biến môi trường `NEN`,
 *   nên `node scripts/soat-man-that.mjs http://localhost:3000` chạy êm ru mà
 *   vẫn đo BẢN ĐÃ PHÁT HÀNH. Tôi mất ba lượt đo mới nhận ra: sửa lỗi ở máy,
 *   chạy cổng, cổng vẫn đỏ y nguyên — vì nó đang nhìn một máy chủ khác.
 *   Dòng in ngay dưới đã ghi rõ địa chỉ; giờ tham số cũng có tác dụng thật.
 */
const NEN = process.argv[2] ?? process.env.NEN ?? "https://ifan-web.vercel.app";
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
  // Bổ sung 22/08 — 10 màn có thật nhưng chưa từng được mở ở cổng này.
  // Danh sách cũ dừng ở 30/66 màn; những màn KHÔNG ai mở thử là những màn
  // hỏng lâu nhất mà không ai biết.
  ["Công ty", "/app/companies"],
  ["Công nợ", "/app/cong-no"],
  ["Kho", "/app/stock"],
  ["Nhập hàng", "/app/stock/purchases"],
  ["Kiểm kho", "/app/stock/stocktake"],
  ["Nhắn nội bộ", "/app/chat"],
  ["Sự kiện marketing", "/app/events"],
  ["Công việc", "/app/tasks"],
  ["Nhân sự & Chấm công", "/app/team"],
  ["Báo cáo lãi gộp", "/app/reports/gross-margin"],
  // ── Bổ sung 22/08 — 26 màn cuối cùng chưa từng được mở ở cổng này ──────────
  // Đợt 22/08 trước đó nâng 30 → 40 màn, nhưng kho có 67 màn cố định. Tức là
  // vẫn còn 26 màn KHÔNG ai mở thử lần nào (bỏ `/app/share` — màn nhận chia sẻ
  // từ hệ điều hành, mở tay ra trang rỗng nên không đo được gì). Sau đợt này
  // cổng mở HẾT 66/67 màn: không còn màn nào hỏng trong im lặng vì không ai nhìn.
  // Tên tiếng Việt lấy đúng nhãn màn đang dùng trong `messages/vi.json`.
  ["Gửi yêu cầu duyệt", "/app/approvals/new"],
  ["Bán tại quầy", "/app/ban"],
  ["Trùng lặp khách", "/app/contacts/duplicates"],
  ["Tạo đơn mới", "/app/orders/new"],
  ["Mục tiêu tháng", "/app/reports/kpi"],
  ["Vì sao thua", "/app/reports/lost-reasons"],
  ["Nguồn nào ra tiền", "/app/reports/sources"],
  ["Tài khoản của bạn", "/app/settings/account"],
  ["AI trực việc", "/app/settings/ai-autopilot"],
  ["Gói của tôi", "/app/settings/billing"],
  ["Kênh kết nối", "/app/settings/channels"],
  ["Hộp chat website", "/app/settings/channels/livechat"],
  ["Mặt tiền & nhận khách", "/app/settings/channels/storefront"],
  ["Yêu cầu xoá dữ liệu", "/app/settings/data-erasure"],
  ["Nhật ký tải dữ liệu", "/app/settings/data-export-log"],
  ["Trần giảm giá", "/app/settings/discount-caps"],
  ["Biểu mẫu", "/app/settings/forms"],
  ["Ngành & giao diện", "/app/settings/industry"],
  ["Nhật ký đăng nhập", "/app/settings/login-log"],
  ["Thông báo qua Zalo", "/app/settings/notifications"],
  ["Nhận thanh toán", "/app/settings/payments"],
  ["Dịch vụ & Tài nguyên", "/app/settings/services"],
  ["Cam kết phản hồi", "/app/settings/sla"],
  ["Nhật ký hỗ trợ", "/app/settings/support-log"],
  ["Thương hiệu tiệm", "/app/settings/thuong-hieu"],
  ["Phân hạng khách", "/app/settings/tiers"],
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
      /**
       * ĐẾM SỐ HÀNG CHỮ THẬT — bằng cách hỏi trình duyệt chữ nằm ở mấy độ cao
       * khác nhau, KHÔNG phải chia chiều cao hộp cho chiều cao dòng.
       *
       * ⚠️ Ba cách đã thử, hai cách đầu SAI:
       *   ① `chiều cao phần tử ÷ chiều cao dòng` — tính cả khoảng đệm, báo oan
       *      ngay: ô "Kéo thẻ vào đây" cao 65px vì `py-6`, chữ chỉ MỘT hàng.
       *   ② `(chiều cao − khoảng đệm) ÷ chiều cao dòng` — đỡ hơn nhưng vẫn sai
       *      với hộp CÓ CHIỀU CAO CỐ ĐỊNH. Đo 22/08 ở màn Thương hiệu tiệm: ô
       *      logo `size-15` (60×60) chứa chữ "chưa có"; 60 ÷ 15 = 4 nên phép đo
       *      la lên "vỡ 4 hàng", trong khi chữ nằm gọn một hàng giữa ô.
       *   ③ đếm hình chữ nhật của Range — một hàng chữ có nhiều mẩu text rời
       *      (số, dấu cách, chữ dịch) cho ra nhiều hình. Đây là lý do cách này
       *      từng bị bỏ. **Gom theo TOẠ ĐỘ TRÊN thì hết vấn đề đó**: nhiều mẩu
       *      trên cùng một hàng có cùng `top`, nên đếm số `top` KHÁC NHAU chính
       *      là đếm số hàng.
       */
      const r = document.createRange();
      r.selectNodeContents(e);
      const mocTren = new Set();
      for (const h of r.getClientRects()) {
        if (h.width < 0.5 || h.height < 0.5) continue;
        mocTren.add(Math.round(h.top));
      }
      r.detach?.();
      const soHang = mocTren.size;
      if (soHang >= 3) voChu.push(t);
    }

    const chu = document.querySelector("main")?.innerText ?? "";
    // MÃ MÁY = chuỗi kiểu `a.b.c` không dấu, không khoảng trắng — hình dạng của
    // một khoá dịch chưa có câu chữ.
    const maMay = [...new Set(chu.match(/\b[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){1,4}\b/g) ?? [])]
      .filter((x) => !/^\d/.test(x))
      // ⚠️ TÊN TỆP KHÔNG PHẢI KHOÁ DỊCH. `livechat.js` trong đoạn mã nhúng
      //   website trông y hệt một khoá dịch, và `livechat` đúng là một nhánh
      //   gốc trong messages/vi.json — nên phép dò báo nhầm ở màn Hộp chat
      //   website (đo 22/08). Khoá dịch không bao giờ kết thúc bằng đuôi tệp.
      .filter((x) => !/\.(js|mjs|ts|tsx|css|json|html|png|jpe?g|svg|webp|ico|pdf|csv|xlsx?)$/i.test(x))
      .filter((x) => nhanhGoc.includes(x.split(".")[0]));
    /**
     * TRÀN NGANG — cuộn ngang trên điện thoại là MẤT CHỮ TRONG IM LẶNG.
     *
     * Người dùng không biết bên phải còn gì; họ chỉ thấy câu bị cụt. Đây là
     * lớp lỗi đã bắt được ba lần chỉ trong hai ngày (thẻ thiết kế màn nhập
     * đơn, bản đồ COS, sáu khuôn màn) — nhưng chưa cổng nào canh trên MÀN
     * THẬT, chỉ canh trên thẻ vẽ.
     *
     * Ngoại lệ CÓ THẬT: khối cuộn ngang cố ý (bảng cột kiểu kanban). Nó cuộn
     * BÊN TRONG khung của nó, còn TRANG thì không — nên chỉ đo `scrollWidth`
     * của trang, không đo từng khối.
     */
    const rongTrang = document.documentElement.scrollWidth;
    const thuPhamTran = [];
    if (rongTrang > window.innerWidth + 1) {
      const di = (el) => {
        if (thuPhamTran.length >= 2) return;
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.right > window.innerWidth + 1) {
          thuPhamTran.push(
            `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).slice(0, 20) : ""}` +
              `→${Math.round(b.right)}px "${(el.textContent ?? "").trim().slice(0, 22)}"`,
          );
          return;
        }
        for (const c of el.children) di(c);
      };
      di(document.body);
    }

    return {
      tong: hien.length,
      trongMan: hien.filter((e) => e.getBoundingClientRect().top < 812).length,
      cao,
      maMay,
      voChu: [...new Set(voChu)].slice(0, 3),
      rongTrang,
      khungTrang: window.innerWidth,
      thuPhamTran,
    };
  }, NHANH_GOC);

  const xau = [];
  if (d.maMay.length) xau.push(`MÃ MÁY: ${d.maMay.slice(0, 3).join(", ")}`);
  if (d.voChu.length) xau.push(`CHỮ VỠ DỌC: ${d.voChu.join(" · ")}`);
  if (d.rongTrang > d.khungTrang + 1)
    xau.push(`TRÀN NGANG ${d.rongTrang}px/${d.khungTrang}px: ${d.thuPhamTran.join(" · ")}`);
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
   TRÀN NGANG = trang phải cuộn ngang ở khổ 375px. Người dùng không biết
   bên phải còn gì, họ chỉ thấy câu bị cụt. Khối cuộn ngang CỐ Ý (bảng cột
   kéo thả) không tính — cổng chỉ đo bề rộng của cả TRANG.

   CHỮ VỠ DỌC = một mẩu chữ ngắn bị ép thành ba hàng trở lên. Gần như
   luôn là dấu hiệu có quá nhiều cột chen nhau trên một hàng.

   MÃ MÁY = câu chữ chưa có, người dùng đọc phải tên khoá.
   Chữa: thêm câu vào CẢ HAI \`messages/vi.json\` và \`messages/en.json\`,
   rồi \`node scripts/soat-chu-thieu.mjs\`.`);
process.exit(1);
