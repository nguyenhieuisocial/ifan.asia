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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = "C:/dev/ifan.asia/design-system";
const GOC_KHO = path.dirname(DIR);
// Lọc cờ ra khỏi danh sách tên thẻ — nếu không `--do-phu` bị hiểu là tên file.
const thamSo = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ds = thamSo.length ? thamSo : readdirSync(DIR).filter((f) => f.endsWith(".html"));

// BẢN ĐỒ MÀN → THẺ. Bắt buộc KHAI TƯỜNG MINH: mỗi màn dưới `app/app/**/page.tsx`
// phải có một dòng ở đây — hoặc trỏ tới thẻ, hoặc để `null` kèm lý do miễn.
// Màn MỚI chưa khai ⇒ cổng `--do-phu` báo ĐỎ.
// Cố ý KHÔNG đoán thẻ theo tên thư mục: đoán sai thì cổng vừa kêu oan vừa bỏ
// lọt, mà cổng kêu oan là cổng sẽ bị tắt đi.
const THIEU = "THIẾU"; // nợ ĐÃ BIẾT: màn có thật, chưa vẽ thẻ. Khác hẳn "chưa khai".
const BAN_DO_THE = {
  "app/app": "man-tong-quan.html",
  "app/app/approvals": "man-duyet.html",
  "app/app/approvals/new": "man-duyet.html",          // thẻ tự khai phủ cả /new
  "app/app/calendar": "man-lich-hen.html",
  "app/app/cashbook": "man-so-quy.html",
  "app/app/companies": "man-cong-ty.html",
  "app/app/companies/[id]": "man-ho-so.html",         // khuôn hồ sơ (công ty)
  "app/app/contacts": "man-khach-hang.html",
  "app/app/contacts/[id]": "man-ho-so.html",          // khuôn hồ sơ (khách)
  "app/app/contacts/duplicates": "nhap-va-gop-du-lieu.html",
  "app/app/deals": "board.html",
  "app/app/deals/[id]": "man-chi-tiet-co-hoi.html",
  "app/app/inbox": "man-hop-thu.html",
  "app/app/items": "man-hang-hoa.html",
  "app/app/notifications": "thong-bao.html",
  "app/app/orders": "man-don-hang.html",
  // Tách thẻ (17/08): `man-thu-tien-vietqr.html` giữ CƠ CHẾ thu tiền (3 cách
  // trả, QR, thu nhiều lần) — nó là một KHỐI bên trong trang, không phải cả
  // trang. Trang chi tiết đơn có đường dẫn riêng nên có thẻ riêng, giữ nếp
  // "một thẻ = một màn" mà cả kho đang theo.
  "app/app/orders/[id]": "man-chi-tiet-don.html",
  "app/app/orders/new": "man-tao-don-moi.html",
  "app/app/reports": null,                            // chuyển hướng thuần, không có giao diện
  "app/app/reports/gross-margin": "man-lai-gop.html",
  "app/app/reports/kpi": "man-muc-tieu-thang.html",
  "app/app/reports/lost-reasons": "luat-vi-sao-thang-thua.html",
  "app/app/reports/sources": "man-bao-cao-nguon-khach.html",
  "app/app/settings": "man-cai-dat-khung.html",
  "app/app/settings/account": "man-tai-khoan.html",
  "app/app/settings/ai-autopilot": "man-ai-truc-viec.html",
  "app/app/settings/billing": "man-goi-cuoc.html",
  "app/app/settings/channels": "the-kenh-ket-noi.html",
  "app/app/settings/channels/livechat": "man-live-chat-cai-dat.html",
  "app/app/settings/channels/storefront": "man-cai-dat-mat-tien.html",
  "app/app/settings/forms": "man-bieu-mau.html",
  "app/app/settings/forms/[id]": "man-bieu-mau.html", // trình dựng nằm cùng thẻ
  "app/app/settings/industry": "industry-settings.html",
  "app/app/settings/knowledge": "man-kho-tri-thuc.html",
  "app/app/settings/login-log": "nhat-ky-dang-nhap.html",
  "app/app/settings/notifications": "man-zalo-bot.html",
  "app/app/settings/payments": "man-nhan-thanh-toan.html",
  "app/app/settings/qr": "man-ma-qr.html",
  "app/app/settings/replies": "man-mau-tra-loi.html",
  "app/app/settings/services": "man-cai-dat-dich-vu.html",
  "app/app/settings/sla": "man-cam-ket.html",
  "app/app/settings/support-log": "man-ho-tro-chi-doc.html",
  "app/app/settings/tags": "man-quan-ly-nhan.html",
  "app/app/settings/team": "man-doi-ngu.html",
  "app/app/settings/tiers": "man-hang-khach.html",
  "app/app/settings/trash": "trash.html",
  "app/app/settings/workflows": "man-tu-dong.html",
  // ── V4 KHO: khai TRƯỚC khi có màn (ADR-0021 mục 8 việc 2) ────────────────
  // Ba màn này chưa có `page.tsx`, nên `--do-phu` chưa đếm tới. Khai sẵn để
  // ngày người code dựng màn thì không phải nhớ quay lại đây — và để luật 7
  // tự bật lên đúng lúc: hễ `page.tsx` xuất hiện, thẻ nào còn dán nhãn
  // "chưa có code" là cổng đỏ ngay.
  "app/app/stock": "man-kho.html",
  "app/app/stock/purchases": "man-phieu-nhap.html",
  "app/app/stock/stocktake": "man-kiem-ke.html",
  "app/app/tasks": "man-cong-viec.html",
  // ⚠️ Ca YẾU NHẤT bảng này: `luat-can-chu-y.html` là thẻ LUẬT (nhóm "Thành
  // phần"), không phải thẻ màn — nhưng nó tự khai tả đúng `today-view.tsx` và
  // vẽ 3/4 khối của màn. Ghi nhận là ĐÃ PHỦ nhưng phủ mỏng: màn Hôm nay là màn
  // chủ tiệm mở đầu ngày mà chưa có thẻ riêng. Ai siết chặt hơn thì đổi THIEU.
  "app/app/today": "luat-can-chu-y.html",

  // ── VÙNG CÔNG KHAI (ngoài đăng nhập) ─────────────────────────────────────
  // THÊM 18/08: bản đầu của `--do-phu` CHỈ quét `app/app/**`, nên 19 trang
  // công khai — trang chủ, bảng giá, đăng nhập, mặt tiền tiệm… — KHÔNG nằm
  // dưới cổng nào. Thêm một trang công khai mới thì chẳng có gì kêu lên, mà
  // đây mới đúng là phần người lạ nhìn thấy đầu tiên.
  "app": "landing-hero.html",              // trang chủ khoá theo 4 thẻ landing-*, hero là khối 1/5
  "app/admin": "man-admin.html",
  "app/bang-gia": "trang-bang-gia.html",
  // Một thẻ `auth-screens.html` CỐ Ý phủ cả 5 cửa mật khẩu: chúng dùng chung
  // một khung và thẻ tự khai đủ cả 5 (đăng nhập · đăng ký · quên · đặt lại ·
  // buộc đổi). Tách 5 thẻ ở đây là chia nhỏ cùng một bản vẽ.
  "app/force-password-change": "auth-screens.html",
  "app/forgot-password": "auth-screens.html",
  "app/invite/[token]": "man-nhan-loi-moi.html",
  "app/livechat-demo": "man-trang-thu-hop-chat.html",
  "app/lo-trinh": "trang-lo-trinh.html",
  "app/login": "auth-screens.html",
  "app/login/staff": null,                 // chuyển hướng thuần về /login (11/08), không có giao diện
  "app/nganh/[slug]": "trang-theo-nganh.html",
  "app/offline": "man-pwa.html",
  "app/onboarding": "man-tao-tiem.html",
  "app/privacy": "man-trang-phap-ly.html",
  "app/reset-password": "auth-screens.html",
  "app/signup": "auth-screens.html",
  "app/t/[slug]": "man-mat-tien-tiem.html",
  "app/terms": "man-trang-phap-ly.html",
  "app/tinh-nang": "trang-tinh-nang.html",
};
/**
 * Thẻ nào đang mô tả một màn ĐÃ CÓ CODE — dùng cho luật 7.
 *
 * ĐO TRÊN ĐĨA, KHÔNG TIN BẢNG (sửa 18/08, lúc khai 3 màn kho của V4): bản trước
 * lấy thẳng mọi giá trị trong `BAN_DO_THE`, tức ngầm cho rằng hễ có tên trong
 * bảng là màn đã chạy. Điều đó chỉ đúng khi bảng chỉ được thêm SAU khi màn có
 * thật. Nhưng luật của dự án là **vẽ thẻ TRƯỚC khi code màn** (ADR-0021 mục 8
 * việc 2), nên bảng phải khai được cả màn chưa dựng — và ngay lúc khai, cổng
 * quay ra mắng 3 thẻ đang ĐÚNG là "màn đã chạy thật, bỏ nhãn đi".
 *
 * Cổng kêu oan là cổng bị tắt đi — đúng con bệnh file này sinh ra để chữa. Nên
 * hỏi thẳng đĩa: có `page.tsx` thì mới tính là đã có code. Được thêm một cái
 * lợi: ngày ai đó dựng `app/app/stock/page.tsx`, luật 7 TỰ bật lên đòi gỡ nhãn
 * "chưa có code" — không cần ai nhớ.
 */
