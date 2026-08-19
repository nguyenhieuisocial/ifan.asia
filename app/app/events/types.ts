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
  incrementalCount: number;
  optOutCount: number;
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
