#!/usr/bin/env node
/**
 * Cổng canh: THẺ THIẾT KẾ CÓ CHỮ NÀO BỊ CẮT MẤT Ở KHỔ ĐIỆN THOẠI KHÔNG.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY — ba phép đo, hai phép đầu đều sai theo cách riêng
 * ═══════════════════════════════════════════════════════════════════
 * Ngày 20/08 ba thẻ được vẽ. Nhánh vẽ đo xong báo *"cả ba đã 375/375, không
 * trôi ngang"*. Nhánh soát lại đo xong báo *"vẫn tràn"*. Hai bên đo hai thứ
 * khác nhau, và CẢ HAI phép đo đều không trả lời được câu cần hỏi:
 *
 *   PHÉP 1 — `scrollWidth` vs `clientWidth` → hỏi "TRANG có trôi ngang không".
 *     Sai ở chỗ: khung mô phỏng điện thoại trong thẻ để `overflow:hidden`, nên
 *     phép này LUÔN ra số đẹp dù chữ có bị cắt hay không. Số đẹp mà vô nghĩa.
 *
 *   PHÉP 2 — `getBoundingClientRect().right` > khung, rồi đi ngược lên tìm tổ
 *     tiên: gặp `overflow-x:auto|scroll` thì coi là cuộn được, gặp
 *     `overflow-x:hidden` thì kết luận BỊ CẮT.
 *     Sai ở chỗ: **một hộp `overflow:hidden` KHÔNG đương nhiên cắt cái gì.**
 *     Nó chỉ cắt phần nằm NGOÀI CHÍNH NÓ. Khuôn màn `.sc` trong thẻ để
 *     `overflow:hidden` chỉ để bo góc; nội dung bên trong vừa khít khuôn, và
 *     bản thân khuôn thì nằm trong hộp `.row>div{overflow-x:auto}` nên kéo
 *     ngang là tới. Phép 2 dừng ngay ở `.sc`, không bao giờ đi tới `.row>div`,
 *     nên báo "BỊ CẮT" cho cả trăm phần tử KHÔNG hề bị cắt.
 *     Đo lại bản gốc hai thẻ 20/08: `nội dung vượt khuôn = 0px`, `.row>div`
 *     kéo thêm được 109px và 87px ⇒ chữ vẫn đọc được, chỉ là phải vuốt ngang.
 *
 *   PHÉP 3 (phép này dùng) — hỏi đúng câu người dùng quan tâm:
 *     **có chữ nào KHÔNG với tới được không.** Gồm hai vế, và vế thứ hai là vế
 *     mà cả hai phép trên đều mù:
 *
 *       (a) phần tử vượt khung máy, mà tổ tiên gần nhất CHẶN THẬT (mép phải
 *           của phần tử vượt qua mép trong của cái hộp đang chặn) và không có
 *           hộp nào cuộn ngang được ⇒ mất.
 *       (b) hộp tự cắt chữ CỦA CHÍNH NÓ (`scrollWidth > clientWidth` trên hộp
 *           `overflow-x:hidden`) ⇒ mất, KỂ CẢ khi hộp đó nằm gọn trong khung.
 *           Vế (b) không dính gì tới bề rộng khung nên phép 1 và 2 đều không
 *           thấy. Chính vế này bắt được lỗi THẬT do bản vá 20/08 đẻ ra: nhãn
 *           tab "Lead chờ duyệt" thiếu 5px, `nowrap` + `hidden` nên mất hẳn.
 *
 *   ⚠️ LUẬT RÚT RA: "không trôi ngang" KHÔNG chứng minh "vừa khung", và
 *   "có tổ tiên overflow:hidden" KHÔNG chứng minh "bị cắt". Muốn biết chữ có
 *   mất hay không thì phải hỏi thẳng: *phần vượt đó nằm ngoài hộp nào đang
 *   chặn, và có hộp nào kéo ra xem được không.*
 *
 *   node scripts/soat-the-tren-dien-thoai.mjs                 — soát tất cả
 *   node scripts/soat-the-tren-dien-thoai.mjs a.html b.html   — soát vài thẻ
 *   node scripts/soat-the-tren-dien-thoai.mjs --chi-tiet      — in hết chỗ hỏng
 *
 * ═══════════════════════════════════════════════════════════════════
 * THIẾU THƯ VIỆN THÌ ĐỎ, KHÔNG IM LẶNG BỎ QUA
 * ═══════════════════════════════════════════════════════════════════
 * `playwright` KHÔNG nằm trong `package.json` (cố ý: nó chỉ phục vụ việc soát
 * thẻ, web chạy không cần tới). Nên cổng này có thể gặp cảnh thiếu thư viện.
 * Xử lý: **báo rõ cần cài gì rồi THOÁT MÃ 1.**
 * Vì sao không chọn "bỏ qua cho lành": kho này đã dính đúng con bệnh đó — luật
 * ghi có cổng `check-ds.mjs` mà file chưa từng tồn tại, 111 thẻ vẽ dưới một
 * cổng KHÔNG CÓ THẬT (xem đầu `soat-the-design.mjs`). Cổng tự bỏ qua khi thiếu
 * đồ nghề thì không phân biệt được với cổng luôn xanh.
 *
 * ═══════════════════════════════════════════════════════════════════
 * TRÌNH DUYỆT
 * ═══════════════════════════════════════════════════════════════════
 * Luật máy (CLAUDE.md §7): duyệt tự động trên máy founder PHẢI dùng Cent
 * Browser. Nên trên Windows cổng đòi đúng Cent — KHÔNG có đường lùi âm thầm
 * sang Chrome (lùi âm thầm cũng là một kiểu hỏng im lặng). Trên Linux (máy
 * chạy cổng kiểm) không có Cent, ở đó dùng Chromium playwright tải kèm, và IN
 * RA đang dùng cái nào để không ai phải đoán.
 * Trỏ tay: `TRINH_DUYET=<đường dẫn .exe>`.
 *
 * ⚠️ ĐIỂM YẾU ĐÃ ĐO, nói thẳng: bề rộng chữ đổi theo PHÔNG của từng máy. Đo
 * 20/08 bằng cách ép cả bộ thẻ sang một phông rộng hơn hẳn (Verdana thay cho
 * Segoe UI): **14/148 thẻ đổi số đếm**, và **2 thẻ đang sạch thì hỏng thêm**
 * (`khung-trang-cai-dat`, `landing-hero` — cả hai đang sát mép đúng 375px).
 * Vì thế cổng KHÔNG so theo số đếm (so số đếm là đỏ oan chắc chắn), mà so
 * theo trạng thái CÓ/KHÔNG. Rủi ro còn lại: một thẻ sát mép có thể đỏ trên máy
 * chạy cổng mà xanh trên máy founder. Chưa chứng minh được là không xảy ra.
 */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Đường dẫn suy từ vị trí file — KHÔNG nhúng cứng `C:/dev/ifan.asia`. Bài học