const MAN_CO_CODE = new Set(
  Object.entries(BAN_DO_THE)
    .filter(([man, the]) => the && the !== THIEU && existsSync(path.join(GOC_KHO, man, "page.tsx")))
    .map(([, the]) => the),
);

/**
 * Ghi chú TỰ KHAI "cả màn này chưa có code" — dùng cho luật 7.
 *
 * Cả kho chỉ dùng đúng hai lối khai, và luật này bám sát hai lối đó:
 *   · mở đầu ghi chú luôn:            `<p class="note"><b>CHƯA CÓ CODE</b> — …`
 *   · sau nhãn trạng thái:            `Trạng thái hiện tại: <b>CHƯA CÓ CODE</b>`
 *
 * CỐ Ý KHÔNG bắt mọi chữ "chưa có code" nằm trong ghi chú — ghi chú là chỗ thẻ
 * KỂ LẠI LỊCH SỬ và khai nợ TỪNG PHẦN, bắt rộng là cổng kêu oan ngay 3 thẻ
 * đang đúng: `man-lich-hen`/`man-dat-lich-tu-chat` kể "tiêu đề còn ghi
 * '(chưa có code)' 4 ngày sau khi màn đã chạy" (câu sửa sai, không phải lỗi),
 * `man-tai-khoan` khai một KHỐI còn là đề xuất, `industry-settings` khai
 * "Nhánh 3 CHƯA CÓ CODE" — cả màn vẫn chạy thật. Mà cổng kêu oan là cổng bị
 * tắt đi, đúng con bệnh file này sinh ra để chữa.
 */
