"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { quetDuDong } from "@/lib/quet-du-dong";

/**
 * Server actions cho màn Kiểm kê (ADR-0021 V4).
 *
 * QUYỀN: RLS `stocktakes_rw` / `stocktake_lines_rw` chỉ mở cho owner/admin/manager.
 * Tầng này không siết thêm — RLS đã đủ, cùng nguyên tắc các action khác trong mảng kho.
 * Lỗi RLS được dịch thành "forbidden" để màn nói đúng thay vì "Lưu thất bại".
 *
 * KHÔNG SỬA SỐ TỒN TRỰC TIẾP (luật kiểm kê):
 * Màn chỉ ghi dem_thuc_te → trigger `stocktakes_sinh_dong_kho` tự sinh stock_moves
 * khi chốt phiên. Không có đường nào bypass trigger này từ màn.
 */

type KetQuaLuu = { error: string | null };
type KetQuaTao = { stocktakeId: string | null; error: string | null };
/** Chốt phiên trả kèm SỐ DÒNG còn thiếu lý do — câu lỗi phải nói được còn bao
 *  nhiêu món phải khai, "không chốt được" trống không thì người dùng đứng im. */
type KetQuaChot = { error: string | null; soDongThieuLyDo: number };

function loiGhi(message: string): string {
  if (/row-level security/i.test(message)) return "forbidden";
  if (/stocktake_locked/i.test(message)) return "stocktake_locked";
  return "save_failed";
}

/**
 * Tạo phiên kiểm kê mới.
 *
 * Hai bước: tạo phiên (status='dang_dem') → bulk INSERT stocktake_lines với
 * TẤT CẢ mặt hàng active, ton_theo_so = tồn hiện tại, dem_thuc_te = ton_theo_so
 * (mặc định không chênh lệch — người dùng chỉ cần sửa mặt hàng sai).
 *
 * dem_thuc_te phải >= 0 theo DB constraint: dùng Math.max(0, ton) vì tồn âm
 * hợp lệ nhưng số đếm thực tế không thể âm.
 *
 * Hỏng giữa chừng → dọn phiên nháp vừa tạo, không để lại rác.
 */
export async function taoPhienKiemKe(): Promise<KetQuaTao> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { stocktakeId: null, error: "not_authenticated" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { stocktakeId: null, error: "not_found" };

  // Belt-and-suspenders: kiểm tra trùng phiên trước RLS để trả lỗi rõ ràng hơn.
  const { data: phienCu } = await supabase
    .from("stocktakes")
    .select("id")
    .eq("tenant_id", tenant.id as string)
    .eq("status", "dang_dem")
    .maybeSingle();
  if (phienCu) return { stocktakeId: null, error: "already_active" };

  const { data: phien, error: loiPhien } = await supabase
    .from("stocktakes")
    .insert({ tenant_id: tenant.id as string, status: "dang_dem", created_by: user.id })
    .select("id")
    .single();
  if (loiPhien || !phien) return { stocktakeId: null, error: loiGhi(loiPhien?.message ?? "") };

  // Lấy items và tồn song song — cả hai đều cần để tạo dòng kiểm kê.
  // Trần 1.000 ở đây tạo phiên kiểm kê THIẾU DÒNG: nhân viên đếm xong, ký, và
  // những mặt hàng không lọt vào danh sách coi như chưa từng tồn tại.
  const [items, ton] = await Promise.all([
    quetDuDong<{ id: string }>(
      () =>
        supabase
          .from("items")
          .select("id")
          .eq("tenant_id", tenant.id as string)
          .eq("kind", "product")
          .eq("status", "active")
          .order("id") as never,
      "kiểm kê — danh sách hàng",
    ),
    quetDuDong<{ item_id: string; qty_on_hand: number }>(
      () =>
        supabase
          .from("stock_levels")
          .select("item_id, qty_on_hand")
          .eq("tenant_id", tenant.id as string)
          .order("item_id") as never,
      "kiểm kê — tồn kho",
    ),
  ]);
  const itemsRes = { data: items, error: null as { message: string } | null };
  const tonRes = { data: ton, error: null as { message: string } | null };

  if (itemsRes.error) {
    await supabase.from("stocktakes").delete().eq("id", phien.id as string);
    return { stocktakeId: null, error: loiGhi(itemsRes.error.message) };
  }

  const tonMap = new Map<string, number>();
  for (const r of tonRes.data ?? []) {
    tonMap.set(r.item_id as string, Number(r.qty_on_hand ?? 0));
  }

  const dongInsert = (itemsRes.data ?? []).map((item) => {
    const tonHienTai = tonMap.get(item.id as string) ?? 0;
    // dem_thuc_te >= 0 theo DB constraint — tồn âm vẫn ghi vào ton_theo_so.
    const demMacDinh = Math.max(0, tonHienTai);
    return {
      tenant_id: tenant.id as string,
      stocktake_id: phien.id as string,
      item_id: item.id as string,
      ton_theo_so: tonHienTai,
      dem_thuc_te: demMacDinh,
    };
  });

  if (dongInsert.length > 0) {
    const { error: loiDong } = await supabase.from("stocktake_lines").insert(dongInsert);
    if (loiDong) {
      await supabase.from("stocktakes").delete().eq("id", phien.id as string);
      return { stocktakeId: null, error: loiGhi(loiDong.message) };
    }
  }

  revalidatePath("/app/stock/stocktake");
  return { stocktakeId: phien.id as string, error: null };
}

