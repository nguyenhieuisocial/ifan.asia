/**
 * CỔNG: TRỌN LUỒNG ẢNH CHẤM CÔNG — chụp → lưu vào kho → hiện lại → mở xem lớn.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Tính năng chụp ảnh chấm công ra bản 20/08 với ĐỦ mọi thứ nhìn thấy được: màn
 * hình, nút bấm, chỗ lưu, chốt quyền xem, cả phần đóng dấu vị trí + giờ + tên
 * tiệm lên ảnh. Nhưng `next.config.ts` gửi kèm mỗi trang một dòng
 * `Permissions-Policy: camera=()` — chặn camera HOÀN TOÀN, kể cả chính iFan.
 * **Tính năng chưa từng chạy được lần nào**, và không ai biết suốt hai ngày vì
 * công tắc "bắt chụp ảnh" mặc định TẮT ở mọi tiệm. Ngày bật lên mới lộ, và lúc
 * đó là nhân viên không chấm công được.
 *
 * `scripts/quyen-camera-smoke.mjs` đã canh ĐÚNG MỘT MẮT XÍCH: cái header đó.
 * Nhưng chuỗi này còn sáu mắt nữa, và mắt nào đứt cũng ra cùng một hậu quả —
 * nhân viên bấm chấm công mà không chấm được:
 *
 *   camera mở được → khung hình về tới `<canvas>` → thu nhỏ 720px → đóng dấu
 *   chữ lên ảnh → tải lên kho `tenant-files` → sổ chấm công ghi đường dẫn →
 *   bảng "Chấm công cả tiệm" ký được link và vẽ lại được ảnh.
 *
 * ⚠️ VÌ SAO TRƯỚC ĐÂY KHÔNG TỰ KIỂM ĐƯỢC, và cách gỡ.
 *   Camera giả mặc định của Chrome (`--use-fake-device-for-media-stream`) từng
 *   cho `video.videoWidth = 0` ở lượt đo 22/08, nên `capture()` thoát ngay ở
 *   dòng `if (!video || !video.videoWidth) return;` — không chụp được thì không
 *   kiểm được gì phía sau.
 *
 *   Cách gỡ ở đây: NẠP MỘT TỆP VIDEO THẬT làm nguồn camera bằng
 *   `--use-file-for-fake-video-capture=<tệp .y4m>`. Tệp do chính file này dựng
 *   ra bằng mã (không cần công cụ ngoài): Y4M là định dạng thô, chỉ gồm một
 *   dòng tiêu đề rồi các khung I420 nối đuôi nhau.
 *
 * ⚠️ KHUNG HÌNH GIẢ ĐƯỢC VẼ CÓ CHỦ Ý, để mỗi phép kiểm phía sau có chỗ bấu:
 *   · NỀN XÁM PHẲNG (Y=128) ở góc trên-trái ⇒ trong ảnh đã lưu mà vùng đó có cả
 *     điểm rất tối lẫn rất sáng thì CHỈ có thể do chữ đóng dấu vẽ lên. Nguồn
 *     không có sẵn thứ gì tối/sáng ở đó để nhầm.
 *   · Ô MỐC đen + trắng ở GIỮA khung (chỗ không có chữ đóng dấu nào) ⇒ ảnh đã
 *     lưu mà thiếu ô này thì khung hình chưa hề đi từ camera vào canvas.
 *   · Cỡ nguồn 1280×960 ⇒ ảnh lưu phải ra ĐÚNG 720×540. Ảnh ra đúng cỡ nguồn là
 *     bước thu nhỏ đã rụng (và kho sẽ phồng gấp ~4 lần).
 *
 * ⚠️ CỔNG NÀY GHI VÀO KHO DỮ LIỆU: nó bật công tắc `require_selfie` cho ĐÚNG
 *   tiệm demo, chấm một lượt thật, rồi DỌN SẠCH (xoá lượt chấm, xoá tệp ảnh,
 *   trả công tắc về đúng trạng thái cũ) trong khối `finally`. Không dọn được
 *   cũng phải KÊU LÊN chứ không im.
 *
 * Chạy: node scripts/anh-cham-cong-smoke.mjs [địa-chỉ]
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
 * Bấm mà KHÔNG ném lỗi khi không bấm được.
 *
 * ⚠️ Cố ý: một mắt xích đứt sớm (ví dụ camera bị chặn ⇒ không có nút "Chụp")
 *   mà để `click` ném thẳng lên thì bản kiểm dừng ngay ở đó và in ra một câu
 *   "locator.click timeout" — người đọc không biết mắt nào đứt. Nuốt ở đây để
 *   MỌI mục còn lại vẫn được chấm và in ra tên đàng hoàng.
 */