// 19/08: `soat-the-design.mjs` từng nhúng cứng, chạy tay trên Windows không bao
// giờ lộ, vừa cắm vào cổng kiểm (máy Linux) là đỏ ngay vì không có ổ C:.
const GOC_KHO = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIR = path.join(GOC_KHO, "design-system");

const KHO_NGANG = 375; // iPhone SE / 12 mini — khổ hẹp nhất còn đáng kể ở VN
const KHO_DOC = 812;

const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";

// ── MIỄN TRỪ: thẻ CỐ Ý tràn ─────────────────────────────────────────
// Ví dụ hợp lệ: thẻ vẽ minh hoạ CHÍNH hiện tượng tràn. Mỗi dòng phải kèm lý do
// CỤ THỂ — "không quan trọng" không phải lý do, đó chính là câu làm cổng mục
// ruỗng dần. Rỗng là đúng: lượt quét 20/08 không thấy thẻ nào cố ý tràn.
/** @type {Record<string,string>} */
const MIEN_TRU = {};

// ── NỢ CŨ: thẻ ĐANG hỏng từ trước, chưa tới lượt sửa ────────────────
// Vì sao cần danh sách này: lượt quét đầu (20/08) bắt được nợ ở nhiều thẻ vẽ
// từ trước, trong khi đợt việc đang mở chỉ được phép sửa hai thẻ. Có ba đường
// đi, và hai đường đầu đều tệ:
//   · Không cắm cổng vào CI cho tới khi sửa hết ⇒ cổng nằm im, thẻ mới vẽ sai
//     vẫn lọt — đúng con bệnh "bộ kiểm đã viết mà không ai gọi".
//   · Cắm vào và để đỏ thường trực ⇒ cổng đỏ mãi là cổng sẽ bị tắt.
//   · Cắm vào + khai NỢ THÀNH DANH SÁCH, và khoá theo chiều một chiều.
// Chọn đường thứ ba. Luật của danh sách này:
//   1. Thẻ KHÔNG có trong danh sách mà hỏng ⇒ ĐỎ. (thẻ mới không được hỏng)
//   2. Thẻ CÓ trong danh sách mà đã SẠCH ⇒ ĐỎ, bắt xoá khỏi danh sách.
//      (chống danh sách nói dối: nợ đã trả mà vẫn khai là còn nợ)
// Cố ý KHÔNG so theo SỐ phần tử hỏng — số đó đổi theo phông của từng máy (đo
// được 14/148 thẻ đổi số khi đổi phông), so số là đỏ oan.
// Đo 20/08 bằng PHÉP 3. Ba thẻ cuối (`bottom-sheet`, `landing-hero`,
// `man-bo-loc-luu-san`) là chỗ mà CẢ HAI phép đo cũ đều mù: chúng không vượt
// khung máy chút nào, chỉ có hộp bên trong tự cắt chữ của chính nó.
const NO_CU = new Set([
  "auth-screens.html",
  "board.html",
  "bottom-sheet.html",
  "dau-hieu-thuong-hieu.html",
  "hop-chat-website.html",
  "khung-chat.html",
  "landing-hero.html",
  "luat-can-chu-y.html",
  "man-ai-truc-viec.html",
  "man-bo-loc-luu-san.html",
  "man-cai-dat-khung.html",
  "man-cong-ty.html",
  "man-cong-viec.html",
  "man-duyet.html",
  "man-ho-so.html",
  "man-hop-thu.html",
  "man-so-quy.html",
  "man-tong-quan.html",
  "nav.html",
  "thanh-cong-cu-va-bo-chon.html",
]);

