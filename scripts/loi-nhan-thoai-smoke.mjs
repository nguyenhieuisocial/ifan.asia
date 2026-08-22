/**
 * CỔNG: TRỌN LUỒNG LỜI NHẮN THOẠI — bấm ghi → thu được tiếng → dừng → tải lên
 * kho → gửi (KHÔNG gõ chữ) → tin hiện trong khung chat → bấm phát nghe được.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Nút ghi âm trong Chat nội bộ (`app/app/chat/nut-ghi-am.tsx`) ra bản cùng đợt
 * với ảnh đính kèm. Ngày 22/08, `next.config.ts` được sửa từ
 * `Permissions-Policy: microphone=()` sang `microphone=(self)` — trước đó micro
 * bị chặn hoàn toàn nên nút ấy CHƯA TỪNG CHẠY ĐƯỢC.
 *
 * Nhưng mở header xong KHÔNG PHẢI LÀ XONG. Đo trọn luồng trên bản dựng thật
 * ngay sau đó, còn lộ thêm BỐN mắt xích đứt — mắt nào đứt cũng ra cùng một hậu
 * quả: thợ nói xong mà lời nhắn không tới ai:
 *
 *   ① CSDL từ chối tin KHÔNG CÓ CHỮ. Ràng buộc `chat_messages_body_check` đòi
 *      `length(trim(body)) >= 1`; nó có từ #298, trước khi tin nhắn biết đính
 *      kèm tệp. Mà lời nhắn thoại thì theo định nghĩa là KHÔNG có chữ nào.
 *      Người gửi chỉ thấy "Nội dung không hợp lệ." — nghe như họ gõ sai.
 *   ② CSP thiếu `media-src`. Tệp lên kho đàng hoàng, đường dẫn ký hợp lệ, kho
 *      trả đúng `audio/webm`, nhưng trình duyệt từ chối nạp: thanh phát hiện
 *      ra BÌNH THƯỜNG, bấm nút phát thì không có gì xảy ra, không một chữ báo.
 *   ③ Đính thêm một tấm ảnh TRONG LÚC đang ghi ⇒ ảnh đó biến mất khi ghi xong
 *      (bản chụp danh sách tệp bị ghi đè). Ảnh đã tải lên kho rồi mới bị bỏ.
 *   ④ Rời màn Chat giữa chừng ⇒ micro vẫn ở trạng thái `live` mãi. Nút ghi âm
 *      đã biến mất cùng màn, không còn gì tắt nó được.
 *
 * Thêm một chỗ IM LẶNG nữa: bấm ghi rồi dừng gần như tức thì thì máy ghi chưa
 * cắt được mảnh nào ⇒ tệp rỗng, và mã cũ `return` không kèm lời nào.
 *
 * ⚠️ BÀI HỌC CHUNG với cổng ảnh chấm công: canh từng mảnh thì mảnh nào cũng
 *   "đúng" mà chuỗi vẫn đứt. Cổng này đi HẾT chuỗi trên trình duyệt thật, và
 *   SOI RUỘT tệp đã lưu (giải mã ra bao nhiêu giây, có tiếng hay câm, tiếng đó
 *   có đúng là tiếng từ micro không) chứ không chỉ xem sổ có dòng nào.
 *
 * ⚠️ MICRO GIẢ: nạp một tệp .wav do chính file này dựng bằng mã
 *   (`--use-file-for-fake-audio-capture`), phát một sóng sin 440 Hz. Chọn tiếng
 *   CÓ TẦN SỐ BIẾT TRƯỚC là cố ý: tệp lưu ra mà đo được đúng 440 Hz thì chỉ có
 *   thể do tiếng từ micro đi hết đường. Micro giả MẶC ĐỊNH của Chrome cũng kêu
 *   bíp, nhưng nó không cho ta một mốc để đối chiếu.
 *
 * ⚠️ CỔNG NÀY GHI VÀO KHO DỮ LIỆU: nó gửi một lời nhắn thoại thật vào kênh
 *   "Cả tiệm" của tiệm demo, rồi DỌN SẠCH (xoá tin, xoá mọi tệp nó đã tải lên)
 *   trong khối `finally`. Dọn không sạch thì báo ĐỎ chứ không im.
 *
 * Chạy: node scripts/loi-nhan-thoai-smoke.mjs [địa-chỉ]
 * Cần env: NEXT_PUBLIC_SUPABASE_URL (hoặc SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const NEN = process.argv[2] ?? process.env.DIA_CHI ?? "http://localhost:3000";
const CENT = "C:/Users/Admin/AppData/Local/CentBrowser/Application/chrome.exe";
const EMAIL = "demo.ifan.2026@gmail.com";
const MAT_KHAU = "DemoIfan#2026";

// Đọc .env.local khi chạy tay — CI thì đã có env sẵn.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && existsSync(path.join(GOC, ".env.local"))) {
  for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const URL_NEN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KHOA = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_NEN || !KHOA) {
  // Thiếu đồ nghề thì ĐỎ, không tự bỏ qua: một cổng tự bỏ qua không phân biệt
  // được với một cổng luôn xanh.
  console.error("❌ Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

let duongTrinhDuyet = null;
if (process.platform === "win32") {
  // Luật máy founder: duyệt web tự động đi bằng Cent Browser.
  if (!existsSync(CENT)) {
    console.error(`❌ Không tìm thấy Cent Browser ở: ${CENT}`);
    process.exit(1);
  }
  duongTrinhDuyet = CENT;
}

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

/**
 * Bấm mà KHÔNG ném lỗi khi không bấm được — cùng lý do với cổng ảnh chấm công:
 * một mắt xích đứt sớm mà để `click` ném thẳng lên thì bản kiểm dừng ngay và
 * chỉ in "locator.click timeout", người đọc không biết mắt nào đứt.
 */
