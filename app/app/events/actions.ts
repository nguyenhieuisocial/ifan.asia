"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SEND_RECIPIENT_LIMIT, type SendBreakdown, type SendScope } from "./types";

/**
 * Màn Sự kiện marketing (V8, migration #171).
 *
 * LUẬT QUAN TRỌNG NHẤT CỦA CẢ FILE: MẶC ĐỊNH LÀ KHÔNG GỬI.
 * Khách "chưa hỏi ý kiến" (`marketing_consent = 'unknown'`) là KHÔNG gửi — không
 * phải "chưa cấm thì gửi". Ba phép trừ (chưa đồng ý · đã rút · vừa nhận tin
 * trong 7 ngày) được CSDL chặn cứng bằng trigger `campaign_recipient_guard`;
 * việc của tầng này là cho người bấm THẤY TRƯỚC ba con số đó, để họ không tưởng
 * máy hỏng khi tệp 1.284 người chỉ còn 827.
 *
 * BẪY tenant_id: `campaigns` và `campaign_sends` có `tenant_id` NOT NULL không
 * default — RLS `with check` chỉ chặn SAI tiệm, không tự điền tiệm ĐÚNG.
 */

export type KetQua = { error: string | null };
export type KetQuaXemTruoc =
  | { error: null; bang: SendBreakdown }
  | { error: string; bang?: undefined };
export type KetQuaGui =
  | { error: null; bang: SendBreakdown }
  | { error: string; bang?: undefined };

const BAY_NGAY_MS = 7 * 24 * 60 * 60 * 1000;

async function boiCanh() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return null;
  return { supabase, userId: user.id, tenantId: tenant.id as string };
}

/**
 * Lỗi Postgres → khoá dịch. Mỗi khoá PHẢI có trong `messages/vi.json` và
 * `messages/en.json` nhánh `events.errors`.
 */
function loiGhi(message: string): string {
  // Trigger `campaign_send_khung_gio_guard`: 21h–8h là không gửi, KỂ CẢ khi chủ
  // tiệm bấm gửi. Đây là lỗi người dùng sẽ gặp thật, không phải lỗi hiếm.
  if (/ngoai_khung_gio_gui/i.test(message)) return "ngoai_khung_gio";
  if (/khach_da_rut_dong_y/i.test(message)) return "khach_da_rut";
  if (/khach_chua_dong_y_nhan_tin/i.test(message)) return "khach_chua_dong_y";
  if (/vua_nhan_tin_trong_7_ngay/i.test(message)) return "vua_nhan_tin";
  if (/campaigns_ngay_hop_le/i.test(message)) return "ngay_ket_thuc_truoc_ngay_bat_dau";
  if (/max_discount_total_vnd/i.test(message)) return "thieu_tran_tien";
  if (/contacts_moc_rut_bat_buoc/i.test(message)) return "loi_ky_thuat";
  if (/row-level security/i.test(message)) return "khong_du_quyen";
  if (/forbidden/i.test(message)) return "khong_du_quyen";
  if (/send_not_found/i.test(message)) return "khong_thay_dot_gui";
  if (/no_tenant_context/i.test(message)) return "no_tenant";
  return "chua_luu_duoc";
}

// ════════════════════════════════════════════════════════════════════
// CHIẾN DỊCH
// ════════════════════════════════════════════════════════════════════

const chienDichSchema = z
  .object({
    name: z.string().trim().min(1, "thieu_ten").max(160, "ten_qua_dai"),
    startAt: z.string().min(1, "thieu_ngay_bat_dau"),
    // Bắt buộc, không có nhánh "để trống": chiến dịch vô thời hạn là một bảng
    // giá mới mà không ai nhận ra (quyết định 3 của thẻ design).
    endAt: z.string().min(1, "thieu_ngay_ket_thuc"),
    // Bắt buộc: bỏ trống trần = cho đi tiền không đáy.
    maxDiscountTotalVnd: z.number().int().min(1, "thieu_tran_tien"),
    adCostVnd: z.number().int().min(0),
    offerNote: z.string().trim().max(500).nullable(),
  })
  .refine((v) => new Date(v.endAt).getTime() > new Date(v.startAt).getTime(), {
    message: "ngay_ket_thuc_truoc_ngay_bat_dau",
  });

export async function taoChienDich(input: z.infer<typeof chienDichSchema>): Promise<KetQua> {
  const parsed = chienDichSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const d = parsed.data;
  const { error } = await ctx.supabase.from("campaigns").insert({
    tenant_id: ctx.tenantId,
    name: d.name,
    start_at: d.startAt,
    end_at: d.endAt,
    max_discount_total_vnd: d.maxDiscountTotalVnd,
    ad_cost_vnd: d.adCostVnd,
    offer_note: d.offerNote,
    created_by: ctx.userId,
  });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/events");
  return { error: null };
}

