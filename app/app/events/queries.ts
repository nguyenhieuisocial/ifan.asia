import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAMPAIGN_LIMIT,
  CONTACT_PREVIEW_LIMIT,
  SEND_LIST_LIMIT,
  VOUCHER_LIMIT,
  type Campaign,
  type CampaignSend,
  type CampaignStatus,
  type CampaignSummary,
  type ContactConsent,
  type ConsentTally,
  type EventsData,
  type VoucherLink,
} from "./types";

/**
 * Đọc dữ liệu cho màn Sự kiện marketing (V8, migration #171).
 *
 * BA LUẬT của phần đọc này:
 *
 *  1. "Đã cho đi bao nhiêu tiền giảm" ĐẾM TỪ `voucher_redemptions`, không nuôi
 *     một ô cộng dồn riêng trên `campaigns`. Cùng lý do đã ghi ở #157: bộ đếm
 *     rời và sự thật luôn lệch nhau sau vài tháng — mà đây là con số quyết định
 *     lúc nào chiến dịch tự dừng.
 *
 *  2. BẢN TỔNG KẾT KHÔNG ĐƯỢC BỊA. `campaign_summary` chứa doanh thu, giá vốn,
 *     phần thật sự tăng thêm và số người rút đồng ý — những thứ tầng web KHÔNG
 *     tự tính được từ đây. Có dòng thì hiện, không có thì nói thẳng là chưa có,
 *     chứ không dựng một bảng "còn lại bao nhiêu" thiếu giá vốn rồi để người đọc
 *     tưởng đã trừ đủ.
 *     Từ migration #181 bảng đó ĐÃ có đường ghi (`campaign_tong_ket()`, tự chạy
 *     khi chiến dịch dừng). Luật trên KHÔNG đổi: tầng này vẫn chỉ ĐỌC, và khi
 *     bản tổng kết báo còn dòng chưa nhập giá vốn (`cogsMissingLines > 0`) thì
 *     màn hình phải gọi "còn lại" là CẬN TRÊN chứ không phải số chốt.
 *
 *  3. ĐỌC HỎNG PHẢI NÉM. Danh sách chiến dịch rỗng nghĩa là "chưa chạy đợt nào";
 *     để lỗi mạng đội lốt câu đó là dẫn người dùng tới quyết định sai.
 */