const bam = async (loc, giay = 15) => {
  try {
    await loc.click({ timeout: giay * 1000 });
    return true;
  } catch {
    return false;
  }
};

/**
 * Rình mọi câu thông báo hiện ra trong `giay` giây.
 *
 * ⚠️ PHẢI rình liên tục chứ không đợi rồi mới đọc: hộp thông báo tự tắt sau
 *   khoảng 4 giây. Đo 22/08 đã dính đúng bẫy này — đợi 5 giây rồi mới đọc thì
 *   thấy TRỐNG, và suýt kết luận nhầm là "không có câu báo nào".
 */
async function rinhThongBao(p, giay) {
  const thay = new Set();
  for (let i = 0; i < giay * 5; i++) {
    for (const x of await p.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])) {
      thay.add(x.replace(/\s+/g, " ").trim());
    }
    await p.waitForTimeout(200);
  }
  return [...thay];
}

// ════════════════════════════════════════════════════════════════════
// MICRO GIẢ — dựng một tệp .wav bằng mã
// ════════════════════════════════════════════════════════════════════
const TAN_SO = 440; // nốt La — mốc để nhận ra tiếng này trong tệp đã lưu
const TAN_SO_DOI_CHUNG = 1500; // không có trong nguồn; dùng để so cho biết 440 là thật
const NHIP = 48000;
const GIAY_NGUON = 6;

/**
 * WAV = 44 byte tiêu đề rồi mẫu PCM 16-bit nối đuôi. Chrome nhận thẳng.
 *
 * Nguồn dài 6 giây, còn cổng chỉ ghi ~4 giây, nên không bao giờ chạm mép tệp —
 * khỏi phải lo Chrome lặp lại tệp có cắt ngang chu kỳ hay không.
 */
function dungTepMicroGia() {
  const thuMuc = path.join(os.tmpdir(), "ifan-micro-gia");
  mkdirSync(thuMuc, { recursive: true });
  const tep = path.join(thuMuc, `sin-${TAN_SO}hz-${NHIP}.wav`);
  const soMau = NHIP * GIAY_NGUON;
  const pcm = Buffer.alloc(soMau * 2);
  for (let i = 0; i < soMau; i++) {
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * TAN_SO * i) / NHIP) * 22000), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); // cỡ khối fmt
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // 1 kênh
  h.writeUInt32LE(NHIP, 24);
  h.writeUInt32LE(NHIP * 2, 28); // byte mỗi giây
  h.writeUInt16LE(2, 32); // byte mỗi khung
  h.writeUInt16LE(16, 34); // bit mỗi mẫu
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  writeFileSync(tep, Buffer.concat([h, pcm]));
  return tep;
}

/** Ảnh PNG 1×1 — chỉ để thử "đính thêm tệp trong lúc đang ghi". */
function dungAnhTiHon() {
  const tep = path.join(os.tmpdir(), "ifan-micro-gia", "anh-kem-luc-ghi.png");
  writeFileSync(
    tep,
    Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
        "0000000a49444154789c6360000002000100ffff03000006000557bfabd4000000" +
        "0049454e44ae426082",
      "hex",
    ),
  );
  return tep;
}

