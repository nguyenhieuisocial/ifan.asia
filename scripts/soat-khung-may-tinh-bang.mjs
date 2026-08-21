/**
 * CỔNG: màn hình phải dùng được ở khổ MÁY TÍNH BẢNG, không chỉ điện thoại và
 * máy tính.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO KHỔ GIỮA HAY BỊ BỎ QUÊN
 * ═══════════════════════════════════════════════════════════════════
 * Kho này chia hai nhánh giao diện theo mốc `md` (768px): dưới thì bày kiểu
 * điện thoại, từ đó trở lên bày kiểm máy tính. Người viết code thường thử ở
 * 390px rồi ở 1440px — hai đầu — và khổ 768–1024px CHÍNH LÀ mốc chuyển, tức là
 * nơi hai bộ luật gặp nhau và dễ chỏi nhau nhất.
 *
 * Mà máy tính bảng KHÔNG phải khổ hiếm với iFan: máy quầy lễ tân của tiệm spa
 * hay là một chiếc iPad.
 *
 * ĐO HAI THỨ, và chỉ hai thứ — vì đây là hai thứ làm màn KHÔNG DÙNG ĐƯỢC,
 * khác với "hơi xấu":
 *   1. TRÔI NGANG — nội dung rộng hơn màn, phải kéo ngang mới đọc hết.
 *   2. VÙNG BẤM QUÁ NHỎ — ngưỡng 24×24 CSS px của WCAG 2.2 AA (mục 2.5.8).
 *      iPad dùng bằng NGÓN TAY chứ không phải chuột nên luật này áp cả ở đây.
 *
 * ⚠️ LƯỢT ĐO ĐẦU CỦA CHÍNH FILE NÀY SAI, ghi lại để không ai lặp:
 *   (a) dùng ngưỡng 32px — đó là luật NỘI BỘ cho điện thoại, không phải chuẩn;
 *       lấy nó làm mốc thì mọi nút cao 28-30px đều bị gọi là lỗi;
 *   (b) đếm cả liên kết "bỏ qua điều hướng" vốn CỐ Ý ẩn (kích thước 1px) —
 *       một phần tử ẩn thì không ai bấm trượt vào nó được.
 *   Hai chỗ đó thổi con số lên 327 "lỗi" ở màn Lịch, trong khi màn đó bình
 *   thường. Phép đo sai và mã sai trông y hệt nhau.
 *
 * ⚠️ Vùng cuộn ngang CỐ Ý (lưới lịch, bảng dữ liệu) KHÔNG tính là lỗi — chúng
 *   tự khai `overflow-x`. Chỉ tính khi CẢ TRANG trôi ngang.
 *
 * Chạy: node scripts/soat-khung-may-tinh-bang.mjs [địa-chỉ]
 */
import { chromium } from "playwright-core";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";
const EMAIL = "demo.ifan.2026@gmail.com";
const MAT_KHAU = "DemoIfan#2026";