const capNhatSchema = z.object({
  lineId: z.uuid(),
  demThucTe: z.number().min(0),
  // null = không có lý do (khi dem = ton hoặc người dùng chưa chọn)
  lyDo: z.enum(["vo_hong", "het_han", "mat", "ghi_nham"]).nullable(),
});

/**
 * Cập nhật dem_thuc_te và ly_do cho một dòng kiểm kê.
 *
 * Trigger `stocktake_lines_lock_guard` sẽ throw nếu phiên đã đóng (da_chot/da_huy).
 * RLS sẽ từ chối nếu không phải owner/admin/manager.
 * Không cần lấy tenant_id thủ công — RLS đã lọc đúng tenant.
 */
export async function capNhatDongKiemKe(
  input: z.infer<typeof capNhatSchema>,
): Promise<KetQuaLuu> {
  const parsed = capNhatSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: daGhi, error } = await supabase
    .from("stocktake_lines")
    .update({
      dem_thuc_te: parsed.data.demThucTe,
      ly_do: parsed.data.lyDo,
    })
    .eq("id", parsed.data.lineId)
    .select("id");

  if (error) return { error: loiGhi(error.message) };
  // Hàm này KHÔNG kiểm vai ở tầng ứng dụng — chỉ hỏi đã đăng nhập chưa. RLS
  // `stocktake_lines_rw` lọc thì lệnh ra 0 dòng và `error = null`, im hệt lúc
  // ghi được. Đây là màn ĐẾM HÀNG: mất một con số trong im lặng nghĩa là chốt
  // phiên xong kho lệch mà không ai truy được về đâu.
  if (!daGhi?.length) return { error: "forbidden" };
  return { error: null };
}