const bam = async (loc, giay = 15) => {
  try {
    await loc.click({ timeout: giay * 1000 });
    return true;
  } catch {
    return false;
  }
};

// ════════════════════════════════════════════════════════════════════
// CAMERA GIẢ — dựng một tệp .y4m bằng mã
// ════════════════════════════════════════════════════════════════════
const NGUON_W = 1280;
const NGUON_H = 960;
const NEN_XAM = 128; // Y=128 ⇒ xám giữa, không tối không sáng
const CANH_DAI_CHO = 720; // phải khớp CANH_DAI_TOI_DA trong selfie-capture.tsx

/**
 * Y4M = tiêu đề một dòng, rồi mỗi khung là "FRAME\n" + mặt phẳng Y (W×H) + U +
 * V (mỗi mặt W/2×H/2). Chrome nhận thẳng, không cần bộ giải mã nào.
 *
 * Bốn khung là đủ: Chrome phát vòng lặp, và ta chỉ cần MỘT khung có nội dung
 * đúng lúc bấm chụp.
 */
function dungTepCameraGia() {
  const thuMuc = path.join(os.tmpdir(), "ifan-camera-gia");
  mkdirSync(thuMuc, { recursive: true });
  const tep = path.join(thuMuc, `mat-gia-${NGUON_W}x${NGUON_H}.y4m`);

  const phan = [Buffer.from(`YUV4MPEG2 W${NGUON_W} H${NGUON_H} F10:1 Ip A1:1 C420mpeg2\n`, "ascii")];
  const y0 = Math.round(NGUON_H * 0.44);
  const y1 = Math.round(NGUON_H * 0.56);
  const x0 = Math.round(NGUON_W * 0.39);
  const xGiua = Math.round(NGUON_W * 0.5);
  const x1 = Math.round(NGUON_W * 0.61);
  for (let k = 0; k < 4; k++) {
    const Y = Buffer.alloc(NGUON_W * NGUON_H, NEN_XAM);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < xGiua; x++) Y[y * NGUON_W + x] = 16; // nửa trái: gần đen
      for (let x = xGiua; x < x1; x++) Y[y * NGUON_W + x] = 240; // nửa phải: gần trắng
    }
    // U=V=128 ⇒ không màu, để phép đo chỉ nói về độ sáng.
    const UV = Buffer.alloc((NGUON_W / 2) * (NGUON_H / 2), 128);
    phan.push(Buffer.from("FRAME\n", "ascii"), Y, UV, Buffer.from(UV));
  }
  writeFileSync(tep, Buffer.concat(phan));
  return tep;
}

// ════════════════════════════════════════════════════════════════════
// CHUẨN BỊ KHO — bật công tắc cho ĐÚNG tiệm demo, nhớ trạng thái cũ để trả lại
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
  .select("tenant_id, role")
  .eq("user_id", taiKhoan.id);
if (!theTiem || theTiem.length !== 1) {
  console.error(`❌ Tài khoản demo phải thuộc ĐÚNG một tiệm, đang thấy ${theTiem?.length ?? 0}.`);
  process.exit(1);
}
const TIEM = theTiem[0].tenant_id;

// Hồ sơ nhân sự: không có thì màn chấm công chỉ hiện "Bạn chưa có hồ sơ nhân
// sự" và không có nút nào để bấm. Kho kiểm mới dựng chưa có hồ sơ cho tài khoản
// demo, nên cổng tự tạo — và tự xoá ở cuối nếu chính nó tạo.
const { data: hoSoCu } = await kho
  .from("employees")
  .select("id")
  .eq("user_id", taiKhoan.id)
  .eq("tenant_id", TIEM)
  .maybeSingle();