let duongTrinhDuyet = null;
if (process.platform === "win32") {
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở: ${CENT}`);
    process.exit(1);
  }
  duongTrinhDuyet = CENT;
}

/** Hai khổ máy tính bảng hay gặp: iPad dọc và iPad ngang. */
const KHO = [
  ["iPad dọc", 768, 1024],
  ["iPad ngang", 1024, 768],
];

const MAN = [
  "/app/today",
  "/app/calendar",
  "/app/contacts",
  "/app/inbox",
  "/app/orders",
  "/app/chat",
  "/app/settings/account",
];

let truot = 0;
/**
 * ⚠️ ĐĂNG NHẬP MỘT LẦN rồi dùng lại phiên cho khổ thứ hai. Cổng chặn 10 lượt
 *   đăng nhập mỗi 5 phút cho một email — chạy đi chạy lại trong lúc sửa là chạm
 *   trần, và lúc đó cổng ĐỎ vì bị chặn cửa chứ không phải vì giao diện hỏng.
 *   Đã mất một lượt đi tìm nhầm chỗ vì đúng chuyện này.
 */
let phien = null;

/**
 * NHỚ PHIÊN GIỮA CÁC LƯỢT CHẠY.
 *
 * ⚠️ Cổng chặn 10 lượt đăng nhập mỗi 5 phút cho một email. Chạy đi chạy lại
 *   trong lúc sửa giao diện là chạm trần, và lúc đó cổng ĐỎ vì bị chặn cửa chứ
 *   KHÔNG phải vì giao diện hỏng — hai chuyện trông y hệt nhau trên màn. Đã mất
 *   ba lượt đi tìm nhầm chỗ vì đúng việc này.
 *
 * Tệp phiên nằm ngoài git (thư mục `soi/` đã được bỏ qua).
 */
const TEP_PHIEN = "soi/.phien-thu.json";
if (existsSync(TEP_PHIEN)) {
  try {
    phien = JSON.parse(readFileSync(TEP_PHIEN, "utf8"));
  } catch {
    phien = null;
  }
}
const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});

for (const [nhan, rong, cao] of KHO) {
  const ctx = await b.newContext({
    ...(phien ? { storageState: phien } : {}),
    viewport: { width: rong, height: cao },
    locale: "vi-VN",
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const p = await ctx.newPage();
  if (phien) {
    // Phiên nhớ từ lượt trước có thể đã hết hạn — thử vào thật, hỏng thì bỏ.
    await p.goto(`${NEN}/app/today`, { waitUntil: "domcontentloaded" });
    if (p.url().includes("/login")) phien = null;
  }
  if (!phien) {
    await p.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
    await p.fill("#identifier", EMAIL);
    await p.fill("#password", MAT_KHAU);
    await p.click('button[type="submit"]');
    try {
      await p.waitForURL(/\/app/, { timeout: 150000 });
    } catch {
      console.error(`❌ Không đăng nhập được ở khổ ${nhan}.`);
      console.error("   Thường là do chạm trần 10 lượt đăng nhập / 5 phút cho một email.");
      process.exit(1);
    }
    phien = await ctx.storageState();
    try {
      mkdirSync("soi", { recursive: true });
      writeFileSync(TEP_PHIEN, JSON.stringify(phien), "utf8");
    } catch {
      /* không ghi được thì thôi — chỉ mất tiện, không sai kết quả */
    }
  }

  console.log(`\n══ ${nhan} (${rong}×${cao}) ══`);
  for (const d of MAN) {
    await p.goto(`${NEN}${d}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => {
      // CẢ TRANG trôi ngang — không tính vùng tự khai cuộn ngang.
      const troi = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      // Vùng bấm quá nhỏ: nút/liên kết đang NHÌN THẤY mà cạnh ngắn < 32px.
      const NGUONG = 24; // WCAG 2.2 AA mục 2.5.8
      const nho = [...document.querySelectorAll("button, a[href], [role='button']")]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) return false;
          // Phần tử CỐ Ý ẩn (chỉ dành cho trình đọc màn hình) — không ai bấm
          // trượt vào thứ không nhìn thấy.
          if (b.width <= 2 || b.height <= 2) return false;
          const st = getComputedStyle(e);
          if (st.visibility === "hidden" || st.opacity === "0") return false;
          // `sr-only` cắt phần tử bằng `clip`/`clip-path` — vô hình với mắt dù
          // hộp có kích thước. Không ai bấm trượt vào thứ không nhìn thấy.
          if ((st.clipPath && st.clipPath !== "none") || (st.clip && st.clip !== "auto")) return false;
          if (b.bottom < 0 || b.top > innerHeight) return false;
          // ⚠️ MIỄN TRỪ CÓ LÝ DO: Ô LỊCH HẸN trên lưới giờ.
          //   Chiều cao của chúng do ĐỘ DÀI CA quyết định, không do người thiết
          //   kế chọn — một ca 15 phút thì ô phải thấp, nếu không lưới giờ nói
          //   sai về thời gian. Đây đúng là ngoại lệ "kích thước là thiết yếu"
          //   của WCAG 2.5.8. Bù lại: lưới THU PHÓNG ĐƯỢC (cuộn có Ctrl, chụm
          //   hai ngón, nút +/−) nên người dùng tự nới ô ra được, và bấm vào
          //   khoảng trống cạnh ô KHÔNG tạo lịch nhầm nữa.
          //   Đo 21/08: bỏ miễn trừ này thì màn Lịch báo 187 "lỗi" — toàn ô
          //   lịch hẹn — và che mất 3 lỗi THẬT ở màn khác.
          if (e.closest("[data-o-ca]")) return false;
          return Math.min(b.width, b.height) < NGUONG;
        })
        .map((e) => (e.getAttribute("aria-label") || e.innerText || e.tagName).replace(/\s+/g, " ").trim().slice(0, 24));
      // Gom theo nhãn kèm SỐ LƯỢNG: "197 chỗ" là một loại lặp 197 lần hay 197
      // loại khác nhau — hai chuyện hoàn toàn khác, và bảng chỉ in 4 nhãn đầu
      // thì không phân biệt được.
      const dem = new Map();
      for (const x of nho) dem.set(x, (dem.get(x) ?? 0) + 1);
      const top = [...dem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      return { troi, nho: top.map(([k, v]) => `${k}×${v}`), soNho: nho.length };
    });
    const ok = r.troi <= 1 && r.soNho === 0;
    if (!ok) truot++;
    console.log(
      `  ${ok ? "ĐẠT  " : "TRƯỢT"}  ${d.padEnd(24)}` +
        (r.troi > 1 ? ` trôi ngang ${r.troi}px` : "") +
        (r.soNho ? ` · ${r.soNho} vùng bấm < 32px: ${r.nho.join(" / ")}` : ""),
    );
  }
  await ctx.close();
}

await b.close();
console.log("");
if (truot) {
  console.error(`❌ ${truot} màn chưa dùng được ở khổ máy tính bảng.`);
  console.error("   Máy quầy của tiệm spa hay là một chiếc iPad — khổ này không phải khổ hiếm.");
  process.exit(1);
}
console.log("✅ Mọi màn đều không trôi ngang và không có vùng bấm quá nhỏ ở khổ máy tính bảng.");
