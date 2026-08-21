/**
 * CỔNG: mấy phép so sánh của khối "Tình hình hôm nay" phải đúng ở CÁC CA BIÊN.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Khối này là chỗ DUY NHẤT trên màn Tổng quan dịch con số ra thành CÂU CHỮ
 * ("gấp 3 lần mức thường ngày", "hôm qua chưa có"). Câu chữ sai thì chủ tiệm
 * hành động sai — mà câu chữ sai KHÔNG làm màn hình đỏ, không làm bản dựng
 * hỏng, không ai biết.
 *
 * Ba ca biên đều đã suýt ra câu vô nghĩa:
 *   ① hôm qua = 0 → phần trăm là chia cho 0 → "tăng ∞%".
 *   ② mức thường ngày = 0 → "gấp ∞ lần mức thường ngày".
 *   ③ hơn kém 1–2% → mũi tên xanh/đỏ nhảy mỗi ngày, học được rằng nó vô nghĩa.
 *
 * ⚠️ DỮ LIỆU MẪU CỦA TIỆM DEMO ĐANG DỪNG Ở 20/08 nên mọi số "hôm nay" đều bằng
 *   0 — tức là nhìn màn thật KHÔNG kiểm được các nhánh khác 0. Cổng này kiểm
 *   thẳng phép tính, không phụ thuộc dữ liệu mẫu còn tươi hay không.
 *
 * Chạy: node --experimental-strip-types scripts/hom-nay-so-sanh-smoke.mjs
 */
import { soSanh, soVoiThuongNgay } from "../lib/so-lieu/so-sanh.ts";

let dat = 0;
let truot = 0;
const kiem = (ten, that, mong) => {
  const ok = JSON.stringify(that) === JSON.stringify(mong);
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ok ? "" : ` — ra ${JSON.stringify(that)}, cần ${JSON.stringify(mong)}`}`);
  if (ok) dat++;
  else truot++;
};

console.log("[hom-nay] So voi HOM QUA:");
kiem("hôm qua 0, hôm nay có tiền ⇒ KHÔNG ra phần trăm", soSanh(500000, 0), { chieu: "len", pct: null });
kiem("cả hai đều 0 ⇒ không tăng không giảm", soSanh(0, 0), { chieu: "deu", pct: null });
kiem("hôm nay 0, hôm qua có ⇒ giảm 100%", soSanh(0, 800000), { chieu: "xuong", pct: 100 });
kiem("tăng 18%", soSanh(1180, 1000), { chieu: "len", pct: 18 });
kiem("hơn 2% ⇒ coi như không đổi", soSanh(1020, 1000), { chieu: "deu", pct: 2 });
kiem("kém 4% ⇒ vẫn coi như không đổi", soSanh(960, 1000), { chieu: "deu", pct: -4 });
kiem("kém 6% ⇒ đã là giảm", soSanh(940, 1000), { chieu: "xuong", pct: 6 });

console.log("[hom-nay] So voi MUC THUONG NGAY:");
kiem("thường ngày 0, hôm nay có ⇒ KHÔNG ra số lần", soVoiThuongNgay(4, 0), { chieu: "len", lan: null });
kiem("thường ngày 0, hôm nay cũng 0", soVoiThuongNgay(0, 0), { chieu: "deu", lan: null });
kiem("gấp đúng 2 lần ⇒ mới được nói 'gấp'", soVoiThuongNgay(6, 3), { chieu: "len", lan: 2 });
kiem("gấp 1,7 lần ⇒ CHƯA nói 'gấp', chỉ là dao động", soVoiThuongNgay(5, 3), { chieu: "deu", lan: null });
kiem("gấp 2,7 lần", soVoiThuongNgay(8, 3), { chieu: "len", lan: 2.7 });
kiem("bằng 1/3 mức thường ⇒ thấp hơn hẳn", soVoiThuongNgay(1, 3), { chieu: "xuong", lan: null });
kiem("bằng 3/4 mức thường ⇒ vẫn coi là bình thường", soVoiThuongNgay(3, 4), { chieu: "deu", lan: null });
// Mức thường ngày là TRUNG VỊ nên có thể lẻ — không được làm tròn trước khi chia.
kiem("mức thường ngày lẻ 3,5", soVoiThuongNgay(7, 3.5), { chieu: "len", lan: 2 });

console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