// ── Nạp playwright ──────────────────────────────────────────────────
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("❌ Không nạp được `playwright` — cổng này KHÔNG chạy được, mà");
  console.error("   cổng không chạy được thì phải ĐỎ, không được lặng lẽ xanh.");
  console.error("");
  console.error("   Cách cài (cố ý KHÔNG ghi vào package.json — thư viện này chỉ");
  console.error("   phục vụ việc soát thẻ, web chạy không cần tới):");
  console.error("");
  console.error("     npm i --no-save --no-package-lock playwright@1.62.1");
  console.error("     npx playwright install chromium   # bỏ qua nếu dùng Cent Browser");
  console.error("");
  process.exit(1);
}

// ── Chọn trình duyệt ────────────────────────────────────────────────
let duongDanTrinhDuyet = process.env.TRINH_DUYET ?? null;
let tenTrinhDuyet = duongDanTrinhDuyet ? `khai tay (${duongDanTrinhDuyet})` : null;

if (!duongDanTrinhDuyet && process.platform === "win32") {
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở:\n     ${CENT}`);
    console.error("");
    console.error("   Luật máy (CLAUDE.md §7) bắt duyệt tự động phải đi bằng Cent Browser,");
    console.error("   nên ở đây KHÔNG có đường lùi âm thầm sang Chrome mặc định.");
    console.error("   Cent nằm chỗ khác thì khai: TRINH_DUYET=<đường dẫn .exe>");
    process.exit(1);
  }
  duongDanTrinhDuyet = CENT;
  tenTrinhDuyet = "Cent Browser (luật máy CLAUDE.md §7)";
}
if (!tenTrinhDuyet) tenTrinhDuyet = "Chromium đi kèm playwright (máy không phải Windows)";

// ── Danh sách thẻ ───────────────────────────────────────────────────
const chiTiet = process.argv.includes("--chi-tiet");
const thamSo = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const motPhan = thamSo.length > 0;
const ds = (motPhan ? thamSo : readdirSync(DIR).filter((f) => f.endsWith(".html")))
  .map((f) => path.basename(f))
  .sort();

if (ds.length === 0) {
  console.error("❌ Không có thẻ nào để soát.");
  process.exit(1);
}

/** Chạy TRONG trang. Xem khối "PHÉP 3" ở đầu file để biết vì sao đo như vậy. */
const DO = () => {
  const W = document.documentElement.clientWidth;
  const hong = [];
  const tapHong = new Set();

  /** Mép phải của VÙNG NHÌN THẤY bên trong một hộp (đã trừ viền). */
  const mepTrong = (el) => el.getBoundingClientRect().left + el.clientLeft + el.clientWidth;

  // ── Vế (a): vượt khung máy và không với tới được ──
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue; // phần tử ẩn
    if (r.right <= W + 1) continue; // +1: bù sai số làm tròn của trình duyệt

    let kieu = "troi-ngang";
    for (let cha = el.parentElement; cha; cha = cha.parentElement) {
      const s = getComputedStyle(cha);
      if (/(auto|scroll)/.test(s.overflowX)) { kieu = "cuon-duoc"; break; }
      if (/(hidden|clip)/.test(s.overflowX)) {
        // ⚠️ ĐÂY LÀ CHỖ PHÉP ĐO CŨ SAI. Hộp `hidden` chỉ cắt phần nằm NGOÀI
        // chính nó. Vừa khít trong hộp thì không mất gì ⇒ đi tiếp lên trên,
        // biết đâu bên trên có hộp kéo ngang được.
        if (r.right > mepTrong(cha) + 1) { kieu = "BI-CAT"; break; }
      }
    }
    if (kieu === "cuon-duoc") continue;

    tapHong.add(el);
    hong.push({
      el,
      kieu,
      the: el.tagName.toLowerCase(),
      lop: (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join("."),
      so: Math.round(r.right),
      chu: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 44),
    });
  }

  // ── Vế (b): hộp tự cắt chữ của chính nó ──
  // Không dính gì tới bề rộng khung, nên hai phép đo cũ đều mù chỗ này.
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (!/(hidden|clip)/.test(cs.overflowX)) continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    // `text-overflow:ellipsis` là cắt CÓ CHỦ Ý và CÓ BÁO (dấu ba chấm nói cho
    // người đọc biết còn nữa). Khác hẳn cắt cụt giữa chữ mà không dấu hiệu gì.
    if (cs.textOverflow === "ellipsis") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    tapHong.add(el);
    hong.push({
      el,
      kieu: "CAT-CHU",
      the: el.tagName.toLowerCase(),
      lop: (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join("."),
      so: el.scrollWidth - el.clientWidth,
      chu: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 44),
    });
  }

  // Gốc gây hỏng = chỗ hỏng mà CHA nó không hỏng. Một khuôn màn lệch thì kéo
  // theo cả trăm con cháu; in hết là nhiễu, in gốc là đủ để đi sửa.
  const goc = hong
    .filter((v) => !(v.el.parentElement && tapHong.has(v.el.parentElement)))
    .map((v) => ({ kieu: v.kieu, the: v.the, lop: v.lop, so: v.so, chu: v.chu }));

  return {
    tong: hong.length,
    biCat: hong.filter((v) => v.kieu === "BI-CAT").length,
    troiNgang: hong.filter((v) => v.kieu === "troi-ngang").length,
    catChu: hong.filter((v) => v.kieu === "CAT-CHU").length,
    goc,
  };
};

// ── Quét ────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  headless: true,
  ...(duongDanTrinhDuyet ? { executablePath: duongDanTrinhDuyet } : {}),
});

const ketQua = [];
const hangDoi = [...ds];
const SONG_SONG = 6; // 148 thẻ chạy tuần tự thì quá chậm; 6 tab đủ nhanh, không nghẽn

async function motLuong() {
  const ctx = await browser.newContext({ viewport: { width: KHO_NGANG, height: KHO_DOC } });
  const page = await ctx.newPage();
  for (;;) {
    const ten = hangDoi.shift();
    if (!ten) break;
    const duongDan = path.join(DIR, ten);
    if (!existsSync(duongDan)) {
      ketQua.push({ ten, khongCoFile: true });
      continue;
    }
    await page.goto(pathToFileURL(duongDan).href, { waitUntil: "load" });
    ketQua.push({ ten, ...(await page.evaluate(DO)) });
  }
  await ctx.close();
}

await Promise.all(Array.from({ length: Math.min(SONG_SONG, ds.length) }, motLuong));
await browser.close();
ketQua.sort((a, b) => a.ten.localeCompare(b.ten));

// ── Kết luận ────────────────────────────────────────────────────────
const hongMoi = []; // hỏng mà KHÔNG khai nợ ⇒ đỏ
const noDaTra = []; // khai nợ mà đã sạch ⇒ đỏ, bắt xoá khỏi danh sách
const conNo = []; // khai nợ và đúng là còn nợ ⇒ in ra, không đỏ
const daMienTru = [];
const thieuFile = [];

for (const r of ketQua) {
  if (r.khongCoFile) { thieuFile.push(r); continue; }
  if (r.tong > 0) {
    if (MIEN_TRU[r.ten]) daMienTru.push(r);
    else if (NO_CU.has(r.ten)) conNo.push(r);
    else hongMoi.push(r);
  } else if (NO_CU.has(r.ten)) {
    noDaTra.push(r);
  }
}

console.log(`Khổ đo: ${KHO_NGANG}×${KHO_DOC} · trình duyệt: ${tenTrinhDuyet}`);
console.log(`Đã soát ${ketQua.length} thẻ trong design-system/.`);

const inGoc = (r) => {
  const dsGoc = chiTiet ? r.goc : r.goc.slice(0, 5);
  for (const g of dsGoc) {
    const lop = g.lop ? `.${g.lop}` : "";
    const nhan = g.kieu === "BI-CAT" ? "BỊ CẮT" : g.kieu === "CAT-CHU" ? "CẮT CHỮ" : "trôi   ";
    const so = g.kieu === "CAT-CHU" ? `thiếu ${g.so}px` : `phải=${g.so}px`;
    console.error(`       · ${nhan.padEnd(7)} ${g.the}${lop}  ${so}  "${g.chu}"`);
  }
  if (!chiTiet && r.goc.length > dsGoc.length) {
    console.error(`       … và ${r.goc.length - dsGoc.length} chỗ nữa (thêm --chi-tiet để xem hết)`);
  }
};

if (daMienTru.length) {
  console.log("");
  console.log(`ℹ️  ${daMienTru.length} thẻ MIỄN TRỪ (cố ý tràn):`);
  for (const r of daMienTru) console.log(`    · ${r.ten} — ${MIEN_TRU[r.ten]}`);
}

if (conNo.length) {
  console.log("");
  console.log(`⚠️  ${conNo.length} thẻ NỢ CŨ — đã khai trong \`NO_CU\`, chưa tới lượt sửa:`);
  for (const r of conNo) {
    console.log(`    · ${r.ten} — ${r.tong} chỗ (${r.biCat} bị cắt, ${r.troiNgang} trôi ngang, ${r.catChu} cắt chữ trong hộp)`);
  }
  console.log("    Nợ này KHÔNG làm đỏ cổng, nhưng cũng không được im: sửa xong thẻ nào");
  console.log("    thì xoá tên thẻ đó khỏi `NO_CU` — để nguyên là cổng đỏ.");
}

