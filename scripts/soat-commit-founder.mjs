#!/usr/bin/env node
/**
 * Cổng chặn dòng `Founder:` trong thân commit — chốt chặn TẠI GỐC.
 *
 * VÌ SAO CÓ FILE NÀY
 * ------------------
 * Bản tin "🚀 iFan vừa lên bản mới" trong nhóm Telegram lấy dòng `Founder:` của
 * thân commit (migration #112). Quy ước đó tồn tại từ 13/08 nhưng CHỈ LÀ CHỮ
 * TRONG TÀI LIỆU — không có máy nào ép. Kết quả đo được:
 *
 *   14/08: 4/21 commit quên viết · 5 commit CÓ viết vẫn mất (đặt quá sâu, bị
 *          đường truyền của Vercel cắt cụt) ⇒ tới đích ~12/21.
 *   17/08: 5 commit liền điền vào đó NGUYÊN VĂN LỜI CHỈ ĐẠO của founder,
 *          không dấu, bọc trong ngoặc kép — founder nhận lại chính lời mình:
 *            "Tiep tuc ngay, khong duoc dung cho nhu vay nua"
 *          Ca này lan theo kiểu BẮT CHƯỚC: mỗi phiên xem commit trước làm mẫu
 *          thay vì đọc luật, nên một lần sai thành năm lần sai.
 *
 * ADR-0007 mục 12e từng chọn cách khác cho cùng bệnh này: nhờ Haiku soạn lại
 * tin trước khi gửi. Cách đó nay BỊ ĐẢO (founder chốt 17/08: không cắm khoá AI
 * vào máy chủ), và quan trọng hơn — **nó không chữa được ca 17/08**: thử thật
 * trên chính câu trên, Haiku trả về "Tiếp tục ngay, không được dừng cho như vậy
 * nữa", tức chỉ thêm dấu vào lời chỉ đạo. Vẫn vô nghĩa với người đọc.
 *
 * Nên chốt chặn phải nằm ở LÚC VIẾT, không phải lúc gửi.
 *
 * CÁCH DÙNG
 *   node scripts/soat-commit-founder.mjs <file>   # git hook commit-msg
 *   node scripts/soat-commit-founder.mjs --head   # CI: kiểm commit HEAD
 *   node scripts/soat-commit-founder.mjs --test   # tự kiểm (luật D3)
 *
 * PHÂN VAI VỚI LƯỚI ĐỠ TRONG CSDL (tránh phạm D1 — mỗi luật khai một nơi)
 *   • File này giữ phép kiểm Ý NGHĨA: mẫu câu ra lệnh (danh sách hay đổi).
 *   • `tg_release_mark` chỉ giữ phép kiểm HÌNH THỨC (tỷ lệ dấu, ngoặc kép bọc
 *     cả câu) — thứ ổn định, không phải danh sách từ. Đo 17/08: cả 5 ca sai đều
 *     bị hình thức bắt, nên lưới đỡ đủ mạnh mà không cần chép danh sách xuống.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/** Dòng Founder phải nằm trong khoảng này của thân commit (tính theo ký tự). */
const NGUONG_KY_TU = 300;

/**
 * Loại commit KHÔNG ảnh hưởng người dùng ⇒ được khai `Nội bộ:` thay cho
 * `Founder:`, và khi đó **không phát tin vào chủ đề Thông báo**.
 *
 * ⚠️ Vì sao có nhánh này — LỖI CỦA CHÍNH CỔNG NÀY, founder phản ánh 17/08 ngay
 * hôm dựng nó: *"Chủ đề Thông báo cần đúng là thông báo các thay đổi, chứ không
 * phải kiểu: Bản đồ code trong máy đã cập nhật theo các thay đổi hôm nay"*.
 *
 * Nguyên nhân là hệ quả không lường của cổng: nó bắt MỌI commit phải có dòng
 * `Founder:`, kể cả `chore(gitnexus)` — nên người viết (chính tôi) bịa một câu
 * cho đủ luật, và câu đó chảy thẳng vào nhóm. **Một cổng bắt buộc khai báo mà
 * không chừa đường khai "không có gì để báo" thì tự sinh ra rác.**
 */
