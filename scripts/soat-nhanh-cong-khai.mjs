/**
 * CỔNG: trang công khai chỉ cõng phần câu chữ nó thật sự cần — và KHÔNG màn nào
 * vì thế mà hiện mã máy.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY — ĐO ĐƯỢC 22/08
 * ═══════════════════════════════════════════════════════════════════
 * Khung gốc trao TOÀN BỘ kho câu chữ cho trình duyệt, nên mọi trang giới thiệu
 * mà khách lạ ghé đều cõng theo chữ của 44 màn chỉ dùng sau khi đăng nhập:
 *
 *     tổng kho      259 KB
 *     công khai cần  40 KB
 *     thừa          219 KB
 *
 * Đã thu hẹp bằng `i18n/nhanh-cong-khai.ts`.
 *
 * ⚠️ PHÉP THU HẸP NÀY HỎNG THEO KIỂU IM LẶNG. Thiếu một nhánh thì màn KHÔNG
 *   ném lỗi — nó in ra MÃ MÁY (`settings.account.title`) đúng chỗ đáng lẽ là
 *   tiếng Việt. Trang vẫn chạy, vẫn bấm được, chỉ là chữ thành mã. Vì vậy cổng
 *   này mở TỪNG trang công khai bằng trình duyệt thật và soi chữ trên màn.
 *
 * ⚠️ Đo cả HAI chiều: nhẹ đi bao nhiêu, VÀ không màn nào vỡ chữ. Chỉ đo cái
 *   đầu thì lần sau ai đó cắt thêm một nhánh nữa cho nhẹ, và không ai thấy.
 *
 * Chạy: node scripts/soat-nhanh-cong-khai.mjs [địa-chỉ]
 */
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";

