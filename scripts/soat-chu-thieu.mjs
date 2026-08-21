#!/usr/bin/env node
/**
 * Cổng soát: MÀN NÀO GỌI MỘT CÂU CHỮ CHƯA CÓ.
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO DỰNG — một màn đã lên bản thật và hiện MÃ MÁY cho người dùng
 * ════════════════════════════════════════════════════════════════════
 *
 * Ngày 21/08 founder chốt lại nghĩa của chữ "xong": *"Xong tức là tôi thấy
 * được, chạy được thực tế và không có bug!"*
 *
 * Mở màn Chia sẻ báo cáo trên bản thật ngay sau đó — nó hiện nguyên:
 *
 *     settings.reportShares.title
 *     settings.reportShares.create.reportLabel
 *     settings.reportShares.period.month
 *
 * Tức là **mã khoá thô**, không phải tiếng Việt. Màn đã được tuyên bố "xong",
 * đã qua mọi cổng, đã lên bản chạy thật — và không ai nhìn nó một lần.
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG CỔNG NÀO CŨ BẮT ĐƯỢC
 * ════════════════════════════════════════════════════════════════════
 *
 * Thiếu một câu chữ **không phải lỗi lập trình**: `t("abc")` với `abc` chưa có
 * vẫn biên dịch được, vẫn dựng được, vẫn chạy được. Thư viện dịch chỉ lặng lẽ
 * in ra chính cái tên khoá.
 *
 *   · cổng kiểu dữ liệu — không thấy, vì khoá là một chuỗi thường
 *   · cổng dựng bản thật — không thấy, vì trang vẫn dựng xong
 *   · cổng hai bản dịch — không thấy, vì nó so VI với EN; **thiếu ở CẢ HAI
 *     bên thì nó vẫn báo khớp**. Đây đúng là chỗ nó mù.
 *
 * Cổng này hỏi câu còn lại: *mọi khoá màn hình đang gọi có tồn tại không?*
 *
 * ════════════════════════════════════════════════════════════════════
 * MỘT CỔNG CÓ THỂ CÂM MÀ VẪN BÁO XANH — chuyện đã xảy ra với chính file này
 * ════════════════════════════════════════════════════════════════════
 *
 * Phép soát "chỗ điền" bên dưới từng nằm đây nguyên vẹn, chạy mỗi lần, và
 * KHÔNG BẮT ĐƯỢC GÌ — trong khi trên bản chạy thật có năm câu chữ đang hỏng.
 * Nguyên nhân: khuôn của nó mở đầu bằng một ký tự **backspace vô hình**
 * (``) thay vì ``, do lúc soạn file bằng một đoạn Python không phải
 * chuỗi thô. Nhìn bằng mắt thì `t(?:...` và `t(?:...` **giống hệt nhau**;
 * `node --check` cũng xanh, vì đó là một biểu thức hợp lệ — nó chỉ đòi hỏi một
 * ký tự không bao giờ xuất hiện.
 *
 * ⛔ **Cổng mới thì phải CHỨNG MINH nó bắt được.** Cách làm: cố ý dựng lại
 * đúng cái lỗi nó sinh ra để chặn, chạy cổng, thấy nó ĐỎ, rồi mới trả lại.
 * Cổng xanh ngay từ lần chạy đầu là điều đáng NGỜ, không phải đáng mừng.
 *
 * ⚠️ **Chỗ phép đo này có thể sai:** nó đọc mã bằng biểu thức, nên
 *   · khoá ghép động (`t(\`x.${loai}\`)`) — KHÔNG soát được, cố ý bỏ qua
 *   · lời gọi nằm trong CHÚ THÍCH — đã lọc, vì bản đầu báo nhầm đúng chỗ đó
 * Nói ra để người sau không tin cổng này quá mức nó đáng được tin.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const vi = JSON.parse(readFileSync(path.join(GOC, "messages", "vi.json"), "utf8"));
const doc = (o, p) =>
  p.split(".").reduce((a, k) => (a && typeof a === "object" ? a[k] : undefined), o);

/**
 * Bỏ chú thích trước khi dò — bản đầu báo nhầm một lời gọi nằm trong `//`.
 *
 * ⚠️ Khuôn phải là `[^\r\n]*`, KHÔNG được là `.*$`. Trong JavaScript `.` không
 * khớp `\r`, mà mọi file trong kho này kết thúc dòng bằng `\r\n` — nên `.*$`
 * không bao giờ chạm tới cuối dòng và **không xoá được chú thích nào**. Bản
 * đầu viết `.*$` rồi im lặng vô hiệu suốt: chú thích vẫn nằm nguyên trong
 * chuỗi được dò, kéo theo một báo oan ở màn Đường nối.
 */
