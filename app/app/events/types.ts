/**
 * Kiểu + hằng số dùng chung cho màn Sự kiện marketing (V8, migration #171).
 *
 * Tách khỏi `actions.ts` vì file đó mang directive "use server" — chỉ được
 * export async function (cổng `scripts/soat-use-server-exports.mjs`).
 */

export const CAMPAIGN_STATUSES = ["draft", "running", "stopped", "ended"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * Tệp khách được chọn để gửi tin.
 *
 * `all` + 4 bậc khách của `contacts.tier`. CỐ Ý không có ô "gõ tay danh sách":
 * mọi tệp đều đi qua đúng một hàm dựng tệp ở tầng máy chủ, nên phần xem trước và
 * phần gửi thật không bao giờ đếm trên hai tập khác nhau.
 */
export const SEND_SCOPES = ["all", "new", "regular", "vip", "dormant"] as const;
export type SendScope = (typeof SEND_SCOPES)[number];

export const CAMPAIGN_LIMIT = 100;
export const VOUCHER_LIMIT = 200;
export const SEND_LIST_LIMIT = 50;
/**
 * Trần số người nhận trong MỘT đợt gửi. Không phải giới hạn kỹ thuật mà là
 * hàng rào: một cú bấm nhầm không được phép chạm vào cả chục nghìn người.
 * Chạm trần thì màn hình nói ra (xem `scope.limitNote`).
 */
export const SEND_RECIPIENT_LIMIT = 500;
/** Số dòng khách hiện ra để soi trạng thái đồng ý — không phải trần gửi. */
export const CONTACT_PREVIEW_LIMIT = 100;

export type Campaign = {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  maxDiscountTotalVnd: number;
  offerNote: string | null;
  status: CampaignStatus;
  stoppedAt: string | null;
  adCostVnd: number;
  /** Đếm từ `voucher_redemptions`, KHÔNG nuôi bộ đếm rời (bộ đếm rời luôn lệch). */
  usesCount: number;
  discountGivenVnd: number;
  voucherCount: number;
};

export type VoucherLink = {
  id: string;
  code: string;
  status: "active" | "paused";
  campaignId: string | null;
  expiresAt: string;
};

export type CampaignSend = {
  id: string;
  campaignId: string;
  sendAt: string;
  body: string | null;
  recipientCount: number;
};

/** Bản tổng kết — chỉ có khi ai đó đã sinh ra nó; KHÔNG tự bịa ở tầng web. */
export type CampaignSummary = {
  campaignId: string;
  generatedAt: string;
  revenueVnd: number;
  discountVnd: number;
  adCostVnd: number;
  cogsVnd: number;
  netVnd: number;
  usesCount: number;
  newCustomerCount: number;
  optOutCount: number;
  /**
   * Số người ĐÃ NHẬN tin của chính chiến dịch này (đếm theo người, không theo
   * lượt gửi), và trong số đó bao nhiêu người có đơn hoàn tất SAU khi nhận.
   *
   * Hai cột này (migration #293) thay cho `incrementalCount` đã bị xoá. Cột cũ
   * lấy "đơn cả tiệm kỳ này − đơn cả tiệm kỳ trước" rồi để màn hình gọi nó là
   * "lượt tăng thêm NHỜ ưu đãi" — đo được trên dữ liệu thật: một chiến dịch
   * 0 lượt dùng mã, 0đ doanh thu vẫn hiện 3.325 "lượt tăng thêm".
   *
   * ⚠️ Hai số này KHÔNG phải quan hệ nhân quả: "đã mua sau khi nhận tin" không
   * chứng minh người đó mua VÌ nhận tin (muốn vậy phải có nhóm đối chứng, kho
   * này chưa có). Câu chữ trên màn hình phải dừng đúng ở chỗ nó đo được.
   */
  recipientsCount: number;
  recipientsOrderedCount: number;
  /**
   * Số dòng hàng của chiến dịch CHƯA từng nhập giá vốn (migration #181).
   * > 0 nghĩa là `cogsVnd` còn thiếu ⇒ `netVnd` là CẬN TRÊN, không phải số thật.
   * Màn hình PHẢI nói ra: một con số "còn lại" thiếu giá vốn nhìn giống hệt một
   * con số đủ, và nó lệch đúng chiều làm chủ tiệm tưởng đợt ưu đãi có lãi.
   */
  cogsMissingLines: number;
};

export type ContactConsent = {
  id: string;
  fullName: string;
  phone: string | null;
  tier: string;
  consent: "unknown" | "granted" | "withdrawn";
  lastSentAt: string | null;
};

/** Ba con số ở đầu màn: cả tiệm đang ở đâu về chuyện đồng ý nhận tin. */
export type ConsentTally = {
  granted: number;
  unknown: number;
  withdrawn: number;
};

/**
 * Bảng trừ của thẻ design — ĐÚNG bốn dòng, cùng khuôn với jsonb mà RPC
 * `campaign_send_add_recipients` trả về.
 *
 * Người dùng phải thấy bảng này TRƯỚC khi bấm gửi. Gửi xong lại hiện đúng bảng
 * này với số THẬT từ RPC: nếu hai bên lệch nhau (có người vừa rút đồng ý giữa
 * hai lần bấm) thì người dùng nhìn thấy chuyện đó, không bị giấu.
 */
export type SendBreakdown = {
  tepChon: number;
  truChuaDongY: number;
  truDaRut: number;
  truGanDay: number;
  thatSuGui: number;
  /** true = tệp khách đã chạm trần `SEND_RECIPIENT_LIMIT`, còn người bị cắt. */
  chamTran: boolean;
};

export type EventsData = {
  campaigns: Campaign[];
  vouchers: VoucherLink[];
  sends: CampaignSend[];
  summaries: CampaignSummary[];
  contacts: ContactConsent[];
  consentTally: ConsentTally;
};
