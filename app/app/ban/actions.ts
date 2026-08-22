"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * THAO TÁC CỦA MÀN BÁN TẠI QUẦY (thẻ `man-ban-quan-an`, migration #356).
 *
 * ⚠️ VÌ SAO CÓ FILE RIÊNG THAY VÌ SỬA `app/app/orders/actions.ts`.
 *   Màn đơn hàng đang chạy thật cho 6 tiệm mẫu và tiệm demo. Nhét thêm hai
 *   tham số (bàn, ghi chú dòng) vào các hàm nó đang dùng là đụng vào đường đi
 *   của tiền ở một màn không liên quan. Ở đây dùng LẠI mọi luật của CSDL (RLS,
 *   trigger vòng đời, chốt chéo tiệm) — chỉ khác lối vào.
 *
 * ⚠️ KHÔNG hàm nào ở đây được đụng tới trạng thái đơn. Thu tiền, hoàn tất, huỷ
 *   vẫn đi qua màn chi tiết đơn — nơi đã có đủ xác nhận và đủ chốt.
 */

type KetQua = { error: string | null };

async function xacThuc() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "not_authenticated" };
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { ok: false as const, error: "not_found" };
  return { ok: true as const, supabase, userId: user.id, tenantId: tenant.id as string };
}

function veLaiBan(donId?: string) {
  revalidatePath("/app/ban");
  revalidatePath("/app/orders");
  if (donId) revalidatePath(`/app/orders/${donId}`);
}

/**
 * MỞ BÀN — trả về đơn đang mở của bàn, tạo mới nếu chưa có.
 *
 * ⚠️ PHẢI TRẢ VỀ ĐƠN CŨ NẾU ĐÃ CÓ, KHÔNG PHẢI BÁO LỖI. Hai nhân viên cùng chạm
 *   "Bàn 03" trên hai máy là chuyện hằng ngày ở quán đông. Người thứ hai phải
 *   được đưa vào ĐÚNG đơn đang mở, không phải nhận một thông báo lỗi khó hiểu.
 *   Chỉ mục duy nhất `orders_mot_ban_mot_don_mo` chặn ở CSDL; đoạn `catch` dưới
 *   đây biến cú chặn đó thành "mở đúng đơn kia" thay vì một lỗi đỏ.
 */
export async function moBan(resourceId: string): Promise<KetQua & { donId?: string }> {
  if (!z.uuid().safeParse(resourceId).success) return { error: "invalid_input" };
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };

  const timDonMo = async () => {
    const { data } = await auth.supabase
      .from("orders")
      .select("id")
      .eq("resource_id", resourceId)
      .in("status", ["draft", "confirmed"])
      .is("deleted_at", null)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };

  const daCo = await timDonMo();
  if (daCo) return { error: null, donId: daCo };

  // Khách lẻ: hàm CSDL tự tra/tạo cho đúng tiệm đang mở (#356).
  const { data: khachLe, error: loiKhach } = await auth.supabase.rpc("khach_le_cua_tiem");
  if (loiKhach || !khachLe) return { error: "save_failed" };

  const { data, error } = await auth.supabase
    .from("orders")
    .insert({
      tenant_id: auth.tenantId,
      contact_id: khachLe as string,
      resource_id: resourceId,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = chỉ mục duy nhất chặn: ai đó vừa mở bàn này trước ta một nhịp.
    if (error.code === "23505") {
      const kia = await timDonMo();
      if (kia) return { error: null, donId: kia };
    }
    return { error: error.code === "23514" ? "invalid_input" : "save_failed" };
  }
  veLaiBan(data.id as string);
  return { error: null, donId: data.id as string };
}

const themMonSchema = z.object({
  donId: z.uuid(),
  itemId: z.uuid(),
  ghiChu: z.string().trim().max(200).nullable(),
});

/**
 * THÊM MỘT MÓN — chạm một cái là một món.
 *
 * ⚠️ CHẠM LẠI CÙNG MỘT MÓN THÌ TĂNG SỐ LƯỢNG, không đẻ dòng thứ hai. Đó là
 *   cách máy tính tiền nào cũng cư xử, và là lý do người đứng quầy gõ được
 *   nhanh. Nhưng "cùng một món" phải tính CẢ GHI CHÚ: hai ly cà phê, một ly ít
 *   đường, là HAI dòng — gộp lại thì bếp không biết làm sao.
 */