// ════════════════════════════════════════════════════════════════════
// CHUẨN BỊ — tài khoản demo phải thuộc đúng một tiệm
// ════════════════════════════════════════════════════════════════════
const kho = createClient(URL_NEN, KHOA, { auth: { persistSession: false } });

const { data: nguoiDung, error: loiNguoi } = await kho.auth.admin.listUsers({ perPage: 200 });
if (loiNguoi) {
  console.error(`❌ Không đọc được danh sách tài khoản: ${loiNguoi.message}`);
  process.exit(1);
}
const taiKhoan = (nguoiDung?.users ?? []).find((u) => u.email === EMAIL);
if (!taiKhoan) {
  console.error(`❌ Kho này không có tài khoản ${EMAIL} — máy chủ và kho có cùng một dự án không?`);
  process.exit(1);
}
const { data: theTiem } = await kho
  .from("tenant_members")
  .select("tenant_id")
  .eq("user_id", taiKhoan.id);
if (!theTiem || theTiem.length !== 1) {
  console.error(`❌ Tài khoản demo phải thuộc ĐÚNG một tiệm, đang thấy ${theTiem?.length ?? 0}.`);
  process.exit(1);
}
const TIEM = theTiem[0].tenant_id;

const MOC = new Date().toISOString(); // thứ gì sinh ra SAU mốc này là của cổng
const tepWav = dungTepMicroGia();
const tepAnh = dungAnhTiHon();

