/**
 * ĐỔI DƯƠNG LỊCH → ÂM LỊCH VIỆT NAM.
 *
 * Ở Việt Nam đây KHÔNG phải trang trí. Mùng 1 và ngày rằm là ngày đông khách
 * thật ở tiệm làm đẹp; khách hẹn "tuần sau, mùng mười"; và Tết thì cả tháng
 * lịch dương không nói lên điều gì. Google Lịch gọi mục này là "lịch thay thế"
 * và có sẵn Chinese/Hebrew/Hijri — bản Việt Nam thì phải tự tính.
 *
 * ⚠️ ÂM LỊCH VIỆT NAM KHÁC ÂM LỊCH TRUNG QUỐC. Cùng một thuật toán thiên văn,
 *   nhưng mốc tính là kinh tuyến 105°Đ (giờ UTC+7) chứ không phải 120°Đ
 *   (UTC+8). Vài ngày mỗi năm hai lịch lệch nhau đúng một ngày, và năm 1985
 *   lệch cả tháng Tết. Dùng thư viện lịch Trung Quốc là sai vào đúng những
 *   ngày người ta quan tâm nhất.
 *
 * Thuật toán theo bản của Hồ Ngọc Đức (thuật toán chuẩn được dùng rộng rãi cho
 * âm lịch Việt Nam), viết lại cho gọn. Các hàm thiên văn dùng công thức xấp xỉ
 * đủ chính xác cho khoảng 1900–2100.
 */

const MUI_GIO_VN = 7.0;

/** Số ngày Julian của một ngày dương lịch (theo lịch Gregory). */
function ngayJulian(nam: number, thang: number, ngay: number): number {
  const a = Math.floor((14 - thang) / 12);
  const y = nam + 4800 - a;
  const m = thang + 12 * a - 3;
  let jd =
    ngay +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
  if (jd < 2299161) {
    jd = ngay + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  }
  return jd;
}

/** Ngày Julian → ngày dương lịch. */
function tuJulian(jd: number): { nam: number; thang: number; ngay: number } {
  let a: number;
  let b: number;
  let c: number;
  if (jd > 2299160) {
    a = jd + 32044;
    b = Math.floor((4 * a + 3) / 146097);
    c = a - Math.floor((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    ngay: e - Math.floor((153 * m + 2) / 5) + 1,
    thang: m + 3 - 12 * Math.floor(m / 10),
    nam: b * 100 + d - 4800 + Math.floor(m / 10),
  };
}

/** Ngày (số nguyên, giờ địa phương) của kỳ SÓC thứ k tính từ 1/1/1900. */
function ngaySoc(k: number, muiGio: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = Math.PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 -= 0.4068 * Math.sin(Mpr * dr) - 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 -= 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 -= 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 += 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return Math.floor(Jd1 + C1 - deltat + 0.5 + muiGio / 24);
}

/** Kinh độ Mặt Trời (đơn vị: 1/30 vòng, tức số nguyên 0..11) tại ngày Julian. */
function kinhDoMatTroi(jdn: number, muiGio: number): number {
  const T = (jdn - 2451545.5 - muiGio / 24) / 36525;
  const T2 = T * T;
  const dr = Math.PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = L0 + DL;
  L = L * dr;
  L = L - Math.PI * 2 * Math.floor(L / (Math.PI * 2));
  return Math.floor((L / Math.PI) * 6);
}

/** Ngày bắt đầu tháng 11 âm lịch của năm dương `nam`. */
function thangMotMuoi(nam: number, muiGio: number): number {
  const off = ngayJulian(nam, 12, 31) - 2415021;
  const k = Math.floor(off / 29.530588853);
  let nm = ngaySoc(k, muiGio);
  const sunLong = kinhDoMatTroi(nm, muiGio);
  if (sunLong >= 9) nm = ngaySoc(k - 1, muiGio);
  return nm;
}

/** Chỉ số tháng nhuận trong chu kỳ 11→11. */
function thangNhuan(a11: number, muiGio: number): number {
  const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = kinhDoMatTroi(ngaySoc(k + i, muiGio), muiGio);
  do {
    last = arc;
    i += 1;
    arc = kinhDoMatTroi(ngaySoc(k + i, muiGio), muiGio);
  } while (arc !== last && i < 14);
  return i - 1;
}

export type NgayAm = {
  ngay: number;
  thang: number;
  nam: number;
  /** Tháng này có phải tháng nhuận không. */
  nhuan: boolean;
};

/**
 * Đổi một ngày dương lịch `YYYY-MM-DD` sang âm lịch Việt Nam.
 *
 * Nhận CHUỖI NGÀY chứ không nhận `Date`: một `Date` mang theo giờ và múi giờ
 * của máy, và ngày âm thì chỉ phụ thuộc vào ngày dương ở Việt Nam. Truyền
 * `Date` vào là mở cửa cho lỗi lệch một ngày mà không ai thấy.
 */
export function duongSangAm(dateKey: string): NgayAm {
  const nam = Number(dateKey.slice(0, 4));
  const thang = Number(dateKey.slice(5, 7));
  const ngay = Number(dateKey.slice(8, 10));
  const dayNumber = ngayJulian(nam, thang, ngay);

  const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = ngaySoc(k + 1, MUI_GIO_VN);
  if (monthStart > dayNumber) monthStart = ngaySoc(k, MUI_GIO_VN);

  let a11 = thangMotMuoi(nam, MUI_GIO_VN);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = nam;
    a11 = thangMotMuoi(nam - 1, MUI_GIO_VN);
  } else {
    lunarYear = nam + 1;
    b11 = thangMotMuoi(nam + 1, MUI_GIO_VN);
  }

  const lunarDay = dayNumber - monthStart + 1;
  const diff = Math.floor((monthStart - a11) / 29);
  let lunarLeap = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = thangNhuan(a11, MUI_GIO_VN);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) lunarLeap = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;

  return { ngay: lunarDay, thang: lunarMonth, nam: lunarYear, nhuan: lunarLeap };
}

/** Nhãn ngắn để in cạnh số ngày dương: `15` (rằm) hoặc `15/7` khi là mùng 1. */
export function nhanAmNgan(dateKey: string): string {
  const am = duongSangAm(dateKey);
  // Mùng 1 in kèm THÁNG — đó là mốc người ta cần thấy để định vị cả tháng.
  // Các ngày khác chỉ in số ngày, nếu không lưới đầy chữ và không đọc được gì.
  return am.ngay === 1 ? `${am.ngay}/${am.thang}${am.nhuan ? "N" : ""}` : String(am.ngay);
}

/** `tuJulian` được dùng ở phép thử để đi ngược lại — giữ export cho gọn. */
export { tuJulian, ngayJulian };
