/**
 * VẼ PHIẾU LƯƠNG THÀNH MỘT TẤM ẢNH.
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO LÀ ẢNH, KHÔNG PHẢI CHỮ
 * ════════════════════════════════════════════════════════════════════
 *
 * Founder nêu 21/08: *"bảng lương sao không có tự tạo ảnh rồi nút gửi lương tự
 * động"*. Trước bản này, gửi lương cho nhân viên nghĩa là **chụp màn hình từng
 * người rồi gửi tay** — ảnh chụp lẫn cả thanh trình duyệt, cắt mất dòng cuối,
 * và mỗi người một kiểu.
 *
 * Ảnh chứ không phải chữ, vì ba lý do:
 *   · gửi qua Zalo thì **chữ dài bị cắt dòng loạn** trên điện thoại
 *   · người nhận **lưu lại được** — chữ trong khung chat thì trôi mất
 *   · ảnh **không sửa được**, hợp với thứ liên quan tới tiền
 *
 * ⚠️ Vẽ ở TẦNG TRÌNH DUYỆT, không phải máy chủ. Số liệu đã có sẵn trên màn nên
 *   không cần gọi thêm lần nào; và **không tấm phiếu lương nào rời khỏi máy của
 *   người dùng** trên đường tạo ảnh — đây là số tiền của từng người, càng ít
 *   chỗ đi qua càng tốt.
 *
 * ⚠️ Chữ vẽ bằng phông đang có sẵn trên trang. Nếu phông chưa tải xong, trình
 *   duyệt tự lùi về phông hệ thống — ảnh vẫn đọc được, chỉ khác nét.
 */

export type DongPhieu = {
  nhan: string;
  soTien: number;
  /** true = khoản TRỪ vào lương (tạm ứng, phạt). */
  laTru: boolean;
};

export type PhieuVe = {
  tenTiem: string;
  thang: string;
  tenNhanVien: string;
  dong: DongPhieu[];
  thucNhan: number;
  /** Câu cuối ảnh — ai thắc mắc thì hỏi ai. */
  chanTrang: string;
};

const RONG = 720;
const LE = 44;
const CAM = "#C94C18";
const CHU = "#1c1917";
const MO = "#78716c";
const VIEN = "#e7e5e4";

const tienVN = (n: number) => `${new Intl.NumberFormat("vi-VN").format(Math.abs(n))}đ`;

/**
 * Vẽ và trả về ảnh PNG.
 * Trả `null` khi trình duyệt không cho vẽ (rất hiếm) — nơi gọi phải xử lý, chứ
 * đừng để nút bấm không ra gì mà không báo.
 */
export async function veAnhPhieuLuong(p: PhieuVe): Promise<Blob | null> {
  const cao = 250 + p.dong.length * 46 + 150;
  const c = document.createElement("canvas");
  const ty = Math.min(window.devicePixelRatio || 1, 3);
  c.width = RONG * ty;
  c.height = cao * ty;
  const g = c.getContext("2d");
  if (!g) return null;
  g.scale(ty, ty);

  const phong = (co: number, dam = 400) =>
    `${dam} ${co}px "Be Vietnam Pro", system-ui, -apple-system, sans-serif`;

  // Nền
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, RONG, cao);
  // Vạch màu thương hiệu ở mép trên — để ảnh nhận ra ngay là của tiệm nào
  g.fillStyle = CAM;
  g.fillRect(0, 0, RONG, 8);

  let y = 62;
  g.fillStyle = MO;
  g.font = phong(15);
  g.fillText(p.tenTiem, LE, y);

  y += 34;
  g.fillStyle = CHU;
  g.font = phong(26, 600);
  g.fillText(`Phiếu lương ${p.thang}`, LE, y);

  y += 32;
  g.fillStyle = CHU;
  g.font = phong(18);
  g.fillText(p.tenNhanVien, LE, y);

  y += 30;
  g.strokeStyle = VIEN;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(LE, y);
  g.lineTo(RONG - LE, y);
  g.stroke();

  y += 14;
  for (const d of p.dong) {
    y += 32;
    g.fillStyle = MO;
    g.font = phong(16);
    g.fillText(d.nhan, LE, y);

    const so = (d.laTru ? "− " : "") + tienVN(d.soTien);
    g.fillStyle = d.laTru ? "#b91c1c" : CHU;
    g.font = phong(17, 500);
    const w = g.measureText(so).width;
    g.fillText(so, RONG - LE - w, y);

    y += 14;
    g.strokeStyle = "#f5f5f4";
    g.beginPath();
    g.moveTo(LE, y);
    g.lineTo(RONG - LE, y);
    g.stroke();
  }

  y += 42;
  g.fillStyle = CHU;
  g.font = phong(19, 600);
  g.fillText("Thực nhận", LE, y);
  g.fillStyle = CAM;
  g.font = phong(28, 700);
  const tn = tienVN(p.thucNhan);
  g.fillText(tn, RONG - LE - g.measureText(tn).width, y + 3);

  y += 46;
  g.fillStyle = MO;
  g.font = phong(13);
  // Chân trang có thể dài — cắt dòng theo bề ngang còn lại thay vì tràn ra ngoài.
  const rongChu = RONG - LE * 2;
  let dong = "";
  for (const tu of p.chanTrang.split(" ")) {
    const thu = dong ? `${dong} ${tu}` : tu;
    if (g.measureText(thu).width > rongChu && dong) {
      g.fillText(dong, LE, y);
      y += 20;
      dong = tu;
    } else {
      dong = thu;
    }
  }
  if (dong) g.fillText(dong, LE, y);

  return new Promise((ok) => c.toBlob((b) => ok(b), "image/png"));
}

/** Đưa ảnh cho người dùng lưu về máy. */
export function taiVeMay(blob: Blob, ten: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ten;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Nhả bộ nhớ sau khi trình duyệt kịp bắt đầu tải.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
