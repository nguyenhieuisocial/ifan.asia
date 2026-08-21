/**
 * PHÉP SO SÁNH THUẦN — không đụng CSDL, không đụng React.
 *
 * ⚠️ TÁCH RA KHỎI `hom-nay.ts` CÓ CHỦ Ý. File kia mở đầu bằng `import "server-only"`
 *   nên không nạp được ngoài Next, tức là KHÔNG KIỂM ĐƯỢC bằng một cổng chạy
 *   thẳng bằng node. Mà đúng phần cần kiểm nhất lại là mấy phép so sánh này:
 *   chia cho 0, ngưỡng "gần như không đổi", và ngưỡng "gấp mấy lần".
 */

export type Chieu = "len" | "xuong" | "deu";

/**
 * So hai con số, trả về hướng và phần trăm.
 *
 * ⚠️ NGƯỠNG "GẦN NHƯ KHÔNG ĐỔI" LÀ 5%. Không có ngưỡng thì một ngày hơn kém
 *   1% cũng hiện mũi tên xanh/đỏ, và chủ tiệm học được rằng mũi tên vô nghĩa.
 *
 * ⚠️ `pct` LÀ null KHI HÔM QUA BẰNG 0 — chia cho 0 ra Infinity, và "tăng vô
 *   hạn phần trăm" là câu vô nghĩa. Nơi gọi phải nói bằng lời thay vì bằng số.
 */
export function soSanh(nay: number, truoc: number): { chieu: Chieu; pct: number | null } {
  if (truoc === 0) {
    if (nay === 0) return { chieu: "deu", pct: null };
    return { chieu: "len", pct: null };
  }
  const pct = Math.round(((nay - truoc) / truoc) * 100);
  if (Math.abs(pct) < 5) return { chieu: "deu", pct };
  return { chieu: pct > 0 ? "len" : "xuong", pct: Math.abs(pct) };
}

/**
 * So một con số với MỨC THƯỜNG NGÀY (trung vị), dùng cho huỷ hẹn và lịch.
 *
 * ⚠️ "GẤP MẤY LẦN" CHỈ NÓI KHI TỪ 2 LẦN TRỞ LÊN. Dưới mức đó thì "gấp 1,3 lần"
 *   nghe như báo động trong khi thực tế là dao động thường ngày.
 */
export function soVoiThuongNgay(
  nay: number,
  moc: number,
): { chieu: Chieu; lan: number | null } {
  if (moc <= 0) return { chieu: nay > 0 ? "len" : "deu", lan: null };
  const ty = nay / moc;
  if (ty >= 2) return { chieu: "len", lan: Math.round(ty * 10) / 10 };
  if (ty >= 0.75) return { chieu: "deu", lan: null };
  return { chieu: "xuong", lan: null };
}