const KHAI_CHUA_CODE =
  /<p class="note">(?:\s|<[^>]+>)*CHƯA CÓ CODE|Trạng thái(?:\s+hiện tại)?\s*:\s*(?:\s|<[^>]+>)*CHƯA CÓ CODE/;

/**
 * HẰNG SỐ SỰ THẬT — thẻ in ra giá trị nào thì phải khớp giá trị code đang chạy.
 *
 * VÌ SAO CÓ (17/08, ngay sau việc #163): thẻ `auth-screens.html` in tài khoản
 * demo `demo.ifan.2026@gmail.com`. Code đã đổi sang `xem.demo.ifan.2026@gmail.com`
 * vì tài khoản cũ là CHỦ TIỆM — người lạ bấm nút demo xoá được sạch dữ liệu mẫu.
 * Thẻ vẫn in tài khoản nguy hiểm đó, mà **cổng này báo "0 vấn đề"**: 7 luật cũ
 * chỉ soi KHUNG (marker, title, div cân, note…) và ĐỘ PHỦ, không hề soi NỘI DUNG.
 * Lệch nội dung tái phát chỉ 2 giờ sau khi vừa đóng việc #164 về đúng bệnh này.
 *
 * Giá trị đúng ĐỌC TỪ CODE lúc chạy, KHÔNG chép tay vào đây — chép tay thì đến
 * lượt bảng này lệch, chỉ dời chỗ hỏng đi một nấc.
 */
