/**
 * CỔNG: thuật toán chia cột cho các ca TRÙNG GIỜ trên lưới lịch.
 *
 * Vì sao đáng có một cổng riêng: sai ở đây KHÔNG làm màn hình đỏ. Ca vẫn hiện,
 * chỉ hiện sai chỗ — chồng lên nhau, hoặc rộng hẹp lệch nhau — và mắt người rất
 * dễ bỏ qua. Đúng loại lỗi phải để máy canh.
 *
 * Ca bẫy quan trọng nhất là ca thứ 6: A trùng B, B trùng C, nhưng A KHÔNG trùng
 * C. Cả ba phải thuộc CÙNG một cụm và cùng số cột. Tính số cột theo từng ca
 * (thay vì theo cụm) sẽ ra bề ngang khác nhau và lưới trông vỡ.
 *
 * Chạy: node scripts/soat-xep-chong.mjs
 */
// Nap THANG file .ts: Node 22 tu go chu thich kieu, khong can buoc bien dich.
// Ban dau goi `tsc` ra thu muc tam roi nap — them mot khau de hong ma khong
// duoc gi. Nap thang thi cong nay thu DUNG file dang chay, khong phai mot ban
// dich co the lech.
const { xepChong } = await import("../app/app/calendar/xep-chong.ts");

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
const chay = (cs) => {
  const cho = xepChong(cs);
  return cs.map((c) => {
    const o = cho.get(c);
    return [o.cot, o.soCot];
  });
};

kiem("một ca → 1 cột", chay([{ startMin: 540, endMin: 600 }]), [[0, 1]]);
kiem(
  "hai ca rời nhau → đều 1 cột",
  chay([
    { startMin: 540, endMin: 600 },
    { startMin: 660, endMin: 720 },
  ]),
  [
    [0, 1],
    [0, 1],
  ],
);
kiem(
  "hai ca trùng → 2 cột",
  chay([
    { startMin: 540, endMin: 600 },
    { startMin: 570, endMin: 630 },
  ]),
  [
    [0, 2],
    [1, 2],
  ],
);
kiem(
  "ba ca cùng giờ → 3 cột",
  chay([
    { startMin: 540, endMin: 600 },
    { startMin: 540, endMin: 600 },
    { startMin: 540, endMin: 600 },
  ]),
  [
    [0, 3],
    [1, 3],
    [2, 3],
  ],
);
kiem(
  "nối đuôi (9–10, 10–11) KHÔNG tính là trùng",
  chay([
    { startMin: 540, endMin: 600 },
    { startMin: 600, endMin: 660 },
  ]),
  [
    [0, 1],
    [0, 1],
  ],
);
kiem(
  "dây trùng nối tiếp → cùng MỘT cụm, cùng số cột",
  chay([
    { startMin: 540, endMin: 600 },
    { startMin: 570, endMin: 630 },
    { startMin: 615, endMin: 660 },
  ]),
  [
    [0, 2],
    [1, 2],
    [0, 2],
  ],
);
kiem(
  "ca dài 0 phút vẫn chiếm chỗ (không tàng hình)",
  chay([
    { startMin: 540, endMin: 540 },
    { startMin: 540, endMin: 600 },
  ]),
  [
    [0, 2],
    [1, 2],
  ],
);
kiem("không có ca nào", [...xepChong([]).values()], []);

console.log(`\n${sai === 0 ? "✅" : "❌"} ${dung} đúng · ${sai} sai`);
process.exit(sai ? 1 : 0);
