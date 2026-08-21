"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * CÔNG TẮC TÍNH NĂNG — lệnh ghi của chủ SaaS.
 *
 * ⚠️ CHỐT QUYỀN NẰM TRONG HÀM CSDL (`admin_dat_cong_tac` tự kiểm
 *   `is_platform_admin()`), không ở đây và không ở màn. Lệnh máy chủ gọi được
 *   thẳng bằng một lời POST, nên chốt ở tầng web là chốt ở phía người gọi.
 *   Ở đây chỉ soát HÌNH DẠNG dữ liệu để trả lời sớm và rõ.
 *
 * ⚠️ KHÔNG có lệnh XOÁ công tắc. Xoá đi thì tính năng lặng lẽ quay về BẬT cho
 *   mọi tiệm (luật "không có công tắc thì vẫn chạy") — đúng lúc người bấm
 *   tưởng mình vừa dọn dẹp. Muốn ngưng thì gạt về "tắt" và để nó nằm đó.
 */

const PHAM_VI = ["tat", "moi_tiem", "vai_tiem", "theo_vai"] as const;

const schema = z.object({
  khoa: z.string().regex(/^[a-z][a-z0-9-]{1,48}$/),
  ten: z.string().trim().min(1).max(80),
  moTa: z.string().max(400).optional(),
  phamVi: z.enum(PHAM_VI),
  tiemIds: z.array(z.uuid()).max(200).default([]),
  vai: z.array(z.enum(["owner", "admin", "manager", "staff", "viewer"])).max(5).default([]),
});

export type DatCongTacInput = z.input<typeof schema>;

export async function datCongTac(input: DatCongTacInput): Promise<{ error: string | null }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };
  const d = parsed.data;

  // Hai phạm vi "một phần" mà danh sách rỗng thì thành TẮT NGẦM: màn hiện "mở
  // một phần" nhưng thực tế không ai thấy. CSDL cũng chặn (ràng buộc #331) —
  // chặn thêm ở đây chỉ để trả lời rõ ràng thay vì để người dùng gặp lỗi thô.
  if (d.phamVi === "vai_tiem" && d.tiemIds.length === 0) return { error: "chuaChonTiem" };
  if (d.phamVi === "theo_vai" && d.vai.length === 0) return { error: "chuaChonVai" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dat_cong_tac", {
    p_khoa: d.khoa,
    p_ten: d.ten,
    p_mo_ta: d.moTa ?? null,
    p_pham_vi: d.phamVi,
    p_tiem_ids: d.tiemIds,
    p_vai: d.vai,
  });
  if (error) return { error: "saveFailed" };
  const r = data as { ok: boolean; ly_do?: string } | null;
  if (!r?.ok) return { error: r?.ly_do ?? "saveFailed" };

  revalidatePath("/admin/cong-tac");
  return { error: null };
}

/**
 * TẮT NGAY — một bấm, không hỏi lại.
 *
 * Cố ý KHÔNG có hộp "bạn có chắc không". Lúc đang có sự cố thì mỗi bấm thêm là
 * một khoảng thời gian khách còn gặp lỗi, và thao tác này LÙI ĐƯỢC: gạt lại là
 * xong. Hộp xác nhận để dành cho thứ không lùi được.
 */
export async function tatCongTacNgay(khoa: string): Promise<{ error: string | null }> {
  if (!/^[a-z][a-z0-9-]{1,48}$/.test(khoa)) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_tat_cong_tac_ngay", { p_khoa: khoa });
  if (error) return { error: "saveFailed" };
  const r = data as { ok: boolean; ly_do?: string } | null;
  if (!r?.ok) return { error: r?.ly_do ?? "saveFailed" };

  revalidatePath("/admin/cong-tac");
  return { error: null };
}