const HANG_SO_THAT = [
  {
    ten: "email tài khoản xem thử",
    thatLa: () => docHang("lib/demo.ts", /DEMO_VIEWER_EMAIL\s*=\s*"([^"]+)"/),
    // Bắt MỌI chuỗi trông giống email demo, kể cả bản cũ đã bỏ.
    timTrongThe: /[\w.-]*demo\.ifan\.2026@gmail\.com/g,
  },
  {
    ten: "mật khẩu tài khoản xem thử",
    thatLa: () => docHang("lib/demo.ts", /DEMO_VIEWER_PASSWORD\s*=\s*"([^"]+)"/),
    timTrongThe: /\b\w*DemoIfan#2026\b/g,
  },
  {
    // Migration #88 (13/08) gộp 4 gói về 2 và đổi giá. 12 thẻ vẫn in bảng giá
    // cũ suốt 5 ngày — trong đó `man-goi-cuoc.html` là thẻ của màn ĐANG CHẠY,
    // in "Gói Tiệm 299.000đ" trong khi gói thật tên "iFan", giá 99.000đ.
    ten: "giá gói trả phí (theo tháng)",
    thatLa: () => `${Number(docHangMigrationCuoi(/price_month\s*=\s*(\d+)/g)).toLocaleString("vi-VN")}đ`,
    // CHỈ bắt giá đi kèm "/tháng" — giá dịch vụ spa (350.000đ) không có đuôi
    // đó, bắt rộng hơn là cổng kêu oan, mà cổng kêu oan là cổng bị tắt đi.
    timTrongThe: /\d{1,3}(?:\.\d{3})+\s*đ(?=\s*\/\s*tháng)/g,
    boQuaGhiChu: true,
    chuanHoa: (s) => s.replace(/\s+/g, ""), // "99.000 đ" và "99.000đ" là một
  },
  {
    // Tên gói là danh sách ĐÓNG (chỉ "Miễn phí" + tên gói trả phí), nên bắt
    // theo danh sách tên ĐÃ CHẾT là chắc chắn, không thể oan.
    ten: "tên gói cước",
    thatLa: () => docHangMigrationCuoi(/name_vi\s*=\s*'([^']+)'/g),
    timTrongThe: /(?<=[Gg]ói )(?:Tiệm|Chuỗi|Cơ bản|Chuyên nghiệp|Doanh nghiệp|Khởi đầu|Nâng cao)\b/g,
    boQuaGhiChu: true,
  },
];

/**
 * `boQuaGhiChu`: khối `<p class="note">` cuối thẻ được phép NHẮC LẠI giá/tên
 * gói CŨ — đó là câu kể lịch sử ("thẻ từng in Gói Tiệm 299.000đ, migration
 * 13/08 đã gộp về 2 gói"), không phải thẻ đang dạy sai. Bắt cả ghi chú thì
 * cổng đỏ vĩnh viễn ngay sau mỗi lần vá, mà cổng đỏ vĩnh viễn thì bị tắt đi.
 *
 * KHÔNG bật cờ này cho email/mật khẩu demo: đó là thứ người ta copy-paste
 * thẳng từ thẻ, in bản cũ ở bất kỳ đâu cũng nguy hiểm.
 */
function thanBai(s) {
  return s.replace(/<p class="note">[\s\S]*?<\/p>/g, " ");
}

function docHang(tuongDoi, re) {
  const m = readFileSync(path.join(GOC_KHO, tuongDoi), "utf8").match(re);
  if (!m) throw new Error(`Không đọc được hằng số từ ${tuongDoi} — sửa lại soat-the-design.mjs`);
  return m[1];
}

/**
 * Đọc hằng số từ MIGRATION MỚI NHẤT có khai nó.
 *
 * Migration là append-only: giá gói khai ở #27, rồi #88 (13/08) gộp 4 gói về 2
 * và đổi giá. Neo vào một file cụ thể là hỏng ngay lần đổi giá sau — nên quét
 * cả thư mục theo thứ tự số hiệu và lấy LẦN KHAI CUỐI CÙNG.
 */
