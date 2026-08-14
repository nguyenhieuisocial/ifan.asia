/**
 * Bảng quyền lệnh bot Telegram — MỘT nguồn sự thật duy nhất cho cả việc CHẶN
 * lệnh lẫn việc DỰNG bảng /help (ADR-0017, task #135).
 *
 * Sinh ra sau BA lỗ quyền liên tiếp trong một đêm (13-14/08): migration #119,
 * #121, và lệnh /trangthai lộ số liệu kinh doanh mật. Lỗ thứ ba đáng sợ hơn
 * hai lỗ kia — nó KHÔNG phải quên gõ một dòng. Bảng /help (viết tay, tách
 * rời) CŨNG quảng cáo /trangthai là lệnh công khai, tức mã và tài liệu đồng
 * thuận SAI — soát mắt không bắt được vì cả hai xác nhận lẫn nhau.
 *
 * TỆP NÀY PHẢI THUẦN — không nhập Next/Supabase/bất kỳ thứ gì cần môi trường
 * chạy. Lý do: scripts/quyen-lenh-smoke.mjs (Node thuần, không build) phải
 * import thẳng được để kiểm mà không cần dựng cả ứng dụng.
 */

export const BANG_LENH = {
  "/trangthai": {
    chiChuDuAn: true,
    moTa: "số liệu thật: tiệm, khách, yêu cầu chờ (không giới hạn lượt)",
  },
  "/lienket": {
    chiChuDuAn: false,
    moTa: "nối Telegram này với tài khoản iFan (lấy mã ở Cài đặt → Tài khoản)",
  },
  "/chude": {
    chiChuDuAn: false,
    moTa: "chủ đề này hỏi được gì, và có những chủ đề nào",
  },
  "/nhatky": {
    chiChuDuAn: true,
    moTa: "ai đang dùng bot (chỉ chủ dự án)",
  },
  "/phamvi": {
    chiChuDuAn: true,
    moTa: "đặt phạm vi cho chủ đề đang mở (chỉ chủ dự án)",
  },
  "/moi": {
    chiChuDuAn: false,
    moTa: "quên mạch chuyện cũ, bắt đầu lại từ đầu",
  },
  "/help": {
    chiChuDuAn: false,
    moTa: "bảng lệnh này",
  },
} as const;

/**
 * Tên lệnh SUY RA TỪ khoá của bảng — đây là điểm đáng giá nhất của thiết kế.
 * Route dùng kiểu này (không phải `string`) để so khớp lệnh, nên thêm một
 * nhánh xử lý cho lệnh CHƯA khai trong BANG_LENH sẽ là lỗi lúc kiểm kiểu
 * (`command === "/lenh-moi"` khi "/lenh-moi" không nằm trong TenLenh → TS báo
 * "so sánh không thể đúng"), tức KHÔNG THỂ quên đặt chốt — không còn phải
 * trông cậy vào trí nhớ ở lớp bảo mật.
 */
export type TenLenh = keyof typeof BANG_LENH;

/**
 * Bí danh gõ tắt → tên CHUẨN trong BANG_LENH. Không đứng trong bảng — chỉ là
 * lối tắt bàn phím, không phải một lệnh có quyền riêng.
 */
const BI_DANH: Record<string, TenLenh> = {
  "/link": "/lienket",
  "/reset": "/moi",
  "/start": "/help",
};

/**
 * Chuẩn hoá chữ đã gõ (sau khi tách khỏi "@tenbot" và chuyển thường) thành
 * tên lệnh CHUẨN. Trả `null` nếu không phải lệnh nào đã khai trong bảng —
 * ĐÂY LÀ MẶC ĐỊNH TỪ CHỐI: chữ lạ không tự nhiên trở thành một lệnh.
 */
export function chuanHoaLenh(raw: string): TenLenh | null {
  const chuan = BI_DANH[raw] ?? raw;
  return (Object.hasOwn(BANG_LENH, chuan) ? chuan : null) as TenLenh | null;
}

/**
 * Người này có được gọi lệnh này không.
 *
 * Mặc định TỪ CHỐI theo hai lớp: lệnh không nằm trong bảng thì `chuanHoaLenh`
 * đã trả `null` từ trước (route không gọi được `duocGoi` với nó); còn lệnh CÓ
 * trong bảng mà đánh dấu `chiChuDuAn` thì chỉ chủ dự án mới qua được.
 */
export function duocGoi(lenh: TenLenh, laChuDuAn: boolean): boolean {
  return !BANG_LENH[lenh].chiChuDuAn || laChuDuAn;
}

/**
 * Dựng danh sách lệnh cho bảng /help TỪ CHÍNH BANG_LENH — một nguồn sự thật
 * duy nhất cho cả việc chặn lẫn việc quảng cáo. Người thường KHÔNG được thấy
 * tên lệnh chỉ dành cho chủ dự án (GIẤU, không khoe kèm ghi chú "chỉ chủ dự
 * án" — nói vậy là xác nhận có lệnh đó và mời người ta dò tiếp, đúng ý định
 * đã ghi ở /nhatky trước khi có bảng này).
 */
export function danhSachLenh(laChuDuAn: boolean): string {
  return (Object.entries(BANG_LENH) as [TenLenh, (typeof BANG_LENH)[TenLenh]][])
    .filter(([, m]) => !m.chiChuDuAn || laChuDuAn)
    .map(([ten, m]) => `${ten} — ${m.moTa}`)
    .join("\n");
}