export async function themMonVaoBan(input: z.infer<typeof themMonSchema>): Promise<KetQua> {
  const parsed = themMonSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };
  const { donId, itemId, ghiChu } = parsed.data;

  const { data: mon } = await auth.supabase
    .from("items")
    .select("id, price_vnd")
    .eq("id", itemId)
    .maybeSingle();
  if (!mon) return { error: "not_found" };

  // Dòng giống hệt (cùng món, cùng ghi chú, chưa có biến thể) thì cộng dồn.
  // ⚠️ `null` và chuỗi rỗng là CÙNG một ý ("không ghi chú") nhưng SQL coi chúng
  //   khác nhau — phải dùng `is null` chứ không `= ''`, nếu không mỗi lần chạm
  //   lại đẻ thêm một dòng mới.
  const khongGhiChu = ghiChu === null || ghiChu === "";
  const truyVan = auth.supabase
    .from("order_lines")
    .select("id, qty")
    .eq("order_id", donId)
    .eq("item_id", itemId)
    .is("variant_id", null);
  const { data: trung } = await (khongGhiChu
    ? truyVan.is("ghi_chu", null)
    : truyVan.eq("ghi_chu", ghiChu)
  )
    // `limit(1)` chứ không `maybeSingle()` trần: đơn cũ có thể đã có hai dòng
    // trùng từ trước, và ở đó `maybeSingle` ném lỗi thay vì cộng dồn.
    .limit(1)
    .maybeSingle();

  if (trung) {
    const { data: daSua, error } = await auth.supabase
      .from("order_lines")
      .update({ qty: (trung.qty as number) + 1 })
      .eq("id", trung.id as string)
      .select("id");
    if (error) return { error: "save_failed" };
    if (!daSua || daSua.length === 0) return { error: "forbidden" };
    veLaiBan(donId);
    return { error: null };
  }

  // #190 — chép mức VAT của tiệm vào dòng LÚC TẠO, đúng khuôn màn đơn hàng.
  const { data: tax } = await auth.supabase.from("tax_settings").select("enabled, rate").maybeSingle();
  const taxRate = tax?.enabled ? Number(tax.rate) : 0;

  const { error } = await auth.supabase.from("order_lines").insert({
    tenant_id: auth.tenantId,
    order_id: donId,
    item_id: itemId,
    variant_id: null,
    qty: 1,
    unit_price_vnd: mon.price_vnd as number,
    discount_vnd: 0,
    tax_rate: taxRate,
    ghi_chu: ghiChu === "" ? null : ghiChu,
  });
  if (error) return { error: "save_failed" };
  veLaiBan(donId);
  return { error: null };
}

const doiSoLuongSchema = z.object({
  donId: z.uuid(),
  lineId: z.uuid(),
  qty: z.number().int().min(0).max(999),
});

/** Đổi số lượng. Về 0 là xoá dòng — đúng cái người dùng chờ đợi khi bấm "−" tới cùng. */
export async function doiSoLuong(input: z.infer<typeof doiSoLuongSchema>): Promise<KetQua> {
  const parsed = doiSoLuongSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };
  const { donId, lineId, qty } = parsed.data;

  // `.select("id")` KHÔNG phải để lấy dữ liệu — để ĐẾM. Thiếu nó thì Supabase
  // trả 0 dòng trong mọi trường hợp, kể cả lúc RLS chặn quyền ghi, và error vẫn
  // là null. Đo trên CSDL: người ĐỌC được đơn nhưng không đủ quyền sửa thì lệnh
  // ra 0 dòng, không lỗi — màn báo "đã lưu" trong khi số lượng còn nguyên.
  const { data: daSua, error } =
    qty === 0
      ? await auth.supabase.from("order_lines").delete().eq("id", lineId).select("id")
      : await auth.supabase.from("order_lines").update({ qty }).eq("id", lineId).select("id");
  if (error) return { error: "save_failed" };
  if (!daSua || daSua.length === 0) return { error: "forbidden" };
  veLaiBan(donId);
  return { error: null };
}

const ghiChuSchema = z.object({
  donId: z.uuid(),
  lineId: z.uuid(),
  ghiChu: z.string().trim().max(200),
});

/** Ghi chú cho MỘT dòng: "ít đường", "không đá", "mang về". */
export async function datGhiChuDong(input: z.infer<typeof ghiChuSchema>): Promise<KetQua> {
  const parsed = ghiChuSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };

  const { data: daSua, error } = await auth.supabase
    .from("order_lines")
    .update({ ghi_chu: parsed.data.ghiChu === "" ? null : parsed.data.ghiChu })
    .eq("id", parsed.data.lineId)
    .select("id");
  if (error) return { error: "save_failed" };
  if (!daSua || daSua.length === 0) return { error: "forbidden" };
  veLaiBan(parsed.data.donId);
  return { error: null };
}

/**
 * CHUYỂN BÀN. Khách đổi chỗ là chuyện thường ngày.
 *
 * Bàn đích đang có đơn thì KHÔNG tự gộp — trả lỗi rõ ràng. Gộp/ghép đơn là
 * nghiệp vụ riêng (đợt 2 của thẻ thiết kế); làm nửa vời ở đây là sinh đơn mồ côi.
 */
export async function chuyenBan(donId: string, banMoiId: string): Promise<KetQua> {
  if (!z.uuid().safeParse(donId).success || !z.uuid().safeParse(banMoiId).success) {
    return { error: "invalid_input" };
  }
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };

  const { data: daSua, error } = await auth.supabase
    .from("orders")
    .update({ resource_id: banMoiId })
    .eq("id", donId)
    .select("id");
  if (error) {
    if (error.code === "23505") return { error: "ban_dang_co_don" };
    if (error.code === "23514") return { error: "invalid_input" };
    return { error: "save_failed" };
  }
  if (!daSua || daSua.length === 0) return { error: "forbidden" };
  veLaiBan(donId);
  return { error: null };
}

/**
 * ĐÁNH DẤU ĐÃ IN TẠM TÍNH.
 *
 * Đây là tín hiệu vận hành đắt nhất trên màn bàn: khách đã xin tính tiền, bàn
 * sắp trống. Ghi mốc thời gian chứ không ghi cờ true/false — biết được khách
 * đã đợi bao lâu kể từ lúc xin tính tiền.
 */
export async function danhDauTamTinh(donId: string): Promise<KetQua> {
  if (!z.uuid().safeParse(donId).success) return { error: "invalid_input" };
  const auth = await xacThuc();
  if (!auth.ok) return { error: auth.error };

  const { data: daSua, error } = await auth.supabase
    .from("orders")
    .update({ tam_tinh_luc: new Date().toISOString() })
    .eq("id", donId)
    .select("id");
  if (error) return { error: "save_failed" };
  if (!daSua || daSua.length === 0) return { error: "forbidden" };
  veLaiBan(donId);
  return { error: null };
}
