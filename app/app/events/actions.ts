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
  | { error: null; bang: SendBreakdown; dsGui: { name: string; phone: string | null }[] }
  | { error: string; bang?: undefined; dsGui?: undefined };

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
  // `campaign_tong_ket_yeu_cau` (#181) dùng chung một lỗi cho "không có chiến
  // dịch đó" và "chiến dịch của tiệm khác" — cố ý, không xác nhận hộ sự tồn tại.
  if (/campaign_not_found/i.test(message)) return "khong_thay_chien_dich";
  if (/no_tenant_context/i.test(message)) return "no_tenant";
  return "chua_luu_duoc";
}

// ════════════════════════════════════════════════════════════════════
// CHIẾN DỊCH
// ════════════════════════════════════════════════════════════════════

const chienDichFields = z
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
  });

const chienDichSchema = chienDichFields.refine(
  (v) => new Date(v.endAt).getTime() > new Date(v.startAt).getTime(),
  { message: "ngay_ket_thuc_truoc_ngay_bat_dau" },
);

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
 * Sửa một chiến dịch đã tạo.
 *
 * ═══════════════════════════════════════════════════════════════════
 * TRƯỜNG NÀO CÒN SỬA ĐƯỢC SAU KHI CHIẾN DỊCH ĐÃ CHẠY
 * ═══════════════════════════════════════════════════════════════════
 * ĐO trước khi chốt (19/08, đọc thẳng thân trigger + hàm trong CSDL):
 *
 *  · `max_discount_total_vnd` được trigger `campaign_tran_tu_dung` đọc LẠI ở
 *    MỖI lượt dùng mã và so với tổng đã cho đi. Nó KHÔNG bị đóng băng vào lượt
 *    nào cả ⇒ đây là một cái VAN ĐANG MỞ, không phải một điều khoản lịch sử.
 *    Sửa được là bắt buộc: đặt sai trần thì hoặc chiến dịch không bao giờ tự
 *    dừng, hoặc dừng ngay khi chưa kịp chạy.
 *  · `start_at` thì ngược lại: `campaign_tong_ket` dùng nó để định nghĩa "khách
 *    mới" (khách không có đơn hoàn tất nào TRƯỚC mốc đó) và độ dài kỳ so nền.
 *    Lùi ngày bắt đầu về trước là XẾP LOẠI LẠI QUÁ KHỨ — khách đang được đếm là
 *    mới bỗng thành khách cũ, và ngày trên thẻ không còn là ngày đợt thật sự
 *    chạy. Không có lý do xuôi chiều nào để dời một ngày bắt đầu đã qua.
 *  · `end_at` sửa được: kéo dài một đợt đang chạy là việc bình thường, và bản
 *    tổng kết vốn đã là thứ TÍNH LẠI ĐƯỢC (có nút tính lại, có mốc `generated_at`).
 *  · `name` · `offer_note` · `ad_cost_vnd` chỉ để đọc, không tham gia phép tính
 *    nào ⇒ luôn sửa được.
 *
 * ⚠️ Trường bị khoá KHÔNG được đưa vào câu ghi — chặn ở màn hình là chưa đủ.
 */
