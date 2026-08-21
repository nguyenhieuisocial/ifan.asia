/**
 * XẾP CHỖ CHO CÁC CA TRÙNG GIỜ trên lưới thời gian.
 *
 * Ba ca cùng 09:00 phải hiện CẠNH NHAU, mỗi ca một cột hẹp — không phải nối
 * đuôi nhau xuống dưới (sai giờ) cũng không phải chồng lên nhau (che mất).
 *
 * Cách làm, đúng như Google Lịch:
 *   1. Gom các ca thành từng CỤM: hai ca thuộc cùng cụm nếu chúng dính nhau
 *      qua một chuỗi trùng giờ. Cụm là đơn vị chia bề ngang.
 *   2. Trong mỗi cụm, xếp từng ca vào CỘT rảnh đầu tiên (cột nào mà ca cuối
 *      cùng của nó đã kết thúc trước khi ca này bắt đầu).
 *   3. Bề ngang của mỗi ca = 1 / (số cột của cụm).
 *
 * ⚠️ Số cột tính theo CỤM chứ không theo từng ca. Nếu tính theo ca thì hai ca
 *   trùng nhau ở đầu giờ và một ca thứ ba chỉ trùng với ca thứ hai sẽ ra bề
 *   ngang khác nhau và lưới trông vỡ. Đây là chỗ dễ làm sai nhất của thuật
 *   toán này.
 *
 * ⚠️ Ca dài 0 phút (giờ bắt đầu = giờ kết thúc) vẫn phải chiếm chỗ, nếu không
 *   nó tàng hình. Coi như tối thiểu 1 phút khi xét trùng.
 */

export type KhoangCa = { startMin: number; endMin: number };

export type OChoNgoi = {
  /** Vị trí cột, đếm từ 0. */
  cot: number;
  /** Tổng số cột của cụm chứa ca này. */
  soCot: number;
};

export function xepChong<T extends KhoangCa>(cacCa: T[]): Map<T, OChoNgoi> {
  const ra = new Map<T, OChoNgoi>();
  if (cacCa.length === 0) return ra;

  const theoGio = [...cacCa].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  );
  const ketThuc = (c: KhoangCa) => Math.max(c.endMin, c.startMin + 1);

  let cum: T[] = [];
  let cumHetLuc = -Infinity;

  const chotCum = () => {
    if (cum.length === 0) return;
    // Cột nào đang bận tới phút nào.
    const cotHetLuc: number[] = [];
    const cotCuaCa = new Map<T, number>();
    for (const ca of cum) {
      let i = cotHetLuc.findIndex((het) => het <= ca.startMin);
      if (i === -1) {
        i = cotHetLuc.length;
        cotHetLuc.push(0);
      }
      cotHetLuc[i] = ketThuc(ca);
      cotCuaCa.set(ca, i);
    }
    const soCot = cotHetLuc.length;
    for (const ca of cum) ra.set(ca, { cot: cotCuaCa.get(ca) as number, soCot });
    cum = [];
    cumHetLuc = -Infinity;
  };

  for (const ca of theoGio) {
    if (cum.length > 0 && ca.startMin >= cumHetLuc) chotCum();
    cum.push(ca);
    cumHetLuc = Math.max(cumHetLuc, ketThuc(ca));
  }
  chotCum();
  return ra;
}