function docHangMigrationCuoi(re) {
  const thuMuc = path.join(GOC_KHO, "supabase", "migrations");
  let ketQua = null;
  for (const f of readdirSync(thuMuc).filter((x) => x.endsWith(".sql")).sort()) {
    for (const m of readFileSync(path.join(thuMuc, f), "utf8").matchAll(re)) ketQua = m[1];
  }
  if (ketQua === null) throw new Error(`Không migration nào khai ${re} — sửa lại soat-the-design.mjs`);
  return ketQua;
}

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

  // 7. Màn ĐÃ CÓ CODE mà thẻ vẫn tự khai "chưa có code" — chiều NGƯỢC của
  // luật 5. Bản đầu chỉ bắt được chiều xuôi nên cả 3 thẻ V3 lọt lưới: vẽ lúc
  // 13:55, code chạy thật lúc 16:00–17:00, tiêu đề vẫn khai "chưa có code" và
  // KHÔNG có gì kêu (việc #161, đợt 43).
  //
  // MỞ RỘNG 18/08: bản trước CHỈ soi `<title>`, nên `man-ai-truc-viec.html`
  // lọt lưới — tiêu đề sạch, nhưng GHI CHÚ cuối thẻ vẫn khai "Trạng thái hiện
  // tại: CHƯA CÓ CODE" trong khi màn `app/app/settings/ai-autopilot` đã chạy
  // thật từ 13/08. Ghi chú mới là chỗ người ta đọc để biết màn có thật hay
  // chưa, nên nó phải bị soi ngang tiêu đề.
  const ghiChu = (s.match(/<p class="note">[\s\S]*?<\/p>/g) ?? []).join(" ");
  if ((chuaCode || KHAI_CHUA_CODE.test(ghiChu)) && MAN_CO_CODE.has(ten)) {
    loi++;
    const cho = chuaCode ? "tiêu đề" : "ghi chú";
    console.log(`✗ ${ten}\n    ${cho} khai "chưa có code" nhưng màn ĐÃ CHẠY THẬT — bỏ nhãn đi`);
    continue;
  }

  // 8. Hằng số in trong thẻ phải khớp code THẬT (xem HANG_SO_THAT ở trên).
  for (const h of HANG_SO_THAT) {
    const dung = h.thatLa();
    const nhu = h.chuanHoa ?? ((x) => x);
    for (const thay of new Set((h.boQuaGhiChu ? thanBai(s) : s).match(h.timTrongThe) ?? [])) {
      if (nhu(thay) !== nhu(dung)) bug.push(`${h.ten} lệch code: thẻ in "${thay}", code thật là "${dung}"`);
    }
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
  const GOC_APP = path.join(GOC_KHO, "app");
  // HAI VÙNG, MỘT BẢN ĐỒ: `app/app/**` là vùng đã đăng nhập; phần còn lại của
  // `app/**` là vùng công khai. Trước 18/08 chỉ vùng đầu được đếm.
  const man = [
    ...quetMan(path.join(GOC_APP, "app")).map((d) => (d === "." ? "app/app" : `app/app/${d}`)),
    ...quetMan(GOC_APP)
      .filter((d) => d !== "app" && !d.startsWith("app/")) // trừ vùng đã đăng nhập, quét ở dòng trên
      .map((d) => (d === "." ? "app" : `app/${d}`)),
  ];
  // PHÂN BIỆT HAI THỨ KHÁC HẲN NHAU — đây là chỗ quyết định cổng này sống hay
  // bị tắt đi:
  //   · CHƯA KHAI  = màn mới ai đó thêm mà quên khai  ⇒ ĐỎ, phải chặn ngay.
  //   · THIẾU      = nợ ĐÃ BIẾT, đã ghi tên, đang xếp hàng chờ vẽ ⇒ đếm ra
  //                  cho thấy, KHÔNG tính là lỗi.
  // Nếu gộp hai thứ này làm một thì cổng đỏ vĩnh viễn vì mấy món nợ cũ, mà
  // cổng đỏ vĩnh viễn thì người ta thôi nhìn — đúng con bệnh nó sinh ra để chữa.
  const chuaKhai = [];
  const no = [];
  const thieuFile = [];
  const coSan = new Set(readdirSync(DIR));
  for (const m of man) {
    const the = BAN_DO_THE[m];
    if (the === undefined) { chuaKhai.push(m); continue; }
    if (the === null) continue;              // miễn tường minh (trang chuyển hướng…)
    if (the === THIEU) { no.push(m); continue; }
    if (!coSan.has(the)) thieuFile.push(`${m} → ${the}`);
  }
  if (chuaKhai.length) {
    loi += chuaKhai.length;
    console.log(`\n✗ ${chuaKhai.length} màn CHƯA KHAI vào BAN_DO_THE (màn mới phải khai thẻ):`);
    for (const m of chuaKhai) console.log(`    ${m}`);
  }
  if (thieuFile.length) {
    loi += thieuFile.length;
    console.log(`\n✗ ${thieuFile.length} màn khai thẻ nhưng FILE THẺ KHÔNG CÓ:`);
    for (const t of thieuFile) console.log(`    ${t}`);
  }
  const phu = man.length - chuaKhai.length - no.length - thieuFile.length;
  console.log(`\nĐộ phủ thẻ: ${phu}/${man.length} màn đã có thẻ.`);
  if (no.length) {
    console.log(`Nợ đã biết (${no.length} màn chờ vẽ thẻ — không tính là lỗi):`);
    for (const m of no) console.log(`    ${m}`);
  }
}

console.log(`\nĐã soát ${ds.length} thẻ · ${loi} vấn đề.`);
process.exit(loi ? 1 : 0);