const TIEN_TO_NOI_BO = ["chore", "ci", "test", "refactor", "style", "build", "docs", "design"];
/** Tỷ lệ ký tự có dấu tối thiểu trên tổng chữ cái. */
const NGUONG_TY_LE_DAU = 0.05;

/**
 * Dấu hiệu câu ra lệnh. Danh sách là CỤM ĐẶC TRƯNG của lời chỉ đạo, không phải
 * từ đơn — vì "Tiếp tục gửi tin khi mất mạng" là câu SẢN PHẨM hợp lệ và phải
 * qua được, dù cũng mở đầu bằng "tiếp tục".
 *
 * Bản đầu của file này neo khớp TOÀN CÂU và ĐÃ ĐỂ LỌT ca thật lúc tự kiểm:
 * "Tiếp tục ngay, không được dừng cho như vậy nữa" — mệnh lệnh có đuôi tự do
 * nên không khớp neo cuối. Bắt được nhờ chính bộ ca ở cuối file, không phải
 * nhờ suy luận; giữ lại ca đó làm ca hồi quy.
 *
 * Cố ý KHÔNG đưa "cho toi khi" vào đây: "Đơn giữ nháp cho tới khi xác nhận" là
 * câu sản phẩm hợp lệ. Ca thật 8f56d89 vẫn bị bắt qua cụm "khong dung lai".
 */
const CUM_RA_LENH = [
  /\btiep tuc ngay\b/,
  /\bchu dong lam\b/,
  /\blam (di|het di|luon|not di|tiep di)\b/,
  /\bkhong duoc dung\b/,
  /\bkhong dung lai\b/,
  /\bcan het chua\b/,
  /\b(doi|chuyen) (qua|sang) (opus|sonnet|fable|haiku|model)\b/,
];

/** Câu mệnh lệnh trơ, không đuôi — khớp toàn câu. */
const CAU_RA_LENH_TRO = [
  /^tiep tuc( ngay| di| luon| lam)*$/,
  /^chu dong( tiep tuc| lam| het| di| luon)*$/,
  /^lam( het| tiep| di| luon| not| ngay)+$/,
];