/**
 * Đổi trạng thái chiến dịch. CHỈ nhận 'running' và 'ended'.
 *
 * 'stopped' KHÔNG có ở đây, cố ý: đó là trạng thái do MÁY đặt khi chạm trần
 * tiền giảm (trigger `campaign_tran_tu_dung`). Cho người gõ tay vào 'stopped'
 * là làm mờ ranh giới giữa "máy tự dừng vì hết tiền" và "người chủ động dừng" —
 * hai chuyện khác hẳn nhau khi nhìn lại sau này.
 */
export async function doiTrangThaiChienDich(
  id: string,
  status: "running" | "ended",
): Promise<KetQua> {
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(["running", "ended"]) })
    .safeParse({ id, status });
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data, error } = await ctx.supabase
    .from("campaigns")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // RLS chặn UPDATE thì không có lỗi, chỉ 0 dòng — không tự nhận ra là báo
  // "đã lưu" trong khi chưa lưu gì.
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

  revalidatePath("/app/events");
  return { error: null };
}

/**
 * Tiền quảng cáo đã tiêu — số NHẬP TAY.
 * iFan không mua quảng cáo hộ và không nối vào ví quảng cáo nào (thẻ design,
 * mục "Cái iFan KHÔNG làm"); ghi lại chỉ để tính được "còn lại bao nhiêu".
 */
export async function capNhatChiPhiQuangCao(id: string, adCostVnd: number): Promise<KetQua> {
  const parsed = z
    .object({ id: z.uuid(), adCostVnd: z.number().int().min(0, "chi_phi_am") })
    .safeParse({ id, adCostVnd });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data, error } = await ctx.supabase
    .from("campaigns")
    .update({ ad_cost_vnd: parsed.data.adCostVnd })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

  revalidatePath("/app/events");
  return { error: null };
}

/**
 * Gắn / gỡ một mã giảm giá khỏi chiến dịch.
 *
 * Đây là sợi dây duy nhất làm trần tiền giảm có tác dụng: trigger tự dừng cộng
 * dồn theo `vouchers.campaign_id`. Chiến dịch không có mã nào gắn vào thì trần
 * không bao giờ chạm, và "tự dừng" không dừng được gì.
 */
export async function ganMaVaoChienDich(
  voucherId: string,
  campaignId: string | null,
): Promise<KetQua> {
  const parsed = z
    .object({ voucherId: z.uuid(), campaignId: z.uuid().nullable() })
    .safeParse({ voucherId, campaignId });
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data, error } = await ctx.supabase
    .from("vouchers")
    .update({ campaign_id: parsed.data.campaignId })
    .eq("id", parsed.data.voucherId)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

  revalidatePath("/app/events");
  return { error: null };
}

// ════════════════════════════════════════════════════════════════════
// ĐỒNG Ý NHẬN TIN
// ════════════════════════════════════════════════════════════════════

/**
 * Ghi nhận việc khách đã ĐỒNG Ý hoặc đã RÚT đồng ý nhận tin.
 *
 * KHÔNG có đường quay về 'unknown': "chưa hỏi ai" là trạng thái ban đầu, quay
 * ngược về đó là xoá mất bằng chứng đã hỏi — mà Nghị định 13 đòi chứng minh
 * được. Rút đồng ý luôn kèm mốc thời gian (check constraint của CSDL cũng đòi).
 */
export async function ghiNhanDongY(
  contactId: string,
  consent: "granted" | "withdrawn",
): Promise<KetQua> {
  const parsed = z
    .object({ contactId: z.uuid(), consent: z.enum(["granted", "withdrawn"]) })
    .safeParse({ contactId, consent });
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const now = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("contacts")
    .update(
      parsed.data.consent === "granted"
        ? { marketing_consent: "granted", marketing_consent_at: now }
        : { marketing_consent: "withdrawn", marketing_consent_withdrawn_at: now },
    )
    .eq("id", parsed.data.contactId)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

  revalidatePath("/app/events");
  return { error: null };
}

// ════════════════════════════════════════════════════════════════════
// GỬI TIN — xem trước rồi mới gửi
// ════════════════════════════════════════════════════════════════════

type KhachTrongTep = {
  id: string;
  consent: string;
  lastSentAt: string | null;
};

/**
 * Dựng tệp khách theo bậc. MỘT bản cài đặt duy nhất, dùng chung cho cả bước xem
 * trước lẫn bước gửi thật — hai bản riêng là hai tập khách khác nhau, và bảng
 * trừ người dùng nhìn thấy sẽ không phải bảng thật sự được áp dụng.
 */