export async function layDuLieuSuKien(
  supabase: SupabaseClient,
  opts: { canManage: boolean },
): Promise<EventsData> {
  const [campaignRes, voucherRes, sendRes, summaryRes] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, name, start_at, end_at, max_discount_total_vnd, offer_note, status, stopped_at, ad_cost_vnd",
      )
      .order("end_at", { ascending: false })
      .limit(CAMPAIGN_LIMIT),
    // Lấy CẢ mã chưa gắn chiến dịch — ô "gắn mã vào chiến dịch" cần chúng.
    supabase
      .from("vouchers")
      .select("id, code, status, campaign_id, expires_at, voucher_redemptions(discount_vnd)")
      .order("created_at", { ascending: false })
      .limit(VOUCHER_LIMIT),
    // `campaign_send_recipients(count)` — đếm NGAY TRONG CSDL. Kéo cả bảng người
    // nhận về rồi đếm bằng JavaScript là tải hàng chục nghìn dòng chỉ để lấy một
    // con số.
    supabase
      .from("campaign_sends")
      .select("id, campaign_id, send_at, body, campaign_send_recipients(count)")
      .order("send_at", { ascending: false })
      .limit(SEND_LIST_LIMIT),
    // ⚠️ Từ #181 bảng này CHỈ owner/admin/manager đọc được (nó chứa giá vốn +
    // doanh thu, cùng nhóm quyền `order_line_costs`). Với nhân viên câu này trả
    // về 0 dòng KHÔNG lỗi — nên màn hình phải phân biệt "chưa có tổng kết" với
    // "bạn không được xem", xem `canManage` truyền xuống EventsView.
    supabase
      .from("campaign_summary")
      .select(
        "campaign_id, generated_at, revenue_vnd, discount_vnd, ad_cost_vnd, cogs_vnd, net_vnd, uses_count, new_customer_count, incremental_count, opt_out_count, cogs_missing_lines",
      ),
  ]);

  for (const [ten, res] of [
    ["chiến dịch", campaignRes],
    ["mã giảm giá", voucherRes],
    ["lượt gửi tin", sendRes],
    ["bản tổng kết", summaryRes],
  ] as const) {
    if (res.error) throw new Error(`Không đọc được ${ten}: ${res.error.message}`);
  }

  // Luật 1 — cộng dồn từ sổ lượt dùng, theo từng chiến dịch.
  const luotTheoChienDich = new Map<string, { uses: number; discount: number; vouchers: number }>();
  const vouchers: VoucherLink[] = [];
  for (const v of voucherRes.data ?? []) {
    vouchers.push({
      id: v.id as string,
      code: v.code as string,
      status: v.status as VoucherLink["status"],
      campaignId: (v.campaign_id as string | null) ?? null,
      expiresAt: v.expires_at as string,
    });
    const cd = v.campaign_id as string | null;
    if (!cd) continue;
    const luot = (v.voucher_redemptions ?? []) as { discount_vnd: number }[];
    const cur = luotTheoChienDich.get(cd) ?? { uses: 0, discount: 0, vouchers: 0 };
    cur.uses += luot.length;
    cur.discount += luot.reduce((s, x) => s + Number(x.discount_vnd), 0);
    cur.vouchers += 1;
    luotTheoChienDich.set(cd, cur);
  }

  const campaigns: Campaign[] = (campaignRes.data ?? []).map((c) => {
    const luot = luotTheoChienDich.get(c.id as string) ?? { uses: 0, discount: 0, vouchers: 0 };
    return {
      id: c.id as string,
      name: c.name as string,
      startAt: c.start_at as string,
      endAt: c.end_at as string,
      maxDiscountTotalVnd: Number(c.max_discount_total_vnd),
      offerNote: (c.offer_note as string | null) ?? null,
      status: c.status as CampaignStatus,
      stoppedAt: (c.stopped_at as string | null) ?? null,
      adCostVnd: Number(c.ad_cost_vnd),
      usesCount: luot.uses,
      discountGivenVnd: luot.discount,
      voucherCount: luot.vouchers,
    };
  });

  const sends: CampaignSend[] = (sendRes.data ?? []).map((s) => ({
    id: s.id as string,
    campaignId: s.campaign_id as string,
    sendAt: s.send_at as string,
    body: (s.body as string | null) ?? null,
    recipientCount: Number(
      ((s.campaign_send_recipients ?? []) as { count: number }[])[0]?.count ?? 0,
    ),
  }));

  const summaries: CampaignSummary[] = (summaryRes.data ?? []).map((s) => ({
    campaignId: s.campaign_id as string,
    generatedAt: s.generated_at as string,
    revenueVnd: Number(s.revenue_vnd),
    discountVnd: Number(s.discount_vnd),
    adCostVnd: Number(s.ad_cost_vnd),
    cogsVnd: Number(s.cogs_vnd),
    netVnd: Number(s.net_vnd),
    usesCount: Number(s.uses_count),
    newCustomerCount: Number(s.new_customer_count),
    incrementalCount: Number(s.incremental_count),
    optOutCount: Number(s.opt_out_count),
    cogsMissingLines: Number(s.cogs_missing_lines ?? 0),
  }));

  // Danh sách khách + ba con số đồng ý chỉ có nghĩa với người ĐƯỢC GỬI TIN.
  // Với nhân viên, RLS `contacts_select` chỉ trả về khách họ phụ trách — hiện ra
  // sẽ là một con số đúng-một-nửa, tệ hơn là không hiện.
  if (!opts.canManage) {
    return {
      campaigns,
      vouchers,
      sends,
      summaries,
      contacts: [],
      consentTally: { granted: 0, unknown: 0, withdrawn: 0 },
    };
  }

  const [contactRes, grantedRes, unknownRes, withdrawnRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, phone, tier, marketing_consent, marketing_last_sent_at")
      .is("deleted_at", null)
      .order("full_name")
      .limit(CONTACT_PREVIEW_LIMIT),
    demTheoDongY(supabase, "granted"),
    demTheoDongY(supabase, "unknown"),
    demTheoDongY(supabase, "withdrawn"),
  ]);
  if (contactRes.error)
    throw new Error(`Không đọc được danh sách khách: ${contactRes.error.message}`);

  const contacts: ContactConsent[] = (contactRes.data ?? []).map((c) => ({
    id: c.id as string,
    fullName: c.full_name as string,
    phone: (c.phone as string | null) ?? null,
    tier: c.tier as string,
    consent: c.marketing_consent as ContactConsent["consent"],
    lastSentAt: (c.marketing_last_sent_at as string | null) ?? null,
  }));

  const consentTally: ConsentTally = {
    granted: grantedRes,
    unknown: unknownRes,
    withdrawn: withdrawnRes,
  };

  return { campaigns, vouchers, sends, summaries, contacts, consentTally };
}

/** Đếm bằng `head: true` — chỉ lấy con số, không kéo dòng nào về. */
async function demTheoDongY(
  supabase: SupabaseClient,
  consent: "granted" | "unknown" | "withdrawn",
): Promise<number> {
  const { count, error } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("marketing_consent", consent);
  if (error) throw new Error(`Không đếm được khách "${consent}": ${error.message}`);
  return count ?? 0;
}
