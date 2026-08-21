/**
 * SINH ẢNH MÀN HÌNH CHỜ (splash) CHO iOS.
 *
 * Vì sao phải sinh sẵn từng cỡ: Android tự dựng màn chờ từ `manifest` (tên +
 * màu nền + biểu tượng). **iOS thì không.** Safari đòi đúng một thẻ
 * `apple-touch-startup-image` khớp CHÍNH XÁC kích thước và tỉ lệ điểm ảnh của
 * máy; không khớp thì nó bỏ qua và người dùng nhìn một màn TRẮNG khoảng một
 * giây mỗi lần mở app.
 *
 * Một giây màn trắng nghe nhỏ, nhưng nó là thứ phân biệt "một app" với "một
 * trang web được đặt lối tắt" — và founder cài iFan lên điện thoại để nó CẢM
 * GIÁC như app.
 *
 * ⚠️ Chỉ làm CHIỀU DỌC. Tiệm dùng điện thoại dọc; thêm bản ngang là gấp đôi số
 *   tệp cho một tình huống chưa ai gặp. Thiếu bản ngang thì iOS chỉ bỏ qua và
 *   quay về màn nền — không hỏng gì.
 *
 * Chạy: node scripts/tao-man-cho-ios.mjs
 */
import sharp from "sharp";
import { mkdirSync, existsSync } from "node:fs";

const NEN = "#FAF5EF"; // khớp `background_color` trong manifest
const BIEU_TUONG = "public/icons/icon-512.png";
const THU_MUC = "public/splash";

/**
 * [rộng, cao] tính bằng ĐIỂM ẢNH THẬT, và tỉ lệ điểm ảnh của máy.
 * Danh sách phủ các dòng iPhone đang dùng phổ biến + hai cỡ iPad.
 */
const MAY = [
  { w: 1290, h: 2796, r: 3, ten: "iPhone 15/16 Pro Max" },
  { w: 1284, h: 2778, r: 3, ten: "iPhone 12–14 Pro Max" },
  { w: 1179, h: 2556, r: 3, ten: "iPhone 15/16" },
  { w: 1170, h: 2532, r: 3, ten: "iPhone 12–14" },
  { w: 1125, h: 2436, r: 3, ten: "iPhone X/XS/11 Pro" },
  { w: 1242, h: 2688, r: 3, ten: "iPhone XS Max/11 Pro Max" },
  { w: 828, h: 1792, r: 2, ten: "iPhone XR/11" },
  { w: 750, h: 1334, r: 2, ten: "iPhone 6–8/SE2" },
  { w: 640, h: 1136, r: 2, ten: "iPhone SE1" },
  { w: 1536, h: 2048, r: 2, ten: "iPad 9.7/10.2" },
  { w: 1668, h: 2388, r: 2, ten: "iPad Pro 11" },
  { w: 2048, h: 2732, r: 2, ten: "iPad Pro 12.9" },
];

if (!existsSync(THU_MUC)) mkdirSync(THU_MUC, { recursive: true });

const dsThe = [];
for (const m of MAY) {
  // Biểu tượng chiếm ~28% chiều hẹp — đủ to để nhận ra, đủ nhỏ để không thành
  // một khối màu chiếm hết màn.
  const canh = Math.round(Math.min(m.w, m.h) * 0.28);
  const bieuTuong = await sharp(BIEU_TUONG).resize(canh, canh).toBuffer();

  const ten = `${THU_MUC}/splash-${m.w}x${m.h}.png`;
  await sharp({
    create: { width: m.w, height: m.h, channels: 4, background: NEN },
  })
    .composite([{ input: bieuTuong, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(ten);

  // Thẻ HTML tương ứng — kích thước trong `media` tính bằng ĐIỂM (point),
  // tức là điểm ảnh chia cho tỉ lệ.
  dsThe.push(
    `<link rel="apple-touch-startup-image" media="(device-width: ${m.w / m.r}px) and (device-height: ${m.h / m.r}px) and (-webkit-device-pixel-ratio: ${m.r}) and (orientation: portrait)" href="/splash/splash-${m.w}x${m.h}.png" />`,
  );
  console.log(`  ✓ ${ten}  (${m.ten})`);
}

console.log(`\n${MAY.length} ảnh. Dán các thẻ sau vào <head> (app/layout.tsx):\n`);
console.log(dsThe.join("\n"));
