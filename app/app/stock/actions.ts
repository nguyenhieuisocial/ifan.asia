"use server";

import { createClient } from "@/lib/supabase/server";
import { layLichSuKho, type DongSoKho } from "@/lib/stock/ledger";

/**
 * Lịch sử ra/vào của MỘT mặt hàng — mở ngay trong màn Kho (thẻ `man-kho.html`),
 * nên nạp theo yêu cầu bằng server action thay vì kéo sẵn cả sổ lúc mở trang.
 *
 * Phân trang bằng con trỏ ghép `lib/keyset-cursor.ts` (đã nằm trong
 * `layLichSuKho`) — KHÔNG phân trang theo mỗi mốc thời gian: sổ kho là chỗ dễ
 * trùng mốc nhất (chốt một đơn 5 món sinh 5 dòng cùng khoảnh khắc) và việc #167
 * đã chứng minh cách đó làm MẤT dữ liệu thật.
 *
 * QUYỀN: không siết thêm ở đây — RLS `stock_moves_select` mở cho mọi vai trong
 * tiệm, đúng luật màn này (cùng nguyên tắc `app/app/cashbook/actions.ts`).
 */

export type KetQuaLichSu = {
  dong: DongSoKho[];
  cursorTiep: string | null;
  /** null = thành công. Khác rỗng ⇒ màn phải nói "tra cứu hỏng", KHÔNG được
   *  hiện như "mặt hàng này chưa có dòng kho nào" (việc #169). */
  error: string | null;
};

const RONG: { dong: DongSoKho[]; cursorTiep: null } = { dong: [], cursorTiep: null };

export async function layThemLichSuKho(itemId: string, cursor?: string): Promise<KetQuaLichSu> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) {
    return { ...RONG, error: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...RONG, error: "not_authenticated" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { ...RONG, error: "not_found" };

  try {
    const kq = await layLichSuKho(supabase, tenant.id as string, itemId, cursor);
    return { ...kq, error: null };
  } catch {
    return { ...RONG, error: "load_failed" };
  }
}