/** Bỏ dấu tiếng Việt để so mẫu — giữ nguyên bản gốc cho các phép kiểm khác. */
function boDau(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Tỷ lệ ký tự có dấu. `đ` không phân rã khi normalize NFD nên phải đếm riêng,
 * nếu không "Đơn hàng đã đóng" bị tính thiếu dấu.
 */
function tyLeDau(s) {
  const nfd = s.normalize("NFD");
  const soDau =
    (nfd.match(/[̀-ͯ]/g) ?? []).length + (s.match(/[đĐ]/g) ?? []).length;
  const soChu = (boDau(s).match(/[a-zA-Z]/g) ?? []).length;
  if (soChu === 0) return 0;
  return soDau / soChu;
}

/**
 * Soát một thân commit. Trả `{ ok, loi[], cau }`.
 * `loi` rỗng = qua cổng. Merge commit được bỏ qua (không do người viết).
 */
export function soat(than) {
  const loi = [];
  const dongDau = than.split(/\r?\n/)[0] ?? "";
  if (/^Merge\b/.test(dongDau)) return { ok: true, loi: [], cau: null, boQua: true };

  // ① CÓ dòng đó không. Bắt cả hai cách gọi (quy ước #112).
  const khop = than.match(/^[ \t]*(?:Founder|Người dùng thấy gì)[ \t]*:[ \t]*(.+)$/im);

  // ①bis Đường khai "bản này không có gì để báo founder". Phải khai RÕ, không
  //      phải im lặng — và chỉ được dùng với loại commit nội bộ.
  const noiBo = than.match(/^[ \t]*Nội bộ[ \t]*:[ \t]*(.+)$/im);
  const loaiTieuDe = (dongDau.match(/^([a-zA-Z]+)\s*(?:\([^)]*\))?\s*:/) ?? [])[1]?.toLowerCase() ?? "";
  if (noiBo && !khop) {
    if (!TIEN_TO_NOI_BO.includes(loaiTieuDe)) {
      loi.push(
        `Dòng \`Nội bộ:\` chỉ dùng được cho commit KHÔNG ảnh hưởng người dùng ` +
          `(${TIEN_TO_NOI_BO.join("/")}), nhưng commit này là \`${loaiTieuDe || "?"}\`. ` +
          "Bản có ảnh hưởng người dùng thì PHẢI có dòng `Founder:` — người dùng đổi " +
          "gì thì founder có quyền biết.",
      );
      return { ok: false, loi, cau: null };
    }
    return { ok: true, loi: [], cau: null, noiBo: noiBo[1].trim() };
  }

  if (!khop) {
    loi.push(
      "THIẾU dòng `Founder:`. Thêm ngay dưới tiêu đề một câu tiếng Việt CÓ DẤU " +
        "nói NGƯỜI DÙNG ĐƯỢC GÌ (không nói tên file/hàm/bảng).\n" +
        `     Bản chỉ dọn dẹp nội bộ (${TIEN_TO_NOI_BO.join("/")}) thì khai thẳng ` +
        "bằng `Nội bộ: <lý do>` — bản đó sẽ KHÔNG phát tin vào nhóm. Đừng bịa một " +
        "câu cho đủ luật: câu bịa chảy thẳng vào chủ đề Thông báo của founder.",
    );
    return { ok: false, loi, cau: null };
  }
  const cau = khop[1].trim();

  // ② VỊ TRÍ. Đo thật 14/08: dòng ở ký tự 85 tới đích, còn 982/1151/1366/2071
  //    đều bị cắt mất trên đường Vercel → bản tin rơi về tiêu đề KHÔNG DẤU.
  //    Ngưỡng 300 là chọn CÓ BIÊN giữa hai số đo đó, không phải hằng số của
  //    Vercel (họ không công bố) — nên đừng nới nó lên khi commit dài.
  const viTri = khop.index ?? 0;
  if (viTri > NGUONG_KY_TU) {
    loi.push(
      `Dòng Founder nằm ở ký tự ${viTri} — quá sâu, sẽ BỊ CẮT trên đường tới ` +
        `Telegram (ngưỡng an toàn ${NGUONG_KY_TU}). Đặt nó ngay dưới tiêu đề ` +
        `(dòng 3), phần dài cho người thi công để xuống dưới.`,
    );
  }

  // ③ BỌC NGOẶC KÉP = dấu hiệu chép lại lời người khác. Chỉ chặn khi ngoặc bọc
  //    CẢ CÂU — câu hợp lệ vẫn được trích dẫn bên trong, ví dụ:
  //    `Giờ tìm "Liên kết Zalo" là ra, không còn bị gọi hai tên nữa.`
  if (/^["'«"'][\s\S]*["'»"']$/.test(cau)) {
    loi.push(
      `Câu Founder đang bị bọc trong ngoặc kép: ${cau.slice(0, 60)}… — đó là ` +
        "dấu hiệu CHÉP LẠI lời chỉ đạo. Dòng này là lời NHẮN CHO founder về " +
        "cái người dùng nhận được, không phải nhật ký hội thoại.",
    );
  }

  // ④ CÓ DẤU. Founder phản ánh đúng chữ "lỗi không dấu" — bản tin gửi đi đọc
  //    không nổi. Bản thân câu này là thứ DUY NHẤT trong bản tin do người viết.
  const tyLe = tyLeDau(cau);
  if (tyLe < NGUONG_TY_LE_DAU) {
    loi.push(
      `Câu Founder gần như KHÔNG CÓ DẤU (${(tyLe * 100).toFixed(1)}% ký tự có ` +
        `dấu, cần ≥ ${NGUONG_TY_LE_DAU * 100}%): ${cau.slice(0, 60)}… — tiêu đề ` +
        "commit viết không dấu theo quy ước, nhưng dòng này thì PHẢI có dấu.",
    );
  }

  // ⑤ CÂU RA LỆNH. Ca thật 17/08, và là ca lách được ③④ nếu ai đó tự thêm dấu.
  const goc = boDau(cau).toLowerCase().replace(/[.,!?;:…"'«»]/g, "").replace(/\s+/g, " ").trim();
  if (CUM_RA_LENH.some((m) => m.test(goc)) || CAU_RA_LENH_TRO.some((m) => m.test(goc))) {
    loi.push(
      `Câu Founder là một CÂU RA LỆNH ("${cau.slice(0, 50)}"), không phải tin ` +
        "cho founder. Viết cái người dùng được gì; bản chỉ dọn nội bộ thì ghi " +
        'thẳng: "Bản dọn dẹp nội bộ, người dùng không thấy khác biệt."',
    );
  }

  return { ok: loi.length === 0, loi, cau };
}

/* ------------------------------- bộ tự kiểm ------------------------------- */

const CA_DO = [
  // 5 ca THẬT của chiều 17/08 (nguyên văn từ git log).
  ['feat(v3): man Hang hoa\n\nFounder: "Tiep tuc ngay, khong duoc dung cho nhu vay nua"\n', "ca thật 94f2d32"],
  ['feat(v3): orders\n\nFounder: "Tiep tuc ngay, khong duoc dung cho nhu vay nua"\n', "ca thật f80450e"],
  ['feat(v3): di tru\n\nFounder: "Chu dong, tiep tuc, lam khong dung lai cho toi khi can doi qua opus 5"\n', "ca thật 8f56d89"],
  ['docs(adr): sua ADR-0003\n\nFounder: "tiep tuc lam di"\n', "ca thật 0e6e870"],
  ['design(the): ve not 15 the\n\nFounder: "Du design can het chua? chu dong lam het di"\n', "ca thật d440568"],
  // Thiếu hẳn dòng — ca thật db9d6c5 (16:29 17/08).
  ["feat(v3): man Don hang\n\n- lib/catalog/orders.ts: kieu + truy van\n", "thiếu hẳn dòng Founder"],
  // Đặt quá sâu — đúng bệnh 5 commit mất tin ngày 14/08.
  [`fix(x): abc\n\n${"chi tiet thi cong ".repeat(30)}\n\nFounder: Bản mới sửa lỗi lệch giờ.\n`, "đặt quá sâu (bị cắt cụt)"],
  // Ca LÁCH: tự thêm dấu, bỏ ngoặc kép, nhưng vẫn là lời chỉ đạo.
  ["fix(x): abc\n\nFounder: Tiếp tục ngay, không được dừng cho như vậy nữa\n", "lách: chép lời chỉ đạo CÓ DẤU"],
  ["fix(x): abc\n\nFounder: Chủ động làm hết đi\n", "lách: câu ra lệnh có dấu"],
  // Ca LẠM DỤNG đường `Nội bộ:` — dùng nó để né việc báo một thay đổi THẬT.
  ["feat(orders): them man Don hang\n\nNội bộ: không cần báo founder.\n", "lạm dụng `Nội bộ:` cho feat"],
  ["fix(calendar): sua loi lech gio\n\nNội bộ: lỗi nhỏ thôi.\n", "lạm dụng `Nội bộ:` cho fix"],
];

const CA_XANH = [
  ["fix(notifications): goi Zalo la 'lien ket'\n\nFounder: Giờ tìm \"Liên kết Zalo\" là ra, không còn bị gọi hai tên nữa.\n", "trích dẫn BÊN TRONG câu hợp lệ"],
  ["ci(smoke): gan booking-schedule-smoke vao CI\n\nFounder: Bài kiểm chống lỗi lệch giờ nay chạy tự động mỗi lần ra bản.\n", "ca thật đúng khuôn"],
  ["design(v3): 3 the man Tien that\n\nFounder: Đã vẽ xong 3 màn cốt lõi của đợt bán hàng–thu tiền, và phát hiện 2 thẻ cũ dán nhãn sai suốt 4 ngày.\n", "ca thật 9bb1bee"],
  ["feat(v3): man So quy\n\nNgười dùng thấy gì: Màn Sổ quỹ hiện đủ ba con số thu, chi và còn lại.\n", "cách gọi thứ hai"],
  ["chore(deps): nang thu vien\n\nFounder: Bản dọn dẹp nội bộ, người dùng không thấy khác biệt.\n", "bản nội bộ khai thật"],
  ["chore(gitnexus): cap nhat ban do code\n\nNội bộ: chỉ cập nhật bản đồ code trong máy, không đổi gì với người dùng.\n", "khai `Nội bộ:` — hợp lệ, KHÔNG phát tin"],
  ["ci(smoke): them buoc kiem so migration\n\nNội bộ: cổng kiểm nội bộ, người dùng không thấy.\n", "`Nội bộ:` với tiền tố ci — hợp lệ"],
  ["refactor(x): don code\n\nFounder: Tiếp tục gửi tin khi mất mạng, không còn rơi tin nào.\n", "câu SẢN PHẨM chứa chữ 'tiếp tục' — không được chặn oan"],
  ["Merge branch 'main' into feature\n", "merge commit — bỏ qua"],
];

function tuKiem() {
  let hong = 0;
  console.log("[soat-commit] Ca PHẢI ĐỎ (cổng phải bắt được):");
  for (const [than, ten] of CA_DO) {
    const r = soat(than);
    const dat = !r.ok;
    if (!dat) hong += 1;
    console.log(`  ${dat ? "✓ chặn đúng" : "✗ LỌT"} — ${ten}`);
    if (dat) console.log(`      lý do: ${r.loi[0].split("\n")[0].slice(0, 96)}`);
  }
  console.log("[soat-commit] Ca PHẢI XANH (không được chặn oan):");
  for (const [than, ten] of CA_XANH) {
    const r = soat(than);
    if (!r.ok) hong += 1;
    console.log(`  ${r.ok ? "✓ qua" : "✗ CHẶN OAN"} — ${ten}`);
    if (!r.ok) console.log(`      lý do sai: ${r.loi.join(" | ").slice(0, 140)}`);
  }
  const tong = CA_DO.length + CA_XANH.length;
  console.log(`[soat-commit] ${tong - hong}/${tong} ca đúng.`);
  return hong === 0;
}

/* --------------------------------- chạy --------------------------------- */

function main() {
  const arg = process.argv[2];

  if (arg === "--test") {
    process.exit(tuKiem() ? 0 : 1);
  }

  let than;
  if (arg === "--head") {
    than = execFileSync("git", ["log", "-1", "--format=%B"], { encoding: "utf8" });
  } else if (arg) {
    than = readFileSync(arg, "utf8");
  } else {
    console.error("Thiếu tham số: <file> | --head | --test");
    process.exit(2);
  }

  // Bỏ phần chú thích git tự chèn vào file soạn commit.
  than = than
    .split(/\r?\n/)
    .filter((d) => !d.startsWith("#"))
    .join("\n");

  const r = soat(than);
  if (r.boQua) {
    console.log("[soat-commit] Merge commit — bỏ qua.");
    process.exit(0);
  }
  if (r.ok) {
    if (r.noiBo) {
      console.log(`[soat-commit] ✓ Bản NỘI BỘ (không phát tin vào nhóm): ${r.noiBo}`);
    } else {
      console.log(`[soat-commit] ✓ Câu gửi founder: ${r.cau}`);
    }
    process.exit(0);
  }

  console.error("\n❌ COMMIT BỊ TỪ CHỐI — dòng `Founder:` chưa đúng:\n");
  for (const l of r.loi) console.error(`   • ${l}\n`);
  console.error("Khuôn đúng (dòng Founder NGAY DƯỚI tiêu đề):\n");
  console.error("   feat(orders): them man Don hang        <- tiêu đề: KHÔNG dấu");
  console.error("");
  console.error("   Founder: Giờ xem được đơn hàng của khách và biết ai còn nợ tiền.");
  console.error("");
  console.error("   ...phần dài cho người thi công để xuống dưới...\n");
  process.exit(1);
}

// Chỉ chạy khi gọi trực tiếp — `soat()` được bộ kiểm khác nhập lại.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  main();
}