let NHAN_VIEN = hoSoCu?.id ?? null;
let tuTaoHoSo = false;
if (!NHAN_VIEN) {
  const { data: moi, error: loiHoSo } = await kho
    .from("employees")
    .insert({ tenant_id: TIEM, user_id: taiKhoan.id, full_name: "Chủ tiệm Demo" })
    .select("id")
    .single();
  if (loiHoSo) {
    console.error(`❌ Không tạo được hồ sơ nhân sự tạm: ${loiHoSo.message}`);
    process.exit(1);
  }
  NHAN_VIEN = moi.id;
  tuTaoHoSo = true;
}

// Cấu hình chấm công: nhớ nguyên trạng để trả lại đúng như cũ.
const { data: cauHinhCu } = await kho
  .from("attendance_settings")
  .select("require_selfie, lat, lng, radius_m")
  .eq("tenant_id", TIEM)
  .maybeSingle();
const tuTaoCauHinh = !cauHinhCu;
// Toạ độ tiệm: có sẵn thì dùng, chưa có thì đặt tạm. Trình duyệt sẽ báo vị trí
// ĐÚNG chỗ này, để lượt chấm không bị gắn cờ "ngoài vùng" (gắn cờ thì màn đòi
// nhập lý do, và cổng sẽ đo thêm một thứ không liên quan tới ảnh).
const LAT = cauHinhCu?.lat != null ? Number(cauHinhCu.lat) : 10.776876;
const LNG = cauHinhCu?.lng != null ? Number(cauHinhCu.lng) : 106.654515;
{
  const { error } = await kho
    .from("attendance_settings")
    .upsert(
      { tenant_id: TIEM, require_selfie: true, lat: LAT, lng: LNG },
      { onConflict: "tenant_id" },
    );
  if (error) {
    console.error(`❌ Không bật được công tắc ảnh cho tiệm demo: ${error.message}`);
    process.exit(1);
  }
}

const MOC = new Date().toISOString(); // lượt chấm nào SAU mốc này là của cổng
let duongDanAnh = null; // để dọn ở finally
let idLuotCham = null;