let doiMa = 0;

if (thieuFile.length) {
  doiMa = 1;
  console.error("");
  console.error(`❌ ${thieuFile.length} thẻ khai trong lệnh nhưng không có file:`);
  for (const r of thieuFile) console.error(`   · ${r.ten}`);
}

if (hongMoi.length) {
  doiMa = 1;
  console.error("");
  console.error(`❌ ${hongMoi.length}/${ketQua.length} thẻ có chữ NGƯỜI DÙNG KHÔNG VỚI TỚI ĐƯỢC ở khổ ${KHO_NGANG}px:`);
  for (const r of hongMoi) {
    console.error("");
    console.error(`   ▸ ${r.ten} — ${r.tong} chỗ (${r.biCat} bị cắt, ${r.troiNgang} trôi ngang, ${r.catChu} cắt chữ trong hộp)`);
    inGoc(r);
  }
  console.error("");
  console.error("   Cách chữa đã dùng và có tác dụng (xem `design-system/man-tran-giam-gia.html`):");
  console.error("     · khuôn màn bản máy tính đừng ghim cứng chiều rộng — thêm `max-width:100%`");
  console.error("     · dưới 640px thì bảng XẾP CHỒNG thành thẻ đọc dọc (mỗi ô tự in tên cột");
  console.error("       qua `td::before{content:attr(data-h)}`) thay vì bắt người ta kéo ngang");
  console.error("     · chữ trong hộp `nowrap` + `hidden` mà thiếu chỗ thì CHO XUỐNG DÒNG,");
  console.error("       đừng thu nhỏ chữ và đừng để nó cắt cụt không dấu hiệu gì");
  console.error("     · chuỗi dài không cắt được (tên miền, mã) dùng `word-break:break-all`");
  console.error("   ⚠️ Khối `@media` phải nằm CUỐI bảng kiểu — `@media` không cộng thêm độ ưu");
  console.error("      tiên, đặt trước luật gốc thì luật gốc ghi đè lại và khối đó thành vô hiệu.");
  console.error("");
  console.error("   Thẻ CỐ Ý tràn thì khai vào `MIEN_TRU` kèm lý do cụ thể.");
}

if (noDaTra.length) {
  doiMa = 1;
  console.error("");
  console.error(`❌ ${noDaTra.length} thẻ khai NỢ CŨ nhưng đo ra đã SẠCH — xoá khỏi \`NO_CU\`:`);
  for (const r of noDaTra) console.error(`   · ${r.ten}`);
  console.error("");
  console.error("   Danh sách nợ mà nói sai thì tệ hơn không có: người đọc tưởng chỗ đó");
  console.error("   vẫn hỏng nên không ai ngó lại, mà cổng thì đã hết canh chỗ ấy từ lâu.");
}

if (doiMa === 0) {
  console.log("");
  const con = conNo.length ? ` (${conNo.length} thẻ nợ cũ đã khai, chưa tính)` : "";
  console.log(`✅ ${ketQua.length - conNo.length - daMienTru.length}/${ketQua.length} thẻ — không chữ nào bị cắt mất ở khổ điện thoại${con}.`);
}
process.exit(doiMa);