async function layTepKhach(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: SendScope,
): Promise<{ rows: KhachTrongTep[]; chamTran: boolean }> {
  let q = supabase
    .from("contacts")
    .select("id, marketing_consent, marketing_last_sent_at")
    .is("deleted_at", null);
  if (scope !== "all") q = q.eq("tier", scope);

  // Lấy dư 1 dòng để biết tệp có bị cắt hay không — cắt mà im lặng thì người
  // dùng tưởng tiệm chỉ có ngần ấy khách.
  const { data, error } = await q.limit(SEND_RECIPIENT_LIMIT + 1);
  if (error) throw new Error(error.message);

  const all = (data ?? []).map((c) => ({
    id: c.id as string,
    consent: c.marketing_consent as string,
    lastSentAt: (c.marketing_last_sent_at as string | null) ?? null,
  }));
  return { rows: all.slice(0, SEND_RECIPIENT_LIMIT), chamTran: all.length > SEND_RECIPIENT_LIMIT };
}

/**
 * Ba phép trừ, tính đúng như trigger `campaign_recipient_guard` và RPC
 * `campaign_send_add_recipients` (migration #171). Đây là bảng NGƯỜI DÙNG NHÌN
 * THẤY TRƯỚC KHI BẤM; chốt chặn thật vẫn nằm ở CSDL.
 */
function tinhBangTru(rows: KhachTrongTep[], chamTran: boolean): SendBreakdown {
  const moc = Date.now() - BAY_NGAY_MS;
  const truChuaDongY = rows.filter((r) => r.consent === "unknown").length;
  const truDaRut = rows.filter((r) => r.consent === "withdrawn").length;
  const truGanDay = rows.filter(
    (r) => r.consent === "granted" && r.lastSentAt !== null && Date.parse(r.lastSentAt) > moc,
  ).length;
  return {
    tepChon: rows.length,
    truChuaDongY,
    truDaRut,
    truGanDay,
    thatSuGui: rows.length - truChuaDongY - truDaRut - truGanDay,
    chamTran,
  };
}

export async function xemTruocGuiTin(scope: string): Promise<KetQuaXemTruoc> {
  const parsed = z.enum(["all", "new", "regular", "vip", "dormant"]).safeParse(scope);
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  try {
    const { rows, chamTran } = await layTepKhach(ctx.supabase, parsed.data);
    return { error: null, bang: tinhBangTru(rows, chamTran) };
  } catch (e) {
    return { error: loiGhi(e instanceof Error ? e.message : "") };
  }
}

const guiSchema = z.object({
  campaignId: z.uuid(),
  scope: z.enum(["all", "new", "regular", "vip", "dormant"]),
  body: z.string().trim().max(1000).nullable(),
});

/**
 * Gửi tin thật.
 *
 * Trả về bảng trừ do RPC tính — số THẬT, không phải số ước lượng lúc xem trước.
 * Hai bảng lệch nhau là chuyện có thể xảy ra (ai đó vừa rút đồng ý giữa hai lần
 * bấm) và người dùng phải nhìn thấy chuyện đó chứ không bị giấu đi.
 */
export async function guiTin(input: z.infer<typeof guiSchema>): Promise<KetQuaGui> {
  const parsed = guiSchema.safeParse(input);
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  let tep: { rows: KhachTrongTep[]; chamTran: boolean };
  try {
    tep = await layTepKhach(ctx.supabase, parsed.data.scope);
  } catch (e) {
    return { error: loiGhi(e instanceof Error ? e.message : "") };
  }
  if (tep.rows.length === 0) return { error: "tep_khach_rong" };

  // Trigger `campaign_sends_khung_gio` chặn ở ĐÂY nếu đang là 21h–8h giờ tiệm.
  const { data: send, error: sendError } = await ctx.supabase
    .from("campaign_sends")
    .insert({
      tenant_id: ctx.tenantId,
      campaign_id: parsed.data.campaignId,
      body: parsed.data.body,
      created_by: ctx.userId,
    })
    .select("id")
    .maybeSingle();
  if (sendError) return { error: loiGhi(sendError.message) };
  if (!send) return { error: "khong_du_quyen" };

  const { data: ketQua, error: rpcError } = await ctx.supabase.rpc(
    "campaign_send_add_recipients",
    { p_send_id: send.id, p_contact_ids: tep.rows.map((r) => r.id) },
  );
  if (rpcError) {
    // Đợt gửi rỗng nằm lại trong sổ = một dòng "đã gửi tin" mà không ai nhận —
    // sau này đọc lại không hiểu chuyện gì đã xảy ra. Dọn ngay.
    await ctx.supabase.from("campaign_sends").delete().eq("id", send.id);
    return { error: loiGhi(rpcError.message) };
  }

  const k = (ketQua ?? {}) as Record<string, number>;
  revalidatePath("/app/events");
  return {
    error: null,
    bang: {
      tepChon: Number(k.tep_chon ?? 0),
      truChuaDongY: Number(k.tru_chua_dong_y ?? 0),
      truDaRut: Number(k.tru_da_rut ?? 0),
      truGanDay: Number(k.tru_gan_day ?? 0),
      thatSuGui: Number(k.that_su_gui ?? 0),
      chamTran: tep.chamTran,
    },
  };
}
