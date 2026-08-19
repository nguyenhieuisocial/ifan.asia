#!/usr/bin/env node
/**
 * CỔNG: không trang công khai nào được TRÔI NGANG trên điện thoại.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CỔNG NÀY TỒN TẠI
 * ═══════════════════════════════════════════════════════════════════
 * Đo 20/08 trên bản đang phục vụ, khổ 375px và 320px: **5/5 trang tiếp thị
 * công khai đều trôi ngang** — trang chủ · bảng giá · tính năng · lộ trình ·
 * trang ngành. Thủ phạm chung là một hàng 6 mục ở chân trang dùng chung, rộng
 * 358px trong khung 375px trừ lề.
 *
 * Đây là lần thứ HAI cùng lớp bệnh. Việc #39 đã sửa một thủ phạm KHÁC (khối
 * banner đầu trang) hồi đầu tháng — sửa một lần rồi thôi, **không để lại cổng
 * nào canh**. Nên thủ phạm thứ hai nằm im từ đó tới nay, trên đúng những trang
 * mà khách nhìn thấy TRƯỚC KHI quyết định có dùng iFan không.
 *
 * Đây là trang bán hàng: trang trôi ngang trên điện thoại là ấn tượng đầu tiên
 * của một khách hàng tiềm năng, và phần lớn khách của iFan vào bằng điện thoại.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ĐO GÌ, VÀ VÌ SAO CHỈ ĐO ĐÚNG THỨ NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Chỉ hỏi MỘT câu: `document.documentElement.scrollWidth > clientWidth` —
 * tức TRANG có trượt sang ngang được không.
 *
 * CỐ Ý không đo "có phần tử nào vượt khung không". Một bảng rộng nằm trong hộp
 * `overflow-x: auto` thì vượt khung là ĐÚNG THIẾT KẾ (bảng giá đang vậy: bảng
 * 520px trong hộp cuộn riêng — người dùng vuốt trong bảng, trang đứng yên).
 * Đo nhầm thứ đó thì cổng báo đỏ oan và sẽ bị tắt.
 *
 * Bài học 20/08: đo một dấu hiệu GẦN ĐÚNG rồi kết luận là cách sai kinh điển —
 * đã dính ba lần trong một ngày ở bộ thẻ design. Ở đây câu hỏi thật đúng bằng
 * câu đo được: trang có trượt ngang không.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CHẠY Ở ĐÂU
 * ═══════════════════════════════════════════════════════════════════
 *   node scripts/soat-trang-cong-khai-dien-thoai.mjs                 # bản đang phục vụ
 *   DIA_CHI=http://localhost:3000 node scripts/soat-trang-cong-khai-dien-thoai.mjs
 *
 * Trên máy Windows dùng Cent Browser (luật máy, CLAUDE.md §7). Máy khác dùng
 * Chromium đi kèm playwright.
 *
 * `playwright` KHÔNG nằm trong `package.json` — cùng lý do với
 * `soat-the-tren-dien-thoai.mjs`: nó chỉ phục vụ việc soát, không phải thư viện
 * của sản phẩm. Thiếu thì cổng in lệnh cài và THOÁT MÃ 1, không im lặng bỏ qua.
 */
import { existsSync } from "node:fs";

const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";
const DIA_CHI = (process.env.DIA_CHI || "https://ifan-web.vercel.app").replace(/\/$/, "");

/** Trang công khai — khách thấy TRƯỚC khi đăng nhập. Thêm trang mới thì thêm ở đây. */
const TRANG = ["/", "/bang-gia", "/tinh-nang", "/lo-trinh", "/nganh/spa", "/privacy", "/terms"];

/** Hai khổ: 375px là iPhone phổ thông, 320px là máy nhỏ nhất còn dùng ở VN. */
const KHO = [375, 320];

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("❌ Không nạp được `playwright` — cổng này KHÔNG chạy được.");
  console.error("   Cổng không chạy được thì bằng không có, nên đây là ĐỎ chứ không phải bỏ qua.");
  console.error("   Cài:  npm i --no-save --no-package-lock playwright@1.62.1");
  console.error("         npx playwright install chromium   # bỏ qua nếu dùng Cent Browser");
  process.exit(1);
}

let duongTrinhDuyet = null;
if (process.platform === "win32") {
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở:\n     ${CENT}`);
    console.error("   Luật máy (CLAUDE.md §7): duyệt tự động phải dùng Cent Browser.");
    process.exit(1);
  }
  duongTrinhDuyet = CENT;
}

const browser = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});

const hong = [];
let soDo = 0;

try {
  for (const rong of KHO) {
    const page = await browser.newPage({ viewport: { width: rong, height: 812 } });
    for (const duong of TRANG) {
      let res;
      try {
        res = await page.goto(DIA_CHI + duong, { waitUntil: "networkidle", timeout: 45000 });
      } catch (e) {
        console.error(`  ⚠ ${rong}px ${duong} — không tải được: ${e.message.slice(0, 80)}`);
        hong.push({ duong, rong, ly_do: "không tải được" });
        continue;
      }
      if (!res || res.status() >= 400) {
        console.error(`  ⚠ ${rong}px ${duong} — HTTP ${res?.status() ?? "?"}`);
        hong.push({ duong, rong, ly_do: `HTTP ${res?.status() ?? "?"}` });
        continue;
      }
      soDo++;
      const kq = await page.evaluate(() => {
        const d = document.documentElement;
        if (d.scrollWidth <= d.clientWidth) return null;
        // Tìm phần tử vượt XA NHẤT mà KHÔNG nằm trong hộp cuộn nào — đó là thủ phạm.
        let xa = null;
        for (const el of document.querySelectorAll("*")) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          if (b.right <= d.clientWidth + 1) continue;
          let cha = el.parentElement, trongHopCuon = false;
          while (cha) {
            if (/(auto|scroll)/.test(getComputedStyle(cha).overflowX)) { trongHopCuon = true; break; }
            cha = cha.parentElement;
          }
          if (trongHopCuon) continue;
          if (!xa || b.right > xa.phai)
            xa = {
              phai: Math.round(b.right),
              the: el.tagName.toLowerCase(),
              lop: String(el.className ?? "").slice(0, 60),
              chu: (el.textContent ?? "").trim().slice(0, 30),
            };
        }
        return { cuon: d.scrollWidth, khung: d.clientWidth, xa };
      });
      if (kq) {
        hong.push({ duong, rong, ...kq });
        console.error(
          `  ❌ ${rong}px ${duong} — trôi ngang ${kq.cuon}/${kq.khung}px` +
            (kq.xa ? `\n       thủ phạm: <${kq.xa.the} class="${kq.xa.lop}"> mép phải ${kq.xa.phai}px  "${kq.xa.chu}"` : ""),
        );
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (hong.length > 0) {
  console.error(`\n❌ ${hong.length} lượt đo TRÔI NGANG (${DIA_CHI})`);
  console.error("   Trang bán hàng trôi ngang trên điện thoại là ấn tượng đầu của khách.");
  console.error("   SỬA: cho hàng xuống dòng (`flex-wrap`) hoặc bọc phần rộng vào hộp");
  console.error("        `overflow-x-auto` — bọc rồi thì cổng này KHÔNG tính là lỗi nữa.");
  process.exit(1);
}
console.log(`✅ ${soDo} lượt đo (${TRANG.length} trang × ${KHO.length} khổ) — không trang nào trôi ngang. Địa chỉ: ${DIA_CHI}`);