const tepY4M = dungTepCameraGia();
const trinhDuyet = await chromium.launch({
  headless: true,
  ...(duongTrinhDuyet ? { executablePath: duongTrinhDuyet } : {}),
  args: [
    // Bỏ hộp thoại hỏi quyền camera — hộp đó không phải phần iFan viết.
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${tepY4M}`,
  ],
});

try {
  const ctx = await trinhDuyet.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "vi-VN",
    permissions: ["camera", "geolocation"],
    geolocation: { latitude: LAT, longitude: LNG },
  });
  const p = await ctx.newPage();

  // ── Đăng nhập ──────────────────────────────────────────────────────
  await p.goto(`${NEN}/login`, { waitUntil: "domcontentloaded" });
  await p.fill("#identifier", EMAIL);
  await p.fill("#password", MAT_KHAU);
  await p.click('button[type="submit"]');
  await p.waitForURL(/\/app/, { timeout: 150000 });

  await p.goto(`${NEN}/app/team`, { waitUntil: "domcontentloaded" });

  // ── ① Bật công tắc ⇒ màn chấm công phải hiện khối chụp ảnh ─────────
  const khoiAnh = p.locator("p", { hasText: /^(Ảnh chấm công|Attendance photo)$/ }).first();
  await khoiAnh.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  kiem("bật công tắc ⇒ màn chấm công hiện khối chụp ảnh", await khoiAnh.isVisible());

  // Nút chấm công: tìm theo BIỂU TƯỢNG chứ không theo chữ — ở bản tiếng Anh,
  // chữ trên nút ("Clock in") trùng đúng chữ của thẻ tab, và bắt nhầm tab thì
  // phép đo sai chứ mã không sai.
  const nutCham = p.locator("button.w-full:has(svg.lucide-log-in), button.w-full:has(svg.lucide-log-out)").first();
  kiem("chưa chụp ảnh ⇒ nút chấm công bị khoá", await nutCham.isDisabled());

  // ── ② Mở camera, khung hình phải THẬT ──────────────────────────────
  await bam(p.locator("button", { hasText: /^(Mở máy ảnh|Open camera)$/ }).first());
  const video = p.locator("video").first();
  // Chờ MỘT TRONG HAI: thẻ <video> dựng lên, hoặc màn báo "không cho mở máy
  // ảnh". Phải bắt câu báo ngay lúc này vì thông báo tự tắt sau vài giây — đợi
  // hết 20 giây rồi mới đọc màn thì câu đó đã biến mất và bản kiểm chỉ còn biết
  // nói "0×0", không nói được HỎNG Ở ĐÂU.
  let biChan = false;
  for (let i = 0; i < 40; i++) {
    if ((await video.count()) > 0) break;
    const txt = await p.locator("body").innerText().catch(() => "");
    if (/Trình duyệt không cho mở máy ảnh|did not allow the camera/.test(txt)) {
      biChan = true;
      break;
    }
    await p.waitForTimeout(500);
  }
  if (!biChan) {
    await p
      .waitForFunction(() => (document.querySelector("video")?.videoWidth ?? 0) > 0, null, {
        timeout: 20000,
      })
      .catch(() => {});
  }
  const coKhung = await p.evaluate(() => ({
    coThe: document.querySelector("video") !== null,
    coNguon: !!document.querySelector("video")?.srcObject,
    w: document.querySelector("video")?.videoWidth ?? 0,
    h: document.querySelector("video")?.videoHeight ?? 0,
  }));
  // Phân biệt HAI kiểu hỏng đã gặp thật, vì cách chữa hoàn toàn khác nhau:
  //   · trình duyệt CHẶN camera (Permissions-Policy) ⇒ thẻ <video> không dựng,
  //     màn hiện câu "Trình duyệt không cho mở máy ảnh";
  //   · luồng không được GẮN vào thẻ <video> ⇒ thẻ có, nhưng srcObject rỗng.
  kiem(
    "camera mở được và có khung hình thật",
    coKhung.w === NGUON_W && coKhung.h === NGUON_H,
    coKhung.w > 0
      ? `${coKhung.w}×${coKhung.h}`
      : biChan
        ? "trình duyệt CHẶN camera — soi lại Permissions-Policy"
        : coKhung.coThe && !coKhung.coNguon
          ? "thẻ <video> có nhưng KHÔNG có luồng (srcObject rỗng)"
          : `${coKhung.w}×${coKhung.h}`,
  );

  // ── ③ Chụp ⇒ ảnh xem trước hiện ────────────────────────────────────
  await bam(p.locator("button", { hasText: /^(Chụp|Take photo)$/ }).first());
  const anhXem = p.locator('img[alt=""]').first();
  await anhXem.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  const xemTruoc = await anhXem
    .evaluate((el) => ({ nguon: el.getAttribute("src")?.slice(0, 22) ?? "", rong: el.naturalWidth }))
    .catch(() => ({ nguon: "", rong: 0 }));
  kiem(
    "chụp xong ⇒ ảnh xem trước hiện ra",
    xemTruoc.nguon.startsWith("data:image/jpeg") && xemTruoc.rong > 0,
    `${xemTruoc.rong}px`,
  );

  // Chờ tải lên xong ("Đã chụp xong"). Bước này gọi dịch vụ tra địa chỉ (tối đa
  // 6 giây, hỏng thì bỏ qua) rồi mới đẩy ảnh lên kho.
  const xong = p.locator("span", { hasText: /^(Đã chụp xong|Photo captured)$/ }).first();
  await xong.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  kiem("ảnh tải lên kho xong", await xong.isVisible());
  kiem("chụp xong ⇒ nút chấm công mở khoá", await nutCham.isEnabled());

  // ── ④ Chấm công ────────────────────────────────────────────────────
  await bam(nutCham);
  const { data: luot } = await kho
    .from("attendance_punches")
    .select("id, employee_id, selfie_path, selfie_content_type, selfie_captured_at, out_of_range")
    .eq("employee_id", NHAN_VIEN)
    .gte("punched_at", MOC)
    .order("punched_at", { ascending: false })
    .limit(1);
  // Máy chủ vừa ghi xong mới trả về, nên tới đây sổ đã có dòng; chờ thêm một
  // nhịp ngắn phòng lúc máy chậm.
  let dong = luot?.[0] ?? null;
  for (let i = 0; i < 20 && !dong; i++) {
    await p.waitForTimeout(500);
    const { data } = await kho
      .from("attendance_punches")
      .select("id, employee_id, selfie_path, selfie_content_type, selfie_captured_at, out_of_range")
      .eq("employee_id", NHAN_VIEN)
      .gte("punched_at", MOC)
      .order("punched_at", { ascending: false })
      .limit(1);
    dong = data?.[0] ?? null;
  }
  kiem("bấm chấm công ⇒ sổ ghi thêm một lượt", dong !== null);
  idLuotCham = dong?.id ?? null;
  duongDanAnh = dong?.selfie_path ?? null;
  kiem("lượt chấm có mang đường dẫn ảnh", typeof duongDanAnh === "string" && duongDanAnh.length > 0);

  // ── ⑤ Đường dẫn phải mang mã nhân viên ở ĐÚNG đoạn thứ ba ──────────
  // Chính sách đọc kho ảnh (#363) soi đúng đoạn này. Đổi thứ tự đoạn là tháo
  // chốt trong im lặng: ảnh vẫn lưu bình thường, chỉ là ai trong tiệm cũng xem
  // được ảnh của nhau.
  const doan = (duongDanAnh ?? "").split("/");
  kiem(
    "đường dẫn ảnh: <tiệm>/attendance/<mã nhân viên>/<ngày>/<mã>.jpg",
    doan[0] === TIEM && doan[1] === "attendance" && doan[2] === NHAN_VIEN && doan.length === 5,
    duongDanAnh ?? "(không có)",
  );

  // ── ⑥ Ảnh phải THẬT SỰ nằm trong kho lưu trữ ───────────────────────
  let byteAnh = null;
  if (duongDanAnh) {
    const { data: tai, error: loiTai } = await kho.storage.from("tenant-files").download(duongDanAnh);
    if (!loiTai && tai) byteAnh = Buffer.from(await tai.arrayBuffer());
    kiem(
      "tệp ảnh tải về được từ kho lưu trữ",
      byteAnh !== null && byteAnh.length > 3000,
      byteAnh ? `${byteAnh.length} byte` : (loiTai?.message ?? "không tải được"),
    );
  } else {
    kiem("tệp ảnh tải về được từ kho lưu trữ", false, "không có đường dẫn để tra");
  }
  kiem("sổ ghi đúng kiểu tệp ảnh", dong?.selfie_content_type === "image/jpeg", dong?.selfie_content_type ?? "(trống)");

  // ── ⑦ Soi RUỘT tấm ảnh đã lưu ──────────────────────────────────────
  // Giải mã bằng chính trình duyệt (nạp qua data: URL nên canvas không bị
  // "nhiễm bẩn" như khi nạp ảnh từ tên miền khác).
  if (byteAnh) {
    const soi = await p.evaluate(async (b64) => {
      const img = new Image();
      await new Promise((ok, hong) => {
        img.onload = ok;
        img.onerror = hong;
        img.src = `data:image/jpeg;base64,${b64}`;
      });
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      const vung = (x0, y0, x1, y1) => {
        let min = 255;
        let max = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const v = d[(y * c.width + x) * 4];
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        return { min, max };
      };
      return {
        w: c.width,
        h: c.height,
        // Góc trên-trái: nguồn là xám phẳng, nên tối/sáng ở đây chỉ có thể do
        // chữ đóng dấu (tên tiệm) vẽ lên.
        gocChu: vung(10, 10, Math.min(340, c.width), Math.min(52, c.height)),
        // Giữa khung: ô mốc đen/trắng của camera giả, không có chữ nào chồng lên.
        oMoc: vung(
          Math.round(c.width * 0.42),
          Math.round(c.height * 0.46),
          Math.round(c.width * 0.58),
          Math.round(c.height * 0.54),
        ),
        // Dải đáy, hai nửa: trái là địa chỉ, phải là giờ.
        dayTrai: vung(15, c.height - 40, Math.round(c.width * 0.3), c.height - 8),
        dayPhai: vung(Math.round(c.width * 0.78), c.height - 40, c.width - 18, c.height - 8),
      };
    }, byteAnh.toString("base64"));

    kiem(
      `ảnh đã thu nhỏ về cạnh dài ${CANH_DAI_CHO}px trước khi lưu`,
      soi.w === CANH_DAI_CHO && soi.h === Math.round((CANH_DAI_CHO * NGUON_H) / NGUON_W),
      `${soi.w}×${soi.h} (nguồn ${NGUON_W}×${NGUON_H})`,
    );
    kiem(
      "ảnh đã lưu mang đúng khung hình từ camera (ô mốc đen/trắng)",
      soi.oMoc.min < 60 && soi.oMoc.max > 200,
      `độ sáng ${soi.oMoc.min}…${soi.oMoc.max}`,
    );
    kiem(
      "ảnh đã lưu CÓ chữ đóng dấu ở góc trên-trái",
      soi.gocChu.min < 70 && soi.gocChu.max > 210,
      `độ sáng ${soi.gocChu.min}…${soi.gocChu.max} (nguồn phẳng ${NEN_XAM})`,
    );
    // ⚠️ NÓI RÕ PHÉP NÀY KIỂM ĐƯỢC GÌ: nó chỉ chứng minh CẢ HAI dấu ở đáy đều
    //   được vẽ (vị trí bên trái, giờ bên phải) — mất một trong hai là đỏ.
    //   Nó KHÔNG kiểm được chuyện hai dòng có ĐÈ LÊN NHAU không (lỗi thật gặp
    //   22/08: địa chỉ dài chạy đè lên giờ). Không kiểm được vì chữ địa chỉ do
    //   một dịch vụ ngoài trả về, dài ngắn tuỳ lúc, không dựng lại được.
    //   Chỗ đó chữa bằng phép cắt chữ trong `selfie-capture.tsx`, không bằng cổng.
    kiem(
      "ảnh đã lưu CÓ cả hai dấu ở đáy (vị trí bên trái, giờ bên phải)",
      soi.dayTrai.min < 70 && soi.dayTrai.max > 210 && soi.dayPhai.min < 70 && soi.dayPhai.max > 210,
      `trái ${soi.dayTrai.min}…${soi.dayTrai.max} · phải ${soi.dayPhai.min}…${soi.dayPhai.max}`,
    );
  } else {
    kiem(`ảnh đã thu nhỏ về cạnh dài ${CANH_DAI_CHO}px trước khi lưu`, false, "không có ảnh để soi");
    kiem("ảnh đã lưu mang đúng khung hình từ camera (ô mốc đen/trắng)", false, "không có ảnh để soi");
    kiem("ảnh đã lưu CÓ chữ đóng dấu ở góc trên-trái", false, "không có ảnh để soi");
    kiem("ảnh đã lưu CÓ cả hai dấu ở đáy (vị trí bên trái, giờ bên phải)", false, "không có ảnh để soi");
  }

  // ── ⑧ Bảng "Chấm công cả tiệm" phải hiện lại tấm ảnh ───────────────
  await p.goto(`${NEN}/app/team`, { waitUntil: "domcontentloaded" });
  const bang = p.locator("h3", { hasText: /^(Chấm công cả tiệm|Shop-wide attendance)$/ }).first();
  await bang.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  kiem("quản lý thấy bảng “Chấm công cả tiệm”", await bang.isVisible());

  // Ô ảnh của lượt vừa chấm: nút vuông chứa <img> có link ký tạm.
  const oAnh = p.locator('button:has(img[alt^="Ảnh chấm công của"]), button:has(img[alt^="Attendance photo of"])').first();
  await oAnh.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  const veDuoc = await oAnh
    .locator("img")
    .evaluate((el) => new Promise((ok) => {
      // `loading="lazy"` nên ảnh có thể chưa tải xong ngay khi thẻ xuất hiện.
      if (el.complete) return ok(el.naturalWidth);
      el.addEventListener("load", () => ok(el.naturalWidth), { once: true });
      el.addEventListener("error", () => ok(0), { once: true });
      setTimeout(() => ok(el.naturalWidth), 15000);
    }))
    .catch(() => 0);
  kiem("lượt chấm hiện lại trong bảng, kèm ảnh nhỏ vẽ được", veDuoc > 0, `${veDuoc}px`);

  // ── ⑨ Bấm ảnh nhỏ ⇒ khung xem lớn ──────────────────────────────────
  await bam(oAnh);
  const hop = p.locator('[role="dialog"]').first();
  await hop.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  const anhLon = hop.locator("img").first();
  const lonVeDuoc = await anhLon
    .evaluate((el) => new Promise((ok) => {
      if (el.complete) return ok(el.naturalWidth);
      el.addEventListener("load", () => ok(el.naturalWidth), { once: true });
      el.addEventListener("error", () => ok(0), { once: true });
      setTimeout(() => ok(el.naturalWidth), 15000);
    }))
    .catch(() => 0);
  kiem(
    "bấm ảnh nhỏ ⇒ khung xem lớn mở, ảnh lớn vẽ được",
    (await hop.isVisible()) && lonVeDuoc >= CANH_DAI_CHO,
    `${lonVeDuoc}px`,
  );
} catch (e) {
  // Vỡ giữa chừng (hết giờ chờ một nút, một khối không hiện…) là MỘT LẦN TRƯỢT,
  // không phải một vụ sập. Bắt lại ở đây để khối dọn phía dưới vẫn chạy và bản
  // tổng kết vẫn in ra — ném thẳng lên thì rác ở lại trong kho.
  kiem("chạy trọn luồng không vỡ giữa chừng", false, String(e).split("\n")[0].slice(0, 180));
} finally {
  await trinhDuyet.close().catch(() => {});

  // ── DỌN — và dọn hỏng thì phải KÊU, không im ───────────────────────
  const rac = [];
  if (idLuotCham) {
    const { error } = await kho.from("attendance_punches").delete().eq("id", idLuotCham);
    if (error) rac.push(`lượt chấm ${idLuotCham}: ${error.message}`);
  }
  if (duongDanAnh) {
    const { error } = await kho.storage.from("tenant-files").remove([duongDanAnh]);
    if (error) rac.push(`tệp ảnh ${duongDanAnh}: ${error.message}`);
  }
  if (tuTaoCauHinh) {
    const { error } = await kho.from("attendance_settings").delete().eq("tenant_id", TIEM);
    if (error) rac.push(`cấu hình chấm công: ${error.message}`);
  } else {
    const { error } = await kho
      .from("attendance_settings")
      .update({ require_selfie: cauHinhCu.require_selfie })
      .eq("tenant_id", TIEM);
    if (error) rac.push(`trả công tắc về ${cauHinhCu.require_selfie}: ${error.message}`);
  }
  if (tuTaoHoSo && NHAN_VIEN) {
    const { error } = await kho.from("employees").delete().eq("id", NHAN_VIEN);
    if (error) rac.push(`hồ sơ nhân sự tạm ${NHAN_VIEN}: ${error.message}`);
  }
  if (rac.length > 0) {
    console.log("\n⚠️ DỌN KHÔNG SẠCH — còn lại trong kho:");
    for (const r of rac) console.log(`   · ${r}`);
    truot += rac.length;
  }
}

console.log(`\n${truot === 0 ? "XANH" : "ĐỎ"}: ${dat} đạt · ${truot} trượt`);
process.exit(truot === 0 ? 0 : 1);
