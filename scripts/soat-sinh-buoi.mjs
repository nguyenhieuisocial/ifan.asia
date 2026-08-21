/**
 * CỔNG: phép sinh các buổi của một liệu trình lặp lại.
 *
 * Vì sao đáng có cổng riêng: sai ở đây KHÔNG làm màn hình đỏ và KHÔNG ai nhìn
 * ra. Một liệu trình lệch một ngày, hoặc thiếu buổi cuối, hoặc dồn buổi 31
 * sang ngày 30 của tháng thiếu — tất cả đều trông hoàn toàn bình thường trên
 * lưới. Người phát hiện sẽ là khách, khi họ tới vào ngày không có ai đợi.
 *
 * Ba ca bẫy được canh kỹ nhất:
 *   · buổi ĐẦU luôn là ngày người ta vừa bấm, kể cả khi thứ của nó không nằm
 *     trong danh sách thứ được chọn;
 *   · ngày 31 gặp tháng 30 ngày thì BỎ QUA tháng đó, KHÔNG dồn về ngày 30
 *     (dồn là bịa ra một buổi người ta không đặt);
 *   · "thứ Ba lần thứ 5" gặp tháng không có lần thứ 5 thì cũng BỎ QUA, không
 *     lùi về lần thứ 4.
 *
 * Chạy: node --import ./scripts/ho-tro/dang-ky-nap-ts.mjs scripts/soat-sinh-buoi.mjs
 */
const { sinhCacNgay } = await import("../app/app/calendar/sinh-buoi.ts");

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
const luat = (o) => ({ freq: "week", buoc: 1, cacThu: [], theoThuCuaThang: false, soBuoi: 1, ...o });

console.log("── HẰNG NGÀY ──");
kiem("một buổi thì đúng một ngày", sinhCacNgay("2026-08-21", luat({ freq: "day", soBuoi: 1 })), [
  "2026-08-21",
]);
kiem(
  "mỗi ngày, 4 buổi",
  sinhCacNgay("2026-08-21", luat({ freq: "day", soBuoi: 4 })),
  ["2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24"],
);
kiem(
  "cách một ngày, 3 buổi",
  sinhCacNgay("2026-08-21", luat({ freq: "day", buoc: 2, soBuoi: 3 })),
  ["2026-08-21", "2026-08-23", "2026-08-25"],
);
kiem(
  "qua ranh gioi thang",
  sinhCacNgay("2026-08-30", luat({ freq: "day", soBuoi: 3 })),
  ["2026-08-30", "2026-08-31", "2026-09-01"],
);

console.log("── HẰNG TUẦN ──");
// 21/08/2026 là Thứ Sáu.
kiem(
  "mỗi tuần một lần, 4 buổi",
  sinhCacNgay("2026-08-21", luat({ soBuoi: 4 })),
  ["2026-08-21", "2026-08-28", "2026-09-04", "2026-09-11"],
);
kiem(
  "cách một tuần, 3 buổi",
  sinhCacNgay("2026-08-21", luat({ buoc: 2, soBuoi: 3 })),
  ["2026-08-21", "2026-09-04", "2026-09-18"],
);
// Thứ 2 và Thứ 5 hằng tuần, bắt đầu từ Thứ Sáu 21/08.
// Buổi đầu PHẢI là 21/08 dù thứ Sáu không nằm trong danh sách.
kiem(
  "chọn T2+T5, bắt đầu từ T6 — buổi đầu vẫn là ngày đã bấm",
  sinhCacNgay("2026-08-21", luat({ cacThu: [1, 4], soBuoi: 5 })),
  ["2026-08-21", "2026-08-24", "2026-08-27", "2026-08-31", "2026-09-03"],
);
kiem(
  "chọn T2+T5, bắt đầu ĐÚNG T2 — các thứ còn lại của tuần đó cũng có",
  sinhCacNgay("2026-08-24", luat({ cacThu: [1, 4], soBuoi: 4 })),
  ["2026-08-24", "2026-08-27", "2026-08-31", "2026-09-03"],
);
kiem(
  "chủ nhật (thứ 0) xếp đúng cuối tuần",
  sinhCacNgay("2026-08-23", luat({ cacThu: [0], soBuoi: 3 })),
  ["2026-08-23", "2026-08-30", "2026-09-06"],
);

console.log("── HẰNG THÁNG ──");
kiem(
  "cùng NGÀY trong tháng",
  sinhCacNgay("2026-08-17", luat({ freq: "month", soBuoi: 3 })),
  ["2026-08-17", "2026-09-17", "2026-10-17"],
);
kiem(
  "ngày 31: BỎ QUA tháng thiếu, không dồn về ngày 30",
  sinhCacNgay("2026-08-31", luat({ freq: "month", soBuoi: 3 })),
  ["2026-08-31", "2026-10-31", "2026-12-31"],
);
kiem(
  "ngày 29 gặp tháng 2 năm thường",
  sinhCacNgay("2026-12-29", luat({ freq: "month", soBuoi: 3 })),
  ["2026-12-29", "2027-01-29", "2027-03-29"],
);
// 21/08/2026 là Thứ Sáu thứ 3 của tháng 8.
kiem(
  "theo THỨ của tháng (thứ Sáu thứ 3)",
  sinhCacNgay("2026-08-21", luat({ freq: "month", theoThuCuaThang: true, soBuoi: 3 })),
  ["2026-08-21", "2026-09-18", "2026-10-16"],
);
// 29/08/2026 là Thứ Bảy thứ 5 của tháng 8 — tháng 9 và 10 không có T7 thứ 5.
kiem(
  "thứ Bảy LẦN THỨ 5: bỏ qua tháng không có, không lùi về lần thứ 4",
  sinhCacNgay("2026-08-29", luat({ freq: "month", theoThuCuaThang: true, soBuoi: 3 })),
  ["2026-08-29", "2026-10-31", "2027-01-30"],
);

console.log("── TRẦN & GIỚI HẠN ──");
kiem("trần 100 buổi", sinhCacNgay("2026-08-21", luat({ freq: "day", soBuoi: 5000 })).length, 100);
kiem("số buổi 0 vẫn ra 1", sinhCacNgay("2026-08-21", luat({ freq: "day", soBuoi: 0 })).length, 1);
kiem("bước 0 không treo", sinhCacNgay("2026-08-21", luat({ freq: "day", buoc: 0, soBuoi: 3 })).length, 3);
kiem(
  "không có ngày trùng nhau",
  (() => {
    const ds = sinhCacNgay("2026-08-24", luat({ cacThu: [1, 4], soBuoi: 20 }));
    return ds.length === new Set(ds).size;
  })(),
  true,
);
kiem(
  "luôn theo thứ tự tăng dần",
  (() => {
    const ds = sinhCacNgay("2026-08-21", luat({ cacThu: [1, 3, 5], soBuoi: 15 }));
    return ds.every((x, i) => i === 0 || x > ds[i - 1]);
  })(),
  true,
);

console.log(`\n${sai === 0 ? "✅" : "❌"} ${dung} đúng · ${sai} sai`);
process.exit(sai ? 1 : 0);