function boChuThich(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\r\n]*/g, "");
}

/**
 * Tên chỗ điền ở MỨC NGOÀI CÙNG của một câu ICU.
 * `{n, plural, =1 {1 cái} other {# cái}}` chỉ cho ra `n`, không cho ra `1` của
 * nhánh lồng bên trong — bản đầu đếm cả nhánh lồng và báo oan 15 chỗ.
 */
function choDien(cau) {
  const ra = new Set();
  let sau = 0;
  for (let i = 0; i < cau.length; i++) {
    if (cau[i] === "{") {
      if (sau === 0) {
        const m = /^\{\s*([A-Za-z_]\w*)/.exec(cau.slice(i));
        if (m) ra.add(m[1]);
      }
      sau++;
    } else if (cau[i] === "}") sau--;
  }
  return ra;
}

/**
 * Tên khoá ở MỨC NGOÀI CÙNG của một object literal.
 * `{ from: a(b, c), to: d }` cho ra `from` và `to` — dấu phẩy nằm trong lời gọi
 * hàm KHÔNG được tính là chỗ tách.
 */
function khoaDua(doi) {
  const ra = new Set();
  const manh = [];
  let sau = 0, dau = 0;
  for (let i = 0; i < doi.length; i++) {
    const c = doi[i];
    if ("([{".includes(c)) sau++;
    else if (")]}".includes(c)) sau--;
    else if (c === "," && sau === 0) { manh.push(doi.slice(dau, i)); dau = i + 1; }
  }
  manh.push(doi.slice(dau));
  for (const x of manh) {
    if (/^\s*\.\.\./.test(x)) { ra.add("__TRAI__"); continue; }
    const m = /^\s*([A-Za-z_]\w*)\s*(?::|$)/.exec(x);
    if (m) ra.add(m[1]);
  }
  return ra;
}

const files = execFileSync(
  "git",
  // ⚠️ `app/*.tsx` PHẢI có riêng: khuôn `app/**/*.tsx` KHÔNG khớp file nằm
  //   ngay trong `app/` — nó đòi ít nhất một thư mục con. Bản đầu chỉ khai
  //   `**` nên cổng BỎ SÓT `app/page.tsx` · `app/layout.tsx` · `app/error.tsx`
  //   · `app/not-found.tsx` và mọi file ngay trong `components/`.
  //   Đó chính là lý do lỗi `landing.title` / `landing.description` ở TRANG CHỦ
  //   sống sót: nó ném MISSING_MESSAGE hai lần mỗi lần tải, mà cổng chưa từng
  //   nhìn tới file đó một lần nào.
  ["ls-files", "app/*.tsx", "app/**/*.tsx", "components/*.tsx", "components/**/*.tsx"],
  { cwd: GOC, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

const thieu = new Map();
let daSoat = 0;
for (const f of files) {
  let src;
  try { src = boChuThich(readFileSync(path.join(GOC, f), "utf8")); } catch { continue; }
  // CẢ HAI lối khai: `useTranslations` (màn trình duyệt) và `getTranslations`
  // (màn máy chủ). Bản đầu chỉ đọc lối thứ nhất — nghĩa là mọi màn máy chủ
  // KHÔNG hề được soát, và cổng vẫn báo xanh. Một cổng bỏ sót một nửa số màn
  // mà vẫn xanh thì tệ hơn không có cổng: nó tạo cảm giác đã kiểm.
  const nhanh = [...src.matchAll(/(?:use|get)Translations\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);

  // Namespace GHÉP ĐỘNG: `getTranslations(`nganh.${slug}`)`. Trang ngành khai
  // như vậy, và bản trước báo oan tám khoá vì không hiểu lối này. Mở tiền tố
  // ra thành mọi nhánh con của nó (`nganh.spa`, `nganh.fnb`, …).
  // ⚠️ Đây là phép đo YẾU: khoá chỉ cần có ở MỘT nhánh con là coi như đủ, nên
  //   thêm một ngành mới mà quên chữ thì cổng KHÔNG bắt được. Nói ra để không
  //   ai tin nó quá mức nó đáng được tin.
  const nhanhDong = [];
  for (const m of src.matchAll(/(?:use|get)Translations\(\s*`([a-zA-Z0-9_.]*[a-zA-Z0-9_])\.?\$\{/g)) {
    const cha = doc(vi, m[1]);
    if (cha && typeof cha === "object") {
      const mo = Object.keys(cha).map((c) => `${m[1]}.${c}`);
      nhanh.push(...mo);
      nhanhDong.push(...mo);
    }
  }
  if (nhanh.length === 0) continue;
  daSoat++;
  // Chỉ nhận `t("…")` và `tXxx("…")` — tên biến dịch trong kho luôn là `t` hoặc
  // `t` + CHỮ HOA (tTime, tSeed, tRoles). Khuôn rộng hơn (`t\w*`) bắt nhầm cả
  // `toggleSection("overdue")`: bản đầu báo oan đúng ba chỗ như vậy, và một
  // cổng kêu oan là một cổng sắp bị tắt đi.
  //
  // ⚠️ SOÁT THEO TỪNG HÀM, không gom cả file — chỗ mù này đã nổ thật.
  // Bản trước gom MỌI nhánh của cả file rồi hỏi "khoá này có ở ÍT NHẤT MỘT
  // nhánh không". File có hai hàm dùng hai nhánh khác nhau thì khoá của hàm A
  // được nhánh của hàm B bảo lãnh, và cổng vẫn xanh.
  // Nổ ở `app/page.tsx` (21/08): `generateMetadata()` khai nhánh `landing` rồi
  // gọi `t("title")` · `t("description")`, mà hai khoá đó nằm dưới
  // `landing.metadata`. Trang chủ ném MISSING_MESSAGE HAI LẦN mỗi lần tải; máy
  // chủ vẫn trả trang nên không ai thấy — chỉ nhật ký đỏ, và không ai đọc.
  const manh = src
    // ⚠️ `default` PHẢI có trong khuôn: `export default async function Home()`
    //   là lối khai của mọi trang Next.js. Bản đầu bỏ sót nó, nên hai hàm của
    //   `app/page.tsx` vẫn nằm chung MỘT mảnh và chỗ mù y nguyên — cổng xanh
    //   mà không sửa được gì.
    .split(
      /(?=^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s|^(?:export\s+)?const\s+\w+\s*[:=])/m,
    )
    .filter((x) => x.trim().length > 0);
  for (const m of manh) {
    const nhanhManh = [...m.matchAll(/(?:use|get)Translations\(\s*"([^"]+)"\s*\)/g)].map((x) => x[1]);
    // Mảnh không tự khai nhánh nào ⇒ lùi về nhánh của cả file: biến trợ giúp
    // đặt ngoài hàm là chuyện thường, đoán chặt hơn ở đó sẽ thành báo oan.
    // Nhánh GHÉP ĐỘNG luôn kèm theo: nó khai ở một chỗ trong file (thường là
    // hàm chính) nhưng phục vụ cả file. Bỏ nó ra khỏi mảnh là báo oan tám khoá
    // ở trang ngành — đã đo.
    const dung = nhanhManh.length > 0 ? [...nhanhManh, ...nhanhDong] : nhanh;
    const khoa = [...m.matchAll(/\bt(?:[A-Z]\w*)?\(\s*"([a-zA-Z0-9_.]+)"/g)].map((x) => x[1]);
    for (const k of new Set(khoa)) {
      const co = dung.some((n) => doc(vi, `${n}.${k}`) !== undefined) || doc(vi, k) !== undefined;
      if (!co) {
        if (!thieu.has(f)) thieu.set(f, []);
        if (!thieu.get(f).includes(k)) thieu.get(f).push(k);
      }
    }
  }

  // CHỖ ĐIỀN THIẾU: câu chữ chờ `{days}` mà mã đưa `{ n: … }` thì next-intl
  // ném FORMATTING_ERROR và in nguyên tên khoá ra màn. Cổng đếm khoá KHÔNG
  // thấy — khoá có đủ, chỉ hình dạng lệch. Lỗ này nổ thật 21/08 ngay sau khi
  // màn Chia sẻ báo cáo được vá xong và cổng báo xanh: mở màn thật trên bản
  // chạy thì vẫn hiện `settings.reportShares.create.daysOption`.
  // Chỉ soi lời gọi CÓ đưa tham số — thiếu hẳn tham số thì khuôn dưới không
  // khớp, và đó là ca hiếm hơn nhiều.
  for (const m of src.matchAll(/\bt(?:[A-Z]\w*)?\(\s*"([a-zA-Z0-9_.]+)"\s*,\s*\{([^{}]*)\}/g)) {
    const [, k, doi] = m;
    const cau = nhanh.map((n) => doc(vi, `${n}.${k}`)).find((x) => typeof x === "string") ??
      (typeof doc(vi, k) === "string" ? doc(vi, k) : null);
    if (typeof cau !== "string") continue;
    const dua = khoaDua(doi);
    // `{ ...doi }` trải một biến ⇒ không biết nó mang gì. Bỏ qua cả lời gọi,
    // thà sót còn hơn báo oan.
    if (dua.has("__TRAI__")) continue;
    const thieuDoi = [...choDien(cau)].filter((x) => !dua.has(x));
    if (thieuDoi.length) {
      if (!thieu.has(f)) thieu.set(f, []);
      thieu.get(f).push(`${k} ← thiếu chỗ điền {${thieuDoi.join("}, {")}}`);
    }
  }

  // ⚠️ Dấu chấm trước `${` là BẮT BUỘC. Không có nó thì đây là ghép TÊN KHOÁ
  //   PHẲNG (`t(`faq${i}q`)` → `faq1q`, `t(`log.status_${x}`)` → `log.status_sent`)
  //   chứ không phải một nhánh — và phần đầu (`faq`, `log.status_`) không tồn
  //   tại như một nhánh nào cả. Bản trước đòi hỏi nó phải tồn tại và báo oan
  //   bảy chỗ ở bốn màn. Cái giá: kiểu ghép phẳng KHÔNG được soát.
  // Khoá GHÉP ĐỘNG — `t(`blocked.${k}.title`)`. Không soát được từng nhánh con
  // (giá trị chỉ biết lúc chạy), nhưng soát được PHẦN ĐẦU CỐ ĐỊNH: `blocked`
  // có phải một nhánh trong bộ chữ không. Đúng lỗ đã nổ 21/08 — trang khách
  // ngoài xem gọi ba cụm ghép động mà cả ba thiếu HẲN, trong khi cổng bản đầu
  // vẫn xanh vì nó bỏ qua mọi khoá ghép động.
  for (const m of src.matchAll(/\bt(?:[A-Z]\w*)?\(\s*`([a-zA-Z0-9_.]*[a-zA-Z0-9_])\.\$\{/g)) {
    const dau = m[1];
    if (!dau) continue;
    const co =
      nhanh.some((n) => typeof doc(vi, `${n}.${dau}`) === "object") ||
      typeof doc(vi, dau) === "object";
    if (!co) {
      if (!thieu.has(f)) thieu.set(f, []);
      thieu.get(f).push(`${dau}.…`);
    }
  }
}

if (thieu.size === 0) {
  console.log(`✅ ${daSoat}/${files.length} file màn hình có câu chữ: không màn nào gọi một câu chữ chưa có.`);
  process.exit(0);
}

const tong = [...thieu.values()].reduce((s, a) => s + a.length, 0);
console.error(
  `❌ ${thieu.size} MÀN GỌI ${tong} CÂU CHỮ CHƯA CÓ — người dùng sẽ thấy MÃ MÁY thay vì tiếng Việt.\n`,
);
for (const [f, ks] of thieu) {
  console.error(`   ${f}`);
  console.error(`      ${ks.slice(0, 10).join(", ")}${ks.length > 10 ? ` … và ${ks.length - 10} khoá nữa` : ""}`);
}
console.error(`
   Thêm câu còn thiếu vào CẢ HAI file \`messages/vi.json\` và \`messages/en.json\`,
   rồi chạy \`node scripts/soat-hai-ban-dich.mjs\` để chắc hai bên không lệch.

   ⚠️ Đừng chữa bằng cách xoá lời gọi \`t(...)\` cho cổng xanh — chỗ đó là chữ
   người dùng phải đọc; gỡ đi là đổi một màn nói tiếng máy lấy một màn câm.`);
process.exit(1);