export async function suaChienDich(
  id: string,
  input: z.infer<typeof chienDichFields>,
): Promise<KetQua> {
  const idParsed = z.uuid().safeParse(id);
  if (!idParsed.success) return { error: "du_lieu_khong_hop_le" };
  const parsed = chienDichFields.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { data: cu, error: docError } = await ctx.supabase
    .from("campaigns")
    .select("status, start_at, max_discount_total_vnd")
    .eq("id", idParsed.data)
    .maybeSingle();
  if (docError) return { error: loiGhi(docError.message) };
  if (!cu) return { error: "khong_thay_chien_dich" };

  // Đã cho đi bao nhiêu — cộng TỪ SỔ lượt dùng, đúng luật 1 của `queries.ts`.
  const [{ data: mas, error: maError }, { count: soDotGui, error: guiError }] = await Promise.all([
    ctx.supabase
      .from("vouchers")
      .select("voucher_redemptions(discount_vnd)")
      .eq("campaign_id", idParsed.data),
    ctx.supabase
      .from("campaign_sends")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", idParsed.data),
  ]);
  if (maError) return { error: loiGhi(maError.message) };
  if (guiError) return { error: loiGhi(guiError.message) };

  let daChoDi = 0;
  let soLuot = 0;
  for (const m of mas ?? []) {
    for (const r of (m.voucher_redemptions ?? []) as { discount_vnd: number }[]) {
      daChoDi += Number(r.discount_vnd);
      soLuot += 1;
    }
  }

  // "Đã phát sinh" = đã rời khỏi nháp, HOẶC đã có lượt dùng mã, HOẶC đã gửi tin.
  // Ba vế, không phải một: mã gắn vào một chiến dịch còn NHÁP vẫn dùng được
  // (`voucher_check` không đọc trạng thái chiến dịch) và `guiTin` cũng không đòi
  // chiến dịch phải đang chạy — nên "còn nháp" một mình không chứng minh được là
  // chưa có gì xảy ra.
  const daPhatSinh = cu.status !== "draft" || soLuot > 0 || (soDotGui ?? 0) > 0;

  const d = parsed.data;
  const batDau = daPhatSinh ? (cu.start_at as string) : d.startAt;
  if (new Date(d.endAt).getTime() <= new Date(batDau).getTime()) {
    return { error: "ngay_ket_thuc_truoc_ngay_bat_dau" };
  }

  // Chỉ soát khi trần THẬT SỰ đổi: một chiến dịch máy đã tự dừng thì đã cho đi
  // ≥ trần theo đúng định nghĩa, soát vô điều kiện sẽ chặn cả việc đổi mỗi cái tên.
  const tranCu = Number(cu.max_discount_total_vnd);
  if (d.maxDiscountTotalVnd !== tranCu && d.maxDiscountTotalVnd <= daChoDi) {
    // Đặt trần bằng hoặc thấp hơn số đã cho đi tạo ra một chỗ mù: trigger tự
    // dừng chỉ chạy khi có lượt dùng MỚI, nên chiến dịch sẽ hiện "đang chạy" mà
    // đã vượt trần, cho tới lượt kế tiếp. Muốn dừng ngay thì có nút Kết thúc.
    return { error: "tran_thap_hon_da_cho" };
  }

  const patch: Record<string, unknown> = {
    name: d.name,
    end_at: d.endAt,
    max_discount_total_vnd: d.maxDiscountTotalVnd,
    ad_cost_vnd: d.adCostVnd,
    offer_note: d.offerNote,
  };
  if (!daPhatSinh) patch.start_at = d.startAt;

  const { data, error } = await ctx.supabase
    .from("campaigns")
    .update(patch)
    .eq("id", idParsed.data)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // RLS chặn thì 0 dòng và KHÔNG có lỗi — im lặng y hệt lúc thành công.
  if (!data || data.length === 0) return { error: "khong_du_quyen" };

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
 * Tính (hoặc tính lại) bản tổng kết của một chiến dịch — migration #181.
 *
 * Đường CHÍNH là tự động: chiến dịch dừng ('ended' do người chốt, 'stopped' do
 * máy chạm trần) thì trigger `campaigns_tu_tong_ket` tự tính. Nút này dành cho
 * hai việc còn lại: xem giữa chừng khi đợt đang chạy, và tính lại sau khi vừa
 * sửa tiền quảng cáo (số đó nhập tay nên đổi lúc nào cũng được).
 *
 * KHÔNG tự tính ở tầng web: doanh thu phải cộng ngược tiền giảm (mã đã trừ sẵn
 * vào dòng hàng) và giá vốn nằm ở `order_line_costs` mà tầng này không đọc nổi
 * bằng vai người dùng. Hàm CSDL `security definer` là chỗ duy nhất tính đúng.
 */
export async function taoTongKet(campaignId: string): Promise<KetQua> {
  const parsed = z.uuid().safeParse(campaignId);
  if (!parsed.success) return { error: "du_lieu_khong_hop_le" };

  const ctx = await boiCanh();
  if (!ctx) return { error: "chua_dang_nhap" };

  const { error } = await ctx.supabase.rpc("campaign_tong_ket_yeu_cau", {
    p_campaign_id: parsed.data,
  });
  if (error) return { error: loiGhi(error.message) };

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
  /** Tên + số để CHỦ TIỆM TỰ GỬI — iFan chưa có đường gửi hàng loạt tới khách
   *  (Zalo OA chưa được duyệt). Xem khối chú thích ở `guiTin`. */
  name: string;
  phone: string | null;
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
    .select("id, full_name, phone, marketing_consent, marketing_last_sent_at")
    .is("deleted_at", null);
  if (scope !== "all") q = q.eq("tier", scope);

  // ⚠️ THỨ TỰ Ở ĐÂY LÀ BẮT BUỘC, và nó sửa hai lỗi cùng lúc.
  //
  // 1. **Cắt mà không sắp xếp thì bỏ rơi ai là TUỲ LÚC.** Lượt "Xem trước" và
  //    lượt "Chốt danh sách" là hai lời gọi riêng, nên CSDL được phép trả về
  //    hai nhóm 500 khác nhau — người dùng xem một đằng, gửi một nẻo. Đo được
  //    5/6 tiệm mẫu đã vượt trần 500 (nhiều nhất 1.219 khách), nên nhánh này
  //    đang sống chứ không phải giả định.
  //
  // 2. **500 chỗ có thể bị tiêu phí** — đây là PHÒNG NGỪA, chưa phải lỗi đã
  //    đo được, và ghi rõ như vậy để người sau không tin nhầm. Ba phép trừ bên
  //    dưới loại người chưa đồng ý / đã rút / vừa nhắn trong 7 ngày; lấy 500
  //    người không thứ tự thì về lý phần lớn có thể rơi vào nhóm bị loại.
  //    NHƯNG đã đo trên cả ba tiệm vượt trần (1.214 · 814 · 780 khách): cả hai
  //    cách đều ra **500/500 người gửi được**, vì tỉ lệ đồng ý đang cao (~69%).
  //    Nên xếp người ĐÃ ĐỒNG Ý lên trước hôm nay KHÔNG cải thiện con số nào —
  //    nó chỉ đảm bảo rằng khi tỉ lệ đồng ý tụt xuống, 500 chỗ vẫn rơi đúng
  //    người gửi được.
  //
  // Giá trị cột là chữ: `granted` < `unknown` < `withdrawn` theo bảng chữ cái,
  // nên tăng dần đã đặt người đồng ý lên đầu — trùng hợp may mắn, và vì nó là
  // trùng hợp nên phải ghi ra đây kẻo người sau đổi tên giá trị mà không biết.
  //
  // Rồi tới người LÂU CHƯA ĐƯỢC NHẮN NHẤT (chưa từng nhắn thì lên đầu): chia
  // đều lượt nhắn thay vì nhắn mãi cùng một nhóm. Cuối cùng `id` để hai lượt
  // gọi liên tiếp luôn ra đúng một danh sách.
  const { data, error } = await q
    .order("marketing_consent", { ascending: true })
    .order("marketing_last_sent_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true })
    .limit(SEND_RECIPIENT_LIMIT + 1);
  if (error) throw new Error(error.message);

  const all = (data ?? []).map((c) => ({
    id: c.id as string,
    consent: c.marketing_consent as string,
    lastSentAt: (c.marketing_last_sent_at as string | null) ?? null,
    name: (c.full_name as string | null) ?? "",
    phone: (c.phone as string | null) ?? null,
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

  // ⚠️ HÀM NÀY KHÔNG GỬI TIN. Nó CHỐT DANH SÁCH.
  //
  // iFan chưa có đường gửi hàng loạt tới khách: Zalo OA còn chờ duyệt pháp lý,
  // Zalo Bot chỉ tới được NHÂN VIÊN đã ghép nối, Telegram/Live Chat chỉ tới
  // được người đã tự nhắn vào. Sổ sự thật sản phẩm ghi thẳng luật này và lý do:
  // hứa "khách được nhắn tự động" mà không làm được thì phá luôn niềm tin vào
  // toàn bộ phần còn lại.
  //
  // Bản đầu của màn này ghi bảng rồi báo "Đã gửi xong — số thật: N người" —
  // KHÔNG một khách nào nhận được gì. Tệ gấp đôi vì trigger
  // `campaign_recipient_dong_dau` đóng dấu `marketing_last_sent_at`, nên N người
  // đó bị khoá 7 ngày khỏi chiến dịch sau — mất cửa sổ liên lạc cho tin chưa hề
  // gửi. Nay nói đúng việc nó làm, và trả kèm DANH SÁCH TÊN + SỐ để chủ tiệm tự
  // gửi bằng Zalo/tin nhắn của mình. Dấu 7 ngày GIỮ NGUYÊN vì danh sách này
  // sinh ra để gửi thật ngay — màn hình nói rõ điều đó.
  //
  // Ngày Zalo OA được duyệt: nối đường gửi ở ĐÂY, đổi lại chữ, bỏ khối chép tay.
  const daChon = tep.rows.filter(
    (r) =>
      r.consent === "granted" &&
      (!r.lastSentAt || Date.now() - new Date(r.lastSentAt).getTime() >= BAY_NGAY_MS),
  );

  return {
    error: null,
    dsGui: daChon.map((r) => ({ name: r.name, phone: r.phone })),
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