/**
 * Chốt phiên kiểm kê.
 * Trigger `stocktakes_sinh_dong_kho` tự sinh stock_moves cho mọi dòng có
 * dem_thuc_te ≠ ton_theo_so — màn không can thiệp vào logic đó.
 *
 * ═══════════════════════════════════════════════════════════════════
 * BẮT BUỘC CÓ LÝ DO CHO MỌI DÒNG LỆCH — kiểm ở ĐÂY, không chỉ ở màn
 * ═══════════════════════════════════════════════════════════════════
 * Thẻ `man-kiem-ke.html` hứa "chưa chọn lý do thì không chốt được phiên" NGAY
 * TỪ BẢN ĐẦU. Lời hứa đó chưa từng được làm: cột `ly_do` cho phép rỗng, màn
 * không chặn, CSDL không chặn.
 *
 * Hậu quả không phải "thiếu một thông tin cho đẹp". Trigger phân loại theo
 * `case when ly_do in ('vo_hong','het_han','mat') then 'hao_hut' else 'kiem_ke'`
 * — rỗng rơi vào nhánh `else`. Tức mất hàng vì vỡ mà quên chọn lý do thì cuối
 * tháng nó nằm trong "sổ ghi lệch", KHÔNG nằm trong "hao hụt". Báo cáo hao hụt
 * sai mà không có gì báo động.
 *
 * Màn đã chặn rồi vẫn phải chặn lại ở đây: server action là một cửa HTTP, ai
 * gọi thẳng cũng được. Không tin dữ liệu trình duyệt gửi lên.
 *
 * KHÔNG so hai cột được ở tầng lọc (PostgREST không có phép so cột với cột),
 * nên lọc `ly_do is null` ở CSDL rồi đếm phần lệch tại đây.
 */
export async function chotPhienKiemKe(stocktakeId: string): Promise<KetQuaChot> {
  if (!z.uuid().safeParse(stocktakeId).success) {
    return { error: "invalid_input", soDongThieuLyDo: 0 };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated", soDongThieuLyDo: 0 };

  let soThieu = 0;
  try {
    const dongTrongLyDo = await quetDuDong<{ ton_theo_so: number | string; dem_thuc_te: number | string }>(
      () =>
        supabase
          .from("stocktake_lines")
          .select("ton_theo_so, dem_thuc_te")
          .eq("stocktake_id", stocktakeId)
          .is("ly_do", null)
          .order("id") as never,
      "kiểm kê — dòng chưa có lý do",
    );
    soThieu = dongTrongLyDo.filter(
      (d) => Number(d.dem_thuc_te) !== Number(d.ton_theo_so),
    ).length;
  } catch {
    // Đếm hỏng thì KHÔNG chốt liều: chốt là bước sinh dòng kho không hoàn tác
    // được, mà lúc này ta không biết còn món nào thiếu lý do hay không.
    return { error: "check_failed", soDongThieuLyDo: 0 };
  }
  if (soThieu > 0) return { error: "missing_reason", soDongThieuLyDo: soThieu };

  const { data: daChot, error } = await supabase
    .from("stocktakes")
    .update({ status: "da_chot" })
    .eq("id", stocktakeId)
    .select("id");

  if (error) return { error: loiGhi(error.message), soDongThieuLyDo: 0 };
  // Chốt là bước sinh dòng kho (trigger `stocktakes_sinh_dong_kho`). 0 dòng =
  // trigger không chạy = tồn kho KHÔNG được điều chỉnh, trong khi màn hình báo
  // đã chốt và người đếm đã cất hàng đi. Cùng lý do với `capNhatDongKiemKe`.
  if (!daChot?.length) return { error: "forbidden", soDongThieuLyDo: 0 };

  revalidatePath("/app/stock/stocktake");
  revalidatePath("/app/stock");
  return { error: null, soDongThieuLyDo: 0 };
}

/** Huỷ phiên kiểm kê — không sinh dòng kho. Trigger vẫn khoá dòng hàng. */
export async function huyPhienKiemKe(stocktakeId: string): Promise<KetQuaLuu> {
  if (!z.uuid().safeParse(stocktakeId).success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: daHuy, error } = await supabase
    .from("stocktakes")
    .update({ status: "da_huy" })
    .eq("id", stocktakeId)
    .select("id");

  if (error) return { error: loiGhi(error.message) };
  // Huỷ hụt trong im lặng thì phiên vẫn đang đếm dở: màn hình khoá lại như đã
  // huỷ, còn CSDL vẫn coi phiên là mở và chặn mở phiên mới.
  if (!daHuy?.length) return { error: "forbidden" };

  revalidatePath("/app/stock/stocktake");
  return { error: null };
}
