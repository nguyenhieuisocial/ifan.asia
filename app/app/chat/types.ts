/**
 * Chat nội bộ RIÊNG (thẻ `man-chat-noi-bo.html` mục "Chat rời", migration #298).
 *
 * File này CỐ Ý tách khỏi `actions.ts`: file có directive `"use server"` chỉ được
 * export async function (cổng `scripts/soat-use-server-exports.mjs`), nên hằng số
 * và kiểu phải nằm ở đây.
 *
 * ⚠️ KHÁC HẲN `components/internal-chat/` — đó là GHI CHÚ GẮN VÀO VIỆC (#169),
 * bảng `internal_*`, quyền thừa hưởng từ việc, KHÔNG đếm chưa đọc. Hai mảng
 * riêng, không có đường nào nối tin từ bên này sang bên kia.
 */

/** Dùng LẠI phép dò @tên của chat gắn-vào-việc — một nguồn duy nhất, không chép. */
export { detectMentions, type ChatMember } from "@/components/internal-chat/types";

/** Cửa sổ sửa tin: 15 phút, y hệt trigger `chat_messages_sua_15_phut`. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Trần tin tải một lần — lấy MỚI NHẤT trước, cũ hơn thì báo bằng một dòng chữ. */
export const MESSAGE_LIMIT = 200;

export const MAX_BODY_LENGTH = 4000;

/** Quá số này thì badge in "99+" thay vì con số thật. */
export const BADGE_MAX = 99;

/** Ba loại kênh — trùng khít `check` của cột `chat_channels.kind` (#307). */
export type ChatKenhKind = "team" | "dm" | "topic";

/** Bộ cảm xúc bày sẵn khi rê chuột. Sáu cái, không hơn — bảng emoji đầy đủ là
 *  một màn hình riêng, và ở tiệm thì 👍 với ✅ chiếm gần hết lượt dùng. */
export const CAM_XUC_NHANH = ["👍", "✅", "❤️", "😂", "🙏", "👀"] as const;

/** Tên kênh chủ đề: chữ thường, gạch nối — cùng lối Slack, dễ gọi miệng. */
/**
  * GỌI CẢ TIỆM — một lời gọi tới mọi người đang làm.
  *
  * ⚠️ Chỉ chủ / quản trị / quản lý dùng được. Ai cũng réo được cả tiệm thì
  *   trong một tuần nó thành tiếng ồn, và lúc đó lời gọi thật cũng bị bỏ qua.
  *   Chốt ở tầng máy chủ, không chỉ ở giao diện.
  *
  * ⚠️ Nhận cả bản có dấu lẫn không dấu: người ta gõ nhanh và bàn phím điện
  *   thoại hay bỏ dấu. Nhận thiếu một cách viết nghĩa là lời gọi rơi im lặng.
  */
export const GOI_CA_TIEM = ["@cả-tiệm", "@ca-tiem", "@cả tiệm", "@everyone", "@all"] as const;

export function coGoiCaTiem(body: string): boolean {
  const thuong = body.toLowerCase();
  return GOI_CA_TIEM.some((x) => thuong.includes(x));
}

export const MAX_TEN_KENH = 40;
export function chuanHoaTenKenh(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TEN_KENH);
}

export type ChatKenh = {
  id: string;
  kind: ChatKenhKind;
  /** Người CÒN LẠI của kênh riêng — null với kênh cả tiệm. */
  doiPhuongUserId: string | null;
  /** Tên hiển thị đã dựng sẵn ở máy chủ; kênh cả tiệm để null (giao diện tự dịch). */
  doiPhuongTen: string | null;
  soChuaDoc: number;
  /** Mốc tin gần nhất — để xếp kênh nào có chuyện mới lên trên. */
  tinCuoiLuc: string | null;
  /** Kênh chủ đề: tên (#le-tan) và mô tả. Kênh cả tiệm và kênh riêng để null. */
  ten: string | null;
  moTa: string | null;
  /**
   * Kênh HẠN CHẾ — chỉ thành viên vào được.
   * ⚠️ CỐ Ý không gọi là "riêng tư": chủ tiệm LUÔN đọc được (migration #307),
   * và màn hình phải nói thẳng điều đó. Một cái nhãn hứa nhiều hơn sự thật còn
   * tệ hơn việc không có tính năng.
   */
  hanChe: boolean;
  /** Mức thông báo CỦA MÌNH cho kênh này. Không có dòng trong CSDL = "all". */
  mucBao: MucBao;
};