let duongTrinhDuyet = null;
if (process.platform === "win32") {
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở: ${CENT}`);
    process.exit(1);
  }
  duongTrinhDuyet = CENT;
}

/** Mọi trang người lạ vào được. */
const TRANG = ["/", "/bang-gia", "/tinh-nang", "/lo-trinh", "/login", "/signup", "/forgot-password", "/privacy", "/terms"];

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  ok ? dat++ : truot++;
};

const b = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "vi-VN" });
const p = await ctx.newPage();
const loiConsole = [];
p.on("console", (m) => {
  const t = m.text();
  // next-intl kêu đúng chữ này khi thiếu nhánh/khoá.
  if (/MISSING_MESSAGE|IntlError/i.test(t)) loiConsole.push(t.slice(0, 140));
});

/** Nhánh chỉ dùng sau đăng nhập — không được có mặt trong trang công khai. */
const { NHANH_CONG_KHAI } = await import(
  path.join(GOC, "i18n", "nhanh-cong-khai.ts").replace(/\\/g, "/")
).catch(() => ({ NHANH_CONG_KHAI: null }));

const kho = JSON.parse(readFileSync(path.join(GOC, "messages", "vi.json"), "utf8"));
const congKhai = new Set(
  NHANH_CONG_KHAI ?? ["common", "errors", "metadata", "pwa", "landing", "tinhNang", "loTrinh", "bangGia", "nganh", "auth", "passkey", "legal", "storefront", "share", "time", "csat", "reportShare", "seed"],
);
/** Một câu CHỈ có ở nhánh sau-đăng-nhập, dùng làm dấu để dò. */
const dauRieng = [];
for (const [nhanh, noi] of Object.entries(kho)) {
  if (congKhai.has(nhanh)) continue;
  const chuoi = JSON.stringify(noi).match(/"([^"]{25,60})"/g) ?? [];
  if (chuoi.length) dauRieng.push([nhanh, chuoi[0].slice(1, -1)]);
}

for (const duong of TRANG) {
  loiConsole.length = 0;
  const r = await p.goto(`${NEN}${duong}`, { waitUntil: "networkidle", timeout: 60000 });
  if (!r || r.status() >= 400) {
    kiem(`${duong}: mở được`, false, `mã ${r?.status()}`);
    continue;
  }
  await p.waitForTimeout(700);
  const html = await p.content();
  const chu = await p.innerText("body");

  // (1) Không màn nào hiện MÃ MÁY thay cho tiếng Việt.
  // ⚠️ Địa chỉ EMAIL và tên miền cũng có dấu chấm, và trông y hệt một khoá câu
  //   chữ. Đã dính: màn đăng nhập in email tài khoản xem thử
  //   `xem.demo.ifan.2026@gmail.com`, phép đo bắt được mẩu "xem.demo.ifan" rồi
  //   kêu là mã máy. Loại theo BỐI CẢNH: có `@` ngay quanh đó thì là email.
  const maMay = [...chu.matchAll(/\b[a-z][a-zA-Z]+\.[a-z][a-zA-Z]+(?:\.[a-zA-Z]+)+\b/g)];
  const that = maMay
    .filter((m) => {
      const quanh = chu.slice(Math.max(0, m.index - 2), m.index + m[0].length + 24);
      if (quanh.includes("@")) return false;
      if (/\.(com|vn|asia|org|net|io|app|dev)\b/.test(m[0])) return false;
      // Khoá câu chữ không bao giờ có chữ số trong đoạn.
      return !/\d/.test(m[0]);
    })
    .map((m) => m[0]);
  kiem(`${duong}: không hiện mã máy`, that.length === 0, that.slice(0, 3).join(", "));

  // (2) Không có lời kêu thiếu câu chữ.
  kiem(`${duong}: không kêu thiếu câu chữ`, loiConsole.length === 0, loiConsole[0] ?? "");

  // (3) Không cõng chữ của màn sau đăng nhập.
  const lot = dauRieng.filter(([, dau]) => html.includes(dau)).map(([nhanh]) => nhanh);
  kiem(`${duong}: không cõng chữ màn sau đăng nhập`, lot.length === 0, lot.slice(0, 4).join(", "));
}

// ════════════════════════════════════════════════════════════════════
// CHIỀU NGƯỢC LẠI — khu SAU ĐĂNG NHẬP phải vẫn ĐỦ chữ
// ════════════════════════════════════════════════════════════════════
// ⚠️ Chỉ đo chiều "nhẹ đi" là nguy hiểm: lần sau ai đó cắt thêm một nhánh nữa
//   cho nhẹ hơn, và các màn sau đăng nhập lặng lẽ hiện mã máy. Phải đo cả hai.
const MAN_TRONG_APP = [
  "/app/today",
  "/app/calendar",
  "/app/contacts",
  "/app/orders",
  "/app/inbox",
  "/app/chat",
  "/app/settings",
  "/app/settings/account",
];
await p.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
await p.fill("#identifier", "demo.ifan.2026@gmail.com");
await p.fill("#password", "DemoIfan#2026");
await p.click('button[type="submit"]');
let daVao = true;
try {
  await p.waitForURL(/\/app/, { timeout: 150000 });
} catch {
  daVao = false;
  kiem("đăng nhập để soát khu sau đăng nhập", false, "thường do chạm trần 10 lượt/5 phút");
}
if (daVao) {
  for (const duong of MAN_TRONG_APP) {
    loiConsole.length = 0;
    await p.goto(`${NEN}${duong}`, { waitUntil: "networkidle", timeout: 60000 });
    await p.waitForTimeout(600);
    const chu = await p.innerText("body");
    const ma = [...chu.matchAll(/\b[a-z][a-zA-Z]+\.[a-z][a-zA-Z]+(?:\.[a-zA-Z]+)+\b/g)]
      .filter((m) => {
        const quanh = chu.slice(Math.max(0, m.index - 2), m.index + m[0].length + 24);
        return !quanh.includes("@") && !/\.(com|vn|asia|org|net)\b/.test(m[0]) && !/\d/.test(m[0]);
      })
      .map((m) => m[0]);
    kiem(
      `${duong}: vẫn đủ chữ`,
      ma.length === 0 && loiConsole.length === 0,
      [...ma.slice(0, 2), loiConsole[0] ?? ""].filter(Boolean).join(" · "),
    );
  }
}

await b.close();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
