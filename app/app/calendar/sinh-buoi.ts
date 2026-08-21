import { addDaysToDateKey, weekdayOfDateKey } from "@/lib/booking/schedule";

/**
 * SINH RA CÁC NGÀY của một liệu trình lặp lại.
 *
 * Hàm THUẦN, không đụng cơ sở dữ liệu và không đụng múi giờ — vào là một ngày
 * bắt đầu (`YYYY-MM-DD`) cùng luật lặp, ra là danh sách ngày. Tách riêng vì
 * đây là chỗ dễ sai nhất và sai thì không ai thấy: một liệu trình lệch một
 * ngày vẫn trông hoàn toàn bình thường trên lưới.
 *
 * ⚠️ Buổi ĐẦU TIÊN luôn là `ngayDau`, kể cả khi thứ của nó không nằm trong
 *   `cacThu`. Người ta vừa chọn giờ đó trên lưới; đẩy buổi đầu sang ngày khác
 *   là làm khác cái họ vừa bấm.
 */

export const TRAN_SO_BUOI = 100;

export type LuatLap = {
  freq: "day" | "week" | "month";
  /** Lặp mỗi N đơn vị. 1 = mỗi tuần, 2 = cách một tuần. */
  buoc: number;
  /** Chỉ dùng với `week`: các thứ được chọn, 0=CN..6=T7. Rỗng = theo thứ của buổi đầu. */
  cacThu: number[];
  /** Chỉ dùng với `month`: theo THỨ thứ mấy của tháng thay vì theo NGÀY trong tháng. */
  theoThuCuaThang: boolean;
  soBuoi: number;
};

/** Ngày thứ mấy trong tháng của một mốc — ví dụ "thứ Ba thứ 3 của tháng" → 3. */
function thuMayCuaThang(dateKey: string): number {
  return Math.floor((Number(dateKey.slice(8, 10)) - 1) / 7) + 1;
}

/** Ngày `YYYY-MM-DD` của "thứ `thu` lần thứ `lan` trong tháng `thang`", hoặc null nếu tháng đó không có. */
function ngayCuaThuTrongThang(thang: string, thu: number, lan: number): string | null {
  const mungMot = `${thang}-01`;
  const thuCuaMungMot = weekdayOfDateKey(mungMot);
  const lech = (thu - thuCuaMungMot + 7) % 7;
  const ngay = 1 + lech + (lan - 1) * 7;
  const kq = addDaysToDateKey(mungMot, ngay - 1);
  // Trôi sang tháng sau ⇒ tháng này không có "thứ X lần thứ N".
  return kq.slice(0, 7) === thang ? kq : null;
}

function thangKe(thang: string, buoc: number): string {
  const [y, m] = thang.split("-").map(Number);
  const tong = y * 12 + (m - 1) + buoc;
  return `${Math.floor(tong / 12)}-${String((tong % 12) + 1).padStart(2, "0")}`;
}

export function sinhCacNgay(ngayDau: string, luat: LuatLap): string[] {
  const soBuoi = Math.max(1, Math.min(TRAN_SO_BUOI, Math.floor(luat.soBuoi)));
  const buoc = Math.max(1, Math.floor(luat.buoc));
  if (soBuoi === 1) return [ngayDau];

  const ra: string[] = [ngayDau];

  if (luat.freq === "day") {
    let k = ngayDau;
    while (ra.length < soBuoi) {
      k = addDaysToDateKey(k, buoc);
      ra.push(k);
    }
    return ra;
  }

  if (luat.freq === "week") {
    const thuChon = luat.cacThu.length > 0 ? [...new Set(luat.cacThu)].sort((a, b) => a - b) : [weekdayOfDateKey(ngayDau)];
    // Mốc đầu tuần (Thứ Hai) của tuần chứa buổi đầu.
    const wDau = weekdayOfDateKey(ngayDau);
    let dauTuan = addDaysToDateKey(ngayDau, -(wDau === 0 ? 6 : wDau - 1));

    // ⚠️ Vòng lặp có TRẦN CỨNG. Không có nó thì một luật vô lý (buoc rất lớn,
    //   cacThu rỗng sau khi lọc) làm treo cả trình duyệt — treo im lặng, không
    //   lỗi nào hiện ra.
    for (let vong = 0; ra.length < soBuoi && vong < TRAN_SO_BUOI * 8; vong++) {
      dauTuan = addDaysToDateKey(dauTuan, 7 * buoc);
      for (const thu of thuChon) {
        if (ra.length >= soBuoi) break;
        // Thứ Hai = lệch 0 … Chủ nhật = lệch 6
        ra.push(addDaysToDateKey(dauTuan, thu === 0 ? 6 : thu - 1));
      }
    }
    // Tuần đầu: nếu chọn nhiều thứ, các thứ CÒN LẠI của chính tuần đó và nằm
    // SAU buổi đầu cũng phải có. Chèn rồi cắt lại cho đúng số buổi.
    if (thuChon.length > 1) {
      const themTuanDau: string[] = [];
      const dauTuanGoc = addDaysToDateKey(ngayDau, -(wDau === 0 ? 6 : wDau - 1));
      for (const thu of thuChon) {
        const k = addDaysToDateKey(dauTuanGoc, thu === 0 ? 6 : thu - 1);
        if (k > ngayDau) themTuanDau.push(k);
      }
      if (themTuanDau.length > 0) {
        return [...new Set([ngayDau, ...themTuanDau, ...ra.slice(1)])]
          .sort()
          .slice(0, soBuoi);
      }
    }
    return ra.slice(0, soBuoi);
  }

  // ── Hằng tháng ──────────────────────────────────────────────────
  const ngayTrongThang = Number(ngayDau.slice(8, 10));
  const thu = weekdayOfDateKey(ngayDau);
  const lan = thuMayCuaThang(ngayDau);
  let thang = ngayDau.slice(0, 7);

  for (let vong = 0; ra.length < soBuoi && vong < TRAN_SO_BUOI * 4; vong++) {
    thang = thangKe(thang, buoc);
    if (luat.theoThuCuaThang) {
      const k = ngayCuaThuTrongThang(thang, thu, lan);
      // Tháng không có "thứ X lần thứ 5" thì BỎ QUA tháng đó, không lùi về lần
      // thứ 4 — lùi là bịa ra một buổi người ta không đặt.
      if (k) ra.push(k);
    } else {
      const soNgay = new Date(Date.UTC(Number(thang.slice(0, 4)), Number(thang.slice(5, 7)), 0)).getUTCDate();
      // Ngày 31 mà tháng chỉ có 30 ⇒ BỎ QUA tháng đó, không dồn về ngày 30.
      if (ngayTrongThang <= soNgay) {
        ra.push(`${thang}-${String(ngayTrongThang).padStart(2, "0")}`);
      }
    }
  }
  return ra.slice(0, soBuoi);
}

/** Câu mô tả luật lặp cho người đọc — "Mỗi tuần một lần · 8 buổi". */
export function moTaLuat(luat: LuatLap, t: (k: string, v?: Record<string, string | number>) => string): string {
  const donVi = t(`repeat.unit.${luat.freq}`);
  const nhip = luat.buoc === 1 ? t("repeat.every", { unit: donVi }) : t("repeat.everyN", { n: luat.buoc, unit: donVi });
  return t("repeat.summary", { nhip, count: luat.soBuoi });
}