export type ChatCamXuc = {
  emoji: string;
  /** Bao nhiêu người đã thả. */
  soNguoi: number;
  /** Chính mình đã thả chưa — để tô đậm và để bấm lần nữa là gỡ. */
  toiDaTha: boolean;
};

export type ChatTin = {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  /** Tin gốc của luồng — null nghĩa là tin nằm thẳng trong kênh. */
  parentId: string | null;
  /** Chỉ có ở tin GỐC: đếm câu trả lời trong luồng và mốc trả lời mới nhất. */
  soTraLoi: number;
  traLoiCuoiLuc: string | null;
  camXuc: ChatCamXuc[];
  /** Ghim — CHO CẢ KÊNH. Ai cũng ghim và gỡ được (trừ vai Chỉ xem). */
  ghimLuc: string | null;
  /** Để đọc sau — RIÊNG mình. Khác hẳn ghim; chủ tiệm cũng không thấy. */
  daLuu: boolean;
};

/**
 * Mức thông báo của MỘT người cho MỘT kênh.
 *
 * ⚠️ Không có dòng nào trong cơ sở dữ liệu = `all`. Mặc định phải là NHẬN ĐỦ:
 *   người chưa từng chỉnh mà tự nhiên không nhận tin là lỗi im lặng tệ nhất
 *   của mảng thông báo — họ sẽ tưởng tiệm không ai nhắn gì.
 */
export const MUC_BAO = ["all", "mentions", "off"] as const;
export type MucBao = (typeof MUC_BAO)[number];

/** Một dòng trong hộp "Nhắc tới tôi" / "Để đọc sau". */
export type ChatTinTimThay = {
  id: string;
  channelId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  /** Tên kênh dựng sẵn ở máy chủ — hộp gom tin vắt qua nhiều kênh. */
  tenKenh: string | null;
  kenhKind: ChatKenhKind;
  doiPhuongUserId: string | null;
};

/**
 * Ngày của một mốc thời gian theo múi giờ tiệm — dùng để chèn mốc ngày giữa
 * dòng tin.
 *
 * ⚠️ KHÔNG dùng `toISOString().slice(0,10)`: nó cho ra ngày theo giờ UTC, nên
 *   từ 0h đến 7h giờ Việt Nam mọi tin đều bị xếp vào "hôm qua". Đúng loại lỗi
 *   đã cắn mặt tiền ngày 12/08.
 */
export function ngayCuaTin(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export type ChatTinLoad = {
  error: string | null;
  messages: ChatTin[];
  /** Chạm trần MESSAGE_LIMIT ⇒ còn tin cũ hơn không nằm trong danh sách này. */
  atLimit: boolean;
};

/**
 * Xếp kênh: cả tiệm luôn đứng đầu (ai cũng ở trong đó), rồi tới kênh có tin mới
 * nhất. KHÔNG xếp theo số chưa đọc — như vậy thì mỗi lần đọc xong một cuộc là cả
 * danh sách nhảy chỗ, người dùng mất dấu cuộc mình vừa xem.
 */
const THU_TU: Record<ChatKenhKind, number> = { team: 0, topic: 1, dm: 2 };

export function xepKenh(ds: ChatKenh[]): ChatKenh[] {
  return [...ds].sort((a, b) => {
    if (a.kind !== b.kind) return THU_TU[a.kind] - THU_TU[b.kind];
    // Kênh chủ đề xếp theo TÊN, không theo tin mới: danh sách kênh phải đứng
    // yên để người ta nhớ được vị trí. Kênh riêng thì ngược lại — ai vừa nhắn
    // thì lên trên.
    if (a.kind === "topic") return (a.ten ?? "").localeCompare(b.ten ?? "");
    const ta = a.tinCuoiLuc ?? "";
    const tb = b.tinCuoiLuc ?? "";
    if (ta !== tb) return tb.localeCompare(ta);
    return (a.doiPhuongTen ?? "").localeCompare(b.doiPhuongTen ?? "");
  });
}
