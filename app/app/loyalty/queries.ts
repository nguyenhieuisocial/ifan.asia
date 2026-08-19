import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoyaltyDebt, LoyaltyRules, VoucherRow } from "./types";
import { VOUCHER_LIMIT } from "./types";

/**
 * Đọc dữ liệu cho màn Ưu đãi & Tích điểm (V6 retention).
 *
 * Ba luật của mảng này, viết ở đây để người sau không phá:
 *   1. "Đã dùng bao nhiêu lượt" ĐẾM TỪ BẢNG LƯỢT DÙNG, không có bộ đếm rời trên
 *      bảng voucher. Bộ đếm rời và sự thật luôn lệch nhau sau vài tháng.
 *   2. Tổng nợ điểm quy ra tiền TÍNH TRONG CSDL (view `loyalty_debt`), không
 *      nhân lại ở tầng web — hai nơi cùng nhân là hai nơi ra hai con số (#18).
 *   3. Trần danh sách phải được TRẢ VỀ cho màn hình để nó nói ra, không cắt ngầm.
 */

export async function layVouchers(supabase: SupabaseClient): Promise<VoucherRow[]> {
  const { data, error } = await supabase
    .from("vouchers")
    .select(
      // `note` phải có mặt ở đây: ô ghi chú nhập được lúc tạo mã, nhưng trước
      // 19/08 câu đọc này bỏ sót nó ⇒ nhập xong không bao giờ thấy lại, và cửa
      // sổ sửa cũng không có gì để đổ vào ô.
      "id, code, kind, percent_off, amount_off_vnd, max_uses, max_discount_vnd, expires_at, min_order_vnd, per_customer_limit, new_customer_only, status, note, voucher_redemptions(discount_vnd)",
    )
    .order("created_at", { ascending: false })
    .limit(VOUCHER_LIMIT);
  if (error) throw new Error(error.message);

  return (data ?? []).map((v) => {
    const luot = (v.voucher_redemptions ?? []) as { discount_vnd: number }[];
    return {
      id: v.id as string,
      code: v.code as string,
      kind: v.kind as "percent" | "amount",
      percentOff: v.percent_off as number | null,
      amountOffVnd: v.amount_off_vnd === null ? null : Number(v.amount_off_vnd),
      maxUses: Number(v.max_uses),
      maxDiscountVnd: Number(v.max_discount_vnd),
      expiresAt: v.expires_at as string,
      minOrderVnd: Number(v.min_order_vnd),
      perCustomerLimit: v.per_customer_limit as number | null,
      newCustomerOnly: Boolean(v.new_customer_only),
      status: v.status as "active" | "paused",
      note: (v.note as string | null) ?? null,
      usedCount: luot.length,
      totalDiscountVnd: luot.reduce((s, x) => s + Number(x.discount_vnd), 0),
    };
  });
}

/**
 * Luật tích điểm. Tiệm chưa từng mở màn này thì CHƯA CÓ dòng cấu hình — trả về
 * giá trị mặc định KHỚP ĐÚNG default của CSDL (migration #157), để màn hình
 * hiện đúng thứ sẽ được lưu chứ không hiện một bộ số khác rồi lưu ra số khác.
 */
export async function layLuatTichDiem(supabase: SupabaseClient): Promise<LoyaltyRules> {
  const { data, error } = await supabase
    .from("loyalty_config")
    .select("is_active, vnd_per_point, redeem_points_unit, redeem_value_vnd, referral_points, expire_months")
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    isActive: Boolean(data?.is_active ?? false),
    vndPerPoint: Number(data?.vnd_per_point ?? 10000),
    redeemPointsUnit: Number(data?.redeem_points_unit ?? 1000),
    redeemValueVnd: Number(data?.redeem_value_vnd ?? 100000),
    referralPoints: Number(data?.referral_points ?? 200),
    expireMonths: Number(data?.expire_months ?? 12),
  };
}

/** null = tiệm chưa phát điểm cho ai (view không có dòng nào). */
export async function layTongNoDiem(supabase: SupabaseClient): Promise<LoyaltyDebt | null> {
  const { data, error } = await supabase
    .from("loyalty_debt")
    .select("diem_chua_tieu, so_khach, diem_sap_het_han, no_vnd")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    diemChuaTieu: Number(data.diem_chua_tieu),
    soKhach: Number(data.so_khach),
    diemSapHetHan: Number(data.diem_sap_het_han),
    noVnd: Number(data.no_vnd),
  };
}

/**
 * Ví điểm của MỘT khách, cho khối hiển thị trên hồ sơ khách.
 *
 * Trả về null khi tiệm chưa bật tích điểm — khác hẳn "khách có 0 điểm". Hai
 * trạng thái này phải phân biệt được, nếu không màn hồ sơ sẽ hiện khối ví điểm
 * trống trơn cho mọi tiệm chưa dùng tính năng.
 */
export async function layViDiem(
  supabase: SupabaseClient,
  contactId: string,
): Promise<{
  diemCon: number;
  diemSapHetHan: number;
  quyDoiVnd: number;
  lichSu: { id: string; delta: number; reason: string; note: string | null; createdAt: string }[];
} | null> {
  const { data: cfg } = await supabase
    .from("loyalty_config")
    .select("is_active, redeem_points_unit, redeem_value_vnd")
    .maybeSingle();
  if (!cfg?.is_active) return null;

  const [{ data: vi }, { data: so }] = await Promise.all([
    supabase
      .from("loyalty_balances")
      .select("diem_con, diem_sap_het_han")
      .eq("contact_id", contactId)
      .maybeSingle(),
    supabase
      .from("loyalty_ledger")
      .select("id, delta_points, reason, note, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
  ]);

  const diemCon = Number(vi?.diem_con ?? 0);
  return {
    diemCon,
    diemSapHetHan: Number(vi?.diem_sap_het_han ?? 0),
    // Quy đổi theo ĐÚNG luật đang lưu, làm tròn xuống — không hứa cho khách một
    // con số cao hơn thứ họ đổi được thật.
    quyDoiVnd: Math.floor(
      (diemCon * Number(cfg.redeem_value_vnd)) / Number(cfg.redeem_points_unit),
    ),
    lichSu: (so ?? []).map((d) => ({
      id: d.id as string,
      delta: Number(d.delta_points),
      reason: d.reason as string,
      note: (d.note as string | null) ?? null,
      createdAt: d.created_at as string,
    })),
  };
}
