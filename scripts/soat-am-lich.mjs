/**
 * CỔNG: đổi dương lịch → âm lịch Việt Nam.
 *
 * Vì sao đáng có cổng riêng: sai ở đây trông hoàn toàn bình thường. Một con số
 * nhỏ cạnh ngày dương, lệch một ngày, và không ai kiểm bằng mắt được. Nhưng
 * lệch một ngày ở mùng 1 hay rằm là lệch đúng ngày người ta quan tâm nhất, và
 * lệch ở Tết thì cả tiệm đóng cửa nhầm hôm.
 *
 * Các mốc dưới đây là ngày Tết (mùng 1 tháng Giêng) đã biết chắc, cùng vài
 * mốc rằm và mốc tháng nhuận.
 *
 * ⚠️ Âm lịch VIỆT NAM khác âm lịch TRUNG QUỐC — cùng thuật toán nhưng mốc là
 *   kinh tuyến 105°Đ (UTC+7) chứ không phải 120°Đ (UTC+8). Nếu ai đó thay hàm
 *   này bằng một thư viện lịch Trung Quốc, cổng này phải đỏ.
 *
 * Chạy: node --import ./scripts/ho-tro/dang-ky-nap-ts.mjs scripts/soat-am-lich.mjs
 */
const { duongSangAm, nhanAmNgan } = await import("../lib/am-lich.ts");

let dung = 0;
let sai = 0;
const kiem = (ten, that, mong) => {
  const ok = JSON.stringify(that) === JSON.stringify(mong);
  if (ok) {
    dung++;
    console.log(`  ✓ ${ten}`);
  } else {
    sai++;
    console.log(`  ✗ ${ten}`);
    console.log(`      ra  : ${JSON.stringify(that)}`);
    console.log(`      mong: ${JSON.stringify(mong)}`);
  }
};
const am = (d) => {
  const x = duongSangAm(d);
  return `${x.ngay}/${x.thang}${x.nhuan ? "N" : ""}/${x.nam}`;
};

console.log("── TẾT (mùng 1 tháng Giêng) ──");
kiem("Tết Giáp Thìn 2024", am("2024-02-10"), "1/1/2024");
kiem("Tết Ất Tỵ 2025", am("2025-01-29"), "1/1/2025");
kiem("Tết Bính Ngọ 2026", am("2026-02-17"), "1/1/2026");
kiem("Tết Đinh Mùi 2027", am("2027-02-06"), "1/1/2027");
kiem("Tết Nhâm Dần 2022", am("2022-02-01"), "1/1/2022");
kiem("Tết Canh Tý 2020", am("2020-01-25"), "1/1/2020");

console.log("── NGÀY LIỀN TRƯỚC TẾT phải là cuối tháng Chạp ──");
kiem("30 Tết 2026", am("2026-02-16"), "29/12/2025");
kiem("30 Tết 2025", am("2025-01-28"), "29/12/2024");

console.log("── RẰM & MÙNG ──");
kiem("rằm tháng Giêng 2026", am("2026-03-03"), "15/1/2026");
kiem("mùng 1 tháng 8 âm 2026", am("2026-09-11"), "1/8/2026");
kiem("rằm Trung thu 2026", am("2026-09-25"), "15/8/2026");

console.log("── THÁNG NHUẬN ──");
// 2025 âm lịch có tháng 6 nhuận.
kiem("mùng 1 tháng 6 nhuận 2025", am("2025-07-25"), "1/6N/2025");
kiem("ngày trong tháng 6 nhuận 2025", am("2025-08-01"), "8/6N/2025");
kiem("tháng 6 THƯỜNG 2025 (trước tháng nhuận)", am("2025-06-25"), "1/6/2025");

console.log("── NHÃN NGẮN ──");
kiem("mùng 1 in kèm tháng", nhanAmNgan("2026-02-17"), "1/1");
kiem("ngày thường chỉ in số ngày", nhanAmNgan("2026-03-03"), "15");
kiem("mùng 1 tháng nhuận có dấu N", nhanAmNgan("2025-07-25"), "1/6N");

console.log("── LIÊN TỤC & HỢP LỆ ──");
kiem(
  "365 ngày liền: ngày âm luôn trong 1..30",
  (() => {
    let ok = true;
    for (let i = 0; i < 365; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      const x = duongSangAm(d);
      if (x.ngay < 1 || x.ngay > 30 || x.thang < 1 || x.thang > 12) ok = false;
    }
    return ok;
  })(),
  true,
);
kiem(
  "365 ngày liền: mỗi ngày dương ra đúng một ngày âm khác nhau",
  (() => {
    const thay = new Set();
    for (let i = 0; i < 365; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      thay.add(am(d));
    }
    return thay.size === 365;
  })(),
  true,
);

console.log(`\n${sai === 0 ? "✅" : "❌"} ${dung} đúng · ${sai} sai`);
process.exit(sai ? 1 : 0);