const trinhDuyet = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
  args: [
    // Bỏ hộp thoại hỏi quyền micro — hộp đó không phải phần iFan viết.
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${tepWav}`,
    // Giấu cờ "trình duyệt đang bị điều khiển": vài đường xử lý cư xử khác khi
    // thấy cờ đó, và ta muốn đo đúng thứ người dùng gặp.
    "--disable-blink-features=AutomationControlled",
  ],
});

try {
  const ctx = await trinhDuyet.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "vi-VN",
    permissions: ["microphone"],
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  const p = await ctx.newPage();

  // ── ① HAI CÁI HEADER, ĐO TRÊN CHÍNH LƯỢT TẢI TRANG ─────────────────
  // Cả hai đều ở tầng khác hẳn mã màn hình, và cả hai đều giết tính năng này
  // trong im lặng. Đọc từ chính response chứ không đọc lại file cấu hình —
  // file cấu hình đúng mà máy chủ gửi thứ khác là chuyện đã xảy ra.
  await p.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
  await p.fill("#identifier", EMAIL);
  await p.fill("#password", MAT_KHAU);
  await p.click('button[type="submit"]');
  await p.waitForURL(/\/app/, { timeout: 150000 });

  const traLoi = await p.goto(`${NEN}/app/chat`, { waitUntil: "domcontentloaded" });
  const dauTrang = traLoi?.headers() ?? {};
  const quyen = dauTrang["permissions-policy"] ?? "";
  const chanMicro = /microphone=\(\s*\)/.test(quyen);
  kiem(
    "máy chủ KHÔNG chặn micro (Permissions-Policy)",
    quyen.length > 0 && !chanMicro,
    chanMicro
      ? "đang là microphone=() — nút ghi âm chết câm"
      : (quyen.match(/microphone=\([^)]*\)/)?.[0] ?? "(không gửi Permissions-Policy)"),
  );

  const csp = dauTrang["content-security-policy"] ?? "";
  const dongMedia = csp.match(/media-src[^;]*/)?.[0] ?? "";
  const gocKho = new URL(URL_NEN).origin;
  kiem(
    "CSP cho phép nạp âm thanh từ kho (media-src)",
    dongMedia.includes(gocKho),
    dongMedia || "KHÔNG có media-src ⇒ rơi về default-src 'self' ⇒ thẻ audio chết câm",
  );

  // ── ② NÚT GHI ÂM CÓ MẶT, VÀ MICRO MỞ ĐƯỢC ──────────────────────────
  const nutGhi = p.locator('button[aria-label="Ghi âm"], button[aria-label="Record"]').first();
  await nutGhi.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  kiem("khung soạn có nút Ghi âm", await nutGhi.isVisible().catch(() => false));

  await bam(nutGhi);
  const nutDung = p.locator('button[aria-label="Dừng ghi"], button[aria-label="Stop"]').first();
  await nutDung.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  const daGhi = await nutDung.isVisible().catch(() => false);
  // Phân biệt hai kiểu hỏng, vì cách chữa khác hẳn nhau: bị CHẶN ở tầng header
  // thì màn hiện câu "Chưa được phép dùng micro"; còn máy ghi hỏng thì không.
  const canhBaoChan = daGhi
    ? []
    : (await p.locator("[data-sonner-toast]").allInnerTexts().catch(() => []));
  kiem(
    "bấm ghi ⇒ micro mở được, nút chuyển sang Dừng ghi",
    daGhi,
    daGhi ? "" : canhBaoChan.join(" | ") || "không có câu báo nào — soi lại MediaRecorder",
  );

  // Đồng hồ phải CHẠY. Nút đổi hình mà đồng hồ đứng im nghĩa là bộ đếm chết,
  // và trần 2 phút cũng chết theo — lời nhắn 10 phút sẽ không ai chặn.
  await p.waitForTimeout(4200);
  const chuTrenNut = (await nutDung.innerText().catch(() => "")).trim();
  kiem(
    "đang ghi thì đồng hồ chạy",
    /^0:0[2-9]$/.test(chuTrenNut),
    chuTrenNut || "(không đọc được)",
  );

  // ── ③ ĐÍNH THÊM MỘT TỆP TRONG LÚC ĐANG GHI ─────────────────────────
  // Ở tiệm, thợ vừa nói vừa gửi ảnh trước–sau là chuyện thường. Trước 22/08,
  // tấm ảnh đó bị ghi đè mất khi ghi âm xong.
  await p.locator('input[type="file"]').first().setInputFiles(tepAnh).catch(() => {});
  await p.waitForTimeout(3000);

  // ── ④ DỪNG ⇒ TỆP LÊN KHO, CHIP HIỆN RA ─────────────────────────────
  await bam(nutDung);
  const chipThoai = p
    .locator("li", { hasText: /^(Lời nhắn thoại|Voice note)/ })
    .first();
  await chipThoai.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  kiem("dừng ghi ⇒ tệp âm thanh tải lên xong, chip hiện ra", await chipThoai.isVisible().catch(() => false));

  const soChip = await p.locator("li:has(svg.lucide-paperclip)").count();
  kiem(
    "tệp đính kèm giữa chừng KHÔNG bị ghi âm ghi đè mất",
    soChip === 2,
    `đang có ${soChip} tệp trong khung soạn (phải là 2: ảnh + lời nhắn thoại)`,
  );

  // ── ⑤ GỬI MÀ KHÔNG GÕ MỘT CHỮ NÀO ──────────────────────────────────
  // Đây đúng là cảnh dùng thật: tay ướt, không gõ được. Cũng đúng là chỗ ràng
  // buộc `chat_messages_body_check` từng chặn tin lại.
  const oSoan = p.locator("textarea").first();
  const chuDaGo = await oSoan.inputValue().catch(() => "");
  kiem("ô soạn đang TRỐNG — đo đúng cảnh không gõ chữ", chuDaGo.length === 0, JSON.stringify(chuDaGo));

  await bam(p.locator("button", { hasText: /^(Gửi|Send)$/ }).first());
  const cauBao = await rinhThongBao(p, 8);

  const { data: dsTin } = await kho
    .from("chat_messages")
    .select("id, body, created_at")
    .eq("tenant_id", TIEM)
    .eq("sender_user_id", taiKhoan.id)
    .gte("created_at", MOC)
    .order("created_at", { ascending: false })
    .limit(1);
  const tin = dsTin?.[0] ?? null;
  kiem(
    "gửi KHÔNG gõ chữ ⇒ sổ ghi thêm một tin",
    tin !== null,
    tin ? "" : cauBao.join(" | ") || "không có tin, cũng không có câu báo nào",
  );

  /**
   * ⚠️ PHÉP NÀY CANH MỘT CÁCH CHỮA TẠM, KHÔNG CANH MỘT TÍNH NĂNG.
   *
   *   Trước 22/08, ràng buộc `chat_messages_body_check` đòi `length(trim(body))
   *   >= 1`, nên tin chỉ-có-tệp không ghi được. Bản chữa tạm ở
   *   `app/app/chat/actions.ts` lách bằng cách TỰ ĐẶT một dòng chữ ("Lời nhắn
   *   thoại") vào cột nội dung. Cổng vẫn xanh — vì mọi phép ở trên chỉ hỏi "tin
   *   có được ghi không", không phép nào hỏi "trong cột nội dung có gì".
   *
   *   Cột `body` là chỗ chứa LỜI NGƯỜI DÙNG VIẾT, không phải chỗ chứa chữ để
   *   hiển thị. Trộn hai việc thì về sau mọi chỗ đọc `body` đều phải đoán "chữ
   *   này là thật hay do máy bịa" — và không có cách nào đoán đúng.
   *
   *   Nên phép này đòi ĐÚNG một điều: gửi không gõ chữ thì cột nội dung phải
   *   TRỐNG. Ai khôi phục cách chữa tạm, ở tầng nào cũng vậy, phép này ĐỎ.
   */
  kiem(
    "gửi KHÔNG gõ chữ ⇒ cột nội dung TRỐNG, máy không bịa lời hộ người gửi",
    tin !== null && tin.body === "",
    tin === null
      ? "không có tin nào để soi"
      : tin.body === ""
        ? "cột nội dung = \"\" (0 ký tự)"
        : `cột nội dung đang mang chữ ${JSON.stringify(tin.body)} — chữ này không do người gửi gõ`,
  );

  const { data: dsTep } = tin
    ? await kho
        .from("chat_attachments")
        .select("id, duong_dan, ten, loai, co")
        .eq("message_id", tin.id)
    : { data: [] };
  const tepThoai = (dsTep ?? []).find((x) => x.loai.startsWith("audio/")) ?? null;
  kiem(
    "tin mang theo tệp âm thanh",
    tepThoai !== null,
    tepThoai ? `${tepThoai.loai} · ${tepThoai.co} byte` : `${(dsTep ?? []).length} tệp, không cái nào là audio/`,
  );
  kiem(
    "tin cũng giữ nguyên tệp đính kèm giữa chừng",
    (dsTep ?? []).length === 2,
    `${(dsTep ?? []).length} tệp`,
  );

  // ── ⑥ TIN HIỆN TRONG KHUNG CHAT, KÈM THANH PHÁT ────────────────────
  /**
   * ⚠️ PHẢI TÌM ĐÚNG THANH PHÁT CỦA TIN VỪA GỬI, không phải "thẻ <audio> đầu
   *   tiên thấy được".
   *
   *   Đã dính đúng bẫy này lúc thử phá cổng 22/08: một lời nhắn thoại CŨ còn
   *   nằm trong kênh, nên dù lượt gửi mới hỏng hoàn toàn, hai phép "có thanh
   *   phát" và "bấm phát chạy được" vẫn ĐẠT — cổng nói xanh cho một thứ đã
   *   gãy. Chốt lại bằng ĐƯỜNG DẪN TỆP: đường dẫn ký luôn mang nguyên đường
   *   dẫn trong kho, mà đường dẫn đó là mã ngẫu nhiên của đúng lượt này.
   */
  const duongDanThoai = tepThoai?.duong_dan ?? null;
  const the = p.locator(`audio[src*="${duongDanThoai ?? "__khong-co-tep__"}"]`).first();
  let nguon = null;
  if (duongDanThoai) {
    await the.waitFor({ state: "attached", timeout: 30000 }).catch(() => {});
    nguon = await the.getAttribute("src").catch(() => null);
  }
  kiem(
    "khung chat hiện thanh phát ĐÚNG của tin vừa gửi",
    typeof nguon === "string" && nguon.startsWith(`${gocKho}/storage/v1/object/sign/`),
    nguon
      ? nguon.slice(0, 60) + "…"
      : duongDanThoai
        ? "không thấy thẻ <audio> nào trỏ vào tệp vừa gửi"
        : "không có tệp âm thanh nào để đối chiếu",
  );

  // ── ⑦ BẤM PHÁT ⇒ CHẠY THẬT ─────────────────────────────────────────
  // Đây là phép kiểm bắt được lỗi CSP: thẻ vẫn hiện, nguồn vẫn đúng, chỉ có
  // điều trình duyệt từ chối nạp và `play()` ném NotSupportedError.
  const phat = !nguon
    ? { ok: false, loi: "không có thanh phát nào của tin này để bấm", maLoi: null }
    : await the
    .evaluate(async (el) => {
      try {
        el.muted = true; // máy chạy cổng không có loa, và ta chỉ cần biết nó CHẠY
        await el.play();
        await new Promise((r) => setTimeout(r, 1500));
        const chayGiua = el.currentTime;
        /**
         * ⚠️ PHẢI CHỜ PHÁT HẾT MỚI ĐỌC ĐỘ DÀI, và đây là chỗ suýt thành một
         *   phép kiểm chập chờn.
         *
         *   Tệp do `MediaRecorder` cắt ra KHÔNG ghi độ dài vào phần đầu tệp —
         *   đó là cách nó hoạt động, không phải lỗi của iFan. Nên `duration`
         *   là `Infinity` cho tới khi trình duyệt tự phát tới cuối. Đo 22/08:
         *   cùng một tệp, lượt đọc sớm ra 4,56 giây, lượt ra `Infinity`, tuỳ
         *   mạng nhanh chậm. Đọc sớm là gieo xúc xắc.
         */
        await new Promise((r) => {
          if (el.ended) return r();
          const xong = () => r();
          el.addEventListener("ended", xong, { once: true });
          setTimeout(xong, 15000);
        });
        return {
          ok: true,
          chay: chayGiua,
          dai: Number.isFinite(el.duration) ? el.duration : null,
          maLoi: el.error?.code ?? null,
        };
      } catch (e) {
        return { ok: false, loi: String(e).slice(0, 160), maLoi: el.error?.code ?? null };
      }
    })
    .catch((e) => ({ ok: false, loi: String(e).slice(0, 160), maLoi: null }));
  kiem(
    "bấm phát ⇒ chạy thật (kim giờ tiến lên)",
    phat.ok === true && phat.chay > 0.5,
    phat.ok
      ? `sau 1,5 giây kim đã ở ${phat.chay?.toFixed?.(2)}s`
      : `${(phat.loi ?? "").split("\n")[0]}${
          phat.maLoi === 4
            ? " (mã lỗi media 4 = trình duyệt TỪ CHỐI nguồn — soi lại media-src trong CSP)"
            : phat.maLoi != null
              ? ` (mã lỗi media ${phat.maLoi})`
              : ""
        }`,
  );
  kiem(
    "phát hết bài rồi thì thanh phát biết đoạn ghi dài bao nhiêu (> 1 giây)",
    typeof phat.dai === "number" && phat.dai > 1,
    typeof phat.dai === "number"
      ? `${phat.dai.toFixed(2)} giây`
      : "vẫn không đọc ra độ dài sau khi phát hết — thanh tua sẽ không dùng được",
  );

  // ── ⑧ SOI RUỘT TỆP ĐÃ LƯU ──────────────────────────────────────────
  // Sổ có dòng, màn có thanh phát — vẫn chưa chứng minh được là CÓ TIẾNG. Tải
  // tệp về, giải mã bằng chính trình duyệt, rồi đo.
  if (tepThoai) {
    const { data: tai, error: loiTai } = await kho.storage
      .from("tenant-files")
      .download(tepThoai.duong_dan);
    const byte = loiTai || !tai ? null : Buffer.from(await tai.arrayBuffer());
    kiem(
      "tệp âm thanh tải về được từ kho lưu trữ",
      byte !== null && byte.length > 3000,
      byte ? `${byte.length} byte` : (loiTai?.message ?? "không tải được"),
    );

    if (byte) {
      const soi = await p.evaluate(
        async ([b64, f1, f2]) => {
          const bin = atob(b64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          try {
            const ac = new AudioContext();
            const buf = await ac.decodeAudioData(u8.buffer);
            const d = buf.getChannelData(0);
            let tong = 0;
            for (let i = 0; i < d.length; i++) tong += d[i] * d[i];
            // Goertzel: đo NĂNG LƯỢNG ở đúng một tần số, không cần cả phép biến
            // đổi Fourier. Chỉ lấy 2 giây đầu cho nhanh.
            const doTan = (f) => {
              const w = (2 * Math.PI * f) / buf.sampleRate;
              const c = 2 * Math.cos(w);
              let s1 = 0;
              let s2 = 0;
              const n = Math.min(d.length, buf.sampleRate * 2);
              for (let i = 0; i < n; i++) {
                const s0 = d[i] + c * s1 - s2;
                s2 = s1;
                s1 = s0;
              }
              return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - c * s1 * s2)) / n;
            };
            return {
              giay: buf.duration,
              rms: Math.sqrt(tong / d.length),
              tren: doTan(f1),
              doiChung: doTan(f2),
            };
          } catch (e) {
            return { loi: String(e).slice(0, 160) };
          }
        },
        [byte.toString("base64"), TAN_SO, TAN_SO_DOI_CHUNG],
      );

      kiem(
        "tệp đã lưu giải mã được và dài hơn 1 giây",
        typeof soi.giay === "number" && soi.giay > 1,
        soi.loi ? soi.loi : `${soi.giay?.toFixed?.(2)} giây`,
      );
      kiem(
        "tệp đã lưu CÓ tiếng, không phải im lặng",
        typeof soi.rms === "number" && soi.rms > 0.01,
        typeof soi.rms === "number" ? `độ lớn trung bình ${soi.rms.toFixed(4)}` : "không đo được",
      );
      // ⚠️ NÓI RÕ PHÉP NÀY KIỂM ĐƯỢC GÌ: nó chứng minh tiếng trong tệp ĐÚNG LÀ
      //   tiếng micro giả phát ra (440 Hz), chứ không phải nhiễu hay một tệp
      //   nào khác lọt vào. Nó KHÔNG kiểm chất lượng tiếng nói thật.
      kiem(
        `tiếng trong tệp đúng là tiếng từ micro (${TAN_SO} Hz nổi hơn hẳn ${TAN_SO_DOI_CHUNG} Hz)`,
        typeof soi.tren === "number" && soi.tren > (soi.doiChung ?? 0) * 20 && soi.tren > 0.005,
        typeof soi.tren === "number"
          ? `${TAN_SO} Hz = ${soi.tren.toFixed(5)} · ${TAN_SO_DOI_CHUNG} Hz = ${soi.doiChung.toFixed(5)}`
          : "không đo được",
      );
    } else {
      for (const ten of [
        "tệp đã lưu giải mã được và dài hơn 1 giây",
        "tệp đã lưu CÓ tiếng, không phải im lặng",
        `tiếng trong tệp đúng là tiếng từ micro (${TAN_SO} Hz nổi hơn hẳn ${TAN_SO_DOI_CHUNG} Hz)`,
      ]) {
        kiem(ten, false, "không tải được tệp để soi");
      }
    }
  } else {
    for (const ten of [
      "tệp âm thanh tải về được từ kho lưu trữ",
      "tệp đã lưu giải mã được và dài hơn 1 giây",
      "tệp đã lưu CÓ tiếng, không phải im lặng",
      `tiếng trong tệp đúng là tiếng từ micro (${TAN_SO} Hz nổi hơn hẳn ${TAN_SO_DOI_CHUNG} Hz)`,
    ]) {
      kiem(ten, false, "không có tệp âm thanh để soi");
    }
  }

  // ── ⑨ GHI CỰC NGẮN ⇒ PHẢI CÓ LỜI, KHÔNG ĐƯỢC IM ────────────────────
  // Bấm ghi rồi bấm dừng gần như tức thì thì máy ghi chưa cắt được mảnh nào.
  // Trước 22/08 chỗ này lặng thinh: không tệp, không chữ, người dùng chỉ biết
  // bấm lại.
  //
  // ⚠️ NÓI RÕ PHÉP NÀY YẾU Ở ĐÂU: nó là một phép HOẶC. Cùng một thao tác, đo
  //   22/08 thấy lượt thì máy ghi vẫn kịp cắt ra một tệp ~1 KB, lượt thì không
  //   ra gì — tuỳ máy nhanh chậm. Nên cổng chỉ dám đòi: RA TỆP, HOẶC CÓ CHỮ.
  //   Nghĩa là có những lượt nó KHÔNG hề chạm tới câu báo "quá ngắn". Nó vẫn
  //   bắt được đúng lỗi cũ (không tệp mà cũng không chữ), nhưng đừng đọc một
  //   lượt ĐẠT ở đây thành "câu báo quá ngắn đã được kiểm".
  await bam(nutGhi);
  await p.waitForTimeout(120);
  await bam(p.locator('button[aria-label="Dừng ghi"], button[aria-label="Stop"]').first(), 5);
  const cauNgan = await rinhThongBao(p, 6);
  const coChipMoi = (await p.locator("li:has(svg.lucide-paperclip)").count()) > 0;
  kiem(
    "ghi quá ngắn ⇒ nói ra, không im lặng",
    coChipMoi || cauNgan.some((x) => /quá ngắn|too short/i.test(x)),
    coChipMoi ? "lượt này vẫn cắt được tệp nên không cần báo" : cauNgan.join(" | ") || "KHÔNG có chữ nào",
  );

  // ── ⑩ RỜI MÀN GIỮA CHỪNG ⇒ MICRO PHẢI TẮT ──────────────────────────
  // Đo bằng cách vá `getUserMedia` để giữ lại luồng, rồi điều hướng TRONG APP
  // (bấm link, không tải lại trang) để biến đo còn sống.
  await p.evaluate(() => {
    window.__dongMicro = [];
    const goc = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const s = await goc(c);
      window.__dongMicro.push(s);
      return s;
    };
  });
  await bam(nutGhi);
  await p.waitForTimeout(1500);
  const truocKhiRoi = await p.evaluate(() =>
    (window.__dongMicro ?? []).flatMap((s) => s.getTracks().map((t) => t.readyState)),
  );
  const daRoi = await bam(p.locator('a[href="/app"]').first());
  await p.waitForTimeout(2500);
  const conNut = await p
    .locator('button[aria-label="Dừng ghi"], button[aria-label="Ghi âm"]')
    .count();
  const sauKhiRoi = await p.evaluate(() =>
    window.__dongMicro
      ? (window.__dongMicro ?? []).flatMap((s) => s.getTracks().map((t) => t.readyState))
      : null,
  );
  kiem(
    "rời màn Chat giữa chừng ⇒ micro tắt hẳn",
    daRoi &&
      conNut === 0 &&
      truocKhiRoi.includes("live") &&
      Array.isArray(sauKhiRoi) &&
      sauKhiRoi.length > 0 &&
      sauKhiRoi.every((x) => x === "ended"),
    `trước khi rời: ${truocKhiRoi.join(",") || "(không mở được micro)"} · sau khi rời: ${
      sauKhiRoi === null ? "mất biến đo (trang đã tải lại — phép đo này vô hiệu)" : sauKhiRoi.join(",") || "(trống)"
    }`,
  );
} catch (e) {
  // Vỡ giữa chừng là MỘT LẦN TRƯỢT, không phải một vụ sập — bắt lại để khối dọn
  // phía dưới vẫn chạy và bản tổng kết vẫn in ra.
  kiem("chạy trọn luồng không vỡ giữa chừng", false, String(e).split("\n")[0].slice(0, 180));
} finally {
  await trinhDuyet.close().catch(() => {});

  // ── DỌN — và dọn hỏng thì phải KÊU, không im ───────────────────────
  // Dọn theo MỐC THỜI GIAN chứ không theo danh sách nhớ trong biến: cổng này
  // tải lên vài tệp mà không phải tệp nào cũng được gửi đi (lượt ghi cực ngắn,
  // lượt rời màn giữa chừng), và tệp mồ côi cũng là rác.
  const rac = [];
  const { data: tinCua, error: loiTra } = await kho
    .from("chat_messages")
    .select("id")
    .eq("tenant_id", TIEM)
    .eq("sender_user_id", taiKhoan.id)
    .gte("created_at", MOC);
  if (loiTra) rac.push(`không tra được tin đã tạo: ${loiTra.message}`);
  for (const t of tinCua ?? []) {
    // Xoá tin thì `chat_attachments` đi theo (khoá ngoại on delete cascade).
    const { error } = await kho.from("chat_messages").delete().eq("id", t.id);
    if (error) rac.push(`tin ${t.id}: ${error.message}`);
  }

  const { data: dsKho, error: loiLiet } = await kho.storage
    .from("tenant-files")
    .list(`${TIEM}/chat`, { limit: 1000 });
  if (loiLiet) rac.push(`không liệt kê được kho tệp: ${loiLiet.message}`);
  const canXoa = (dsKho ?? [])
    .filter((x) => x.created_at && x.created_at >= MOC)
    .map((x) => `${TIEM}/chat/${x.name}`);
  if (canXoa.length > 0) {
    const { error } = await kho.storage.from("tenant-files").remove(canXoa);
    if (error) rac.push(`xoá ${canXoa.length} tệp: ${error.message}`);
  }

  if (rac.length > 0) {
    console.log("\n⚠️ DỌN KHÔNG SẠCH — còn lại trong kho:");
    for (const r of rac) console.log(`   · ${r}`);
    truot += rac.length;
  } else {
    console.log(`\n(đã dọn: ${(tinCua ?? []).length} tin · ${canXoa.length} tệp)`);
  }
}

console.log(`\n${truot === 0 ? "XANH" : "ĐỎ"}: ${dat} đạt · ${truot} trượt`);
process.exit(truot === 0 ? 0 : 1);
