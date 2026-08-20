"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Ba lệnh của mảng "khách đòi xoá dữ liệu cá nhân" (Nghị định 13, migration
 * #287-288). Nền đã xong ở CSDL — ở đây chỉ gọi vào và DỊCH LỖI ra mã cho màn
 * hình hiện câu người đọc hiểu.
 *
 * ⚠️ VÌ SAO KHÔNG CÓ CHỖ NÀO Ở ĐÂY TỰ KIỂM VAI: ba hàm RPC đều tự chốt
 * `owner/admin` bên trong (security definer) và ném 'forbidden' cho vai khác.
 * Thêm một lớp kiểm vai ở tầng web chỉ tạo ra cơ hội cho hai lớp lệch nhau —
 * lớp ẩn/hiện nút nằm ở `access.ts` + `page.tsx`, đúng khuôn các màn Cài đặt
 * khác, và đó là PHÉP LỊCH SỰ UI chứ không phải hàng rào.
 *
 * ⚠️ VÌ SAO KIỂM `error` LÀ ĐỦ ĐẾM DÒNG ở đây (khác luật chung của kho):
 * `.update()` thẳng lên bảng bị RLS lọc mất dòng thì im lặng ra 0 dòng — nên
 * kho bắt buộc đếm dòng. Ba hàm này KHÔNG phải `.update()`: chúng tự
 * `if not found then raise` (reject) hoặc `raise` khi không tìm ra yêu cầu
 * đang chờ (apply), nên 0 dòng ĐÃ thành lỗi ném ra. Hai hàm trả giá trị
 * (create → uuid, apply → jsonb) còn được kiểm thêm "có trả về gì không".
 */
type ActionResult = { error: string | null };

/**
 * Mã lỗi ba hàm RPC ném ra. Trả MÃ (không phải câu đã dịch) để màn hình chọn
 * câu theo ngôn ngữ đang dùng — khuôn `settings/actions.ts`.
 */
const MA_LOI_RPC = [
  "forbidden",
  "contact_not_found",
  "reason_required",
  "request_not_pending",
  "no_tenant_context",
] as const;

function doiMaLoi(message: string): string {
  return MA_LOI_RPC.find((ma) => message.includes(ma)) ?? "failed";
}

/**
 * Ghi nhận một yêu cầu xoá cho khách. ĐÂY CHƯA PHẢI LÀ XOÁ — bước thi hành
 * nằm ở `thiHanhYeuCauXoa`, phải có người bấm lần thứ hai (chốt (1) của #287).
 */
export async function taoYeuCauXoa(
  contactId: string,
  note: string,
): Promise<ActionResult> {
  const parsed = z
    .object({ contactId: z.uuid(), note: z.string().trim().max(2000) })
    .safeParse({ contactId, note });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("erasure_request_create", {
    p_contact: parsed.data.contactId,
    p_note: parsed.data.note || null,
  });
  if (error) {
    // Chỉ mục duy nhất `data_erasure_mot_yeu_cau_cho` chặn yêu cầu thứ hai
    // đang chờ của cùng một khách — lỗi này KHÔNG do hàm ném nên không có mã
    // riêng, phải nhận ra qua câu của Postgres.
    if (error.message.includes("duplicate key")) return { error: "already_pending" };
    return { error: doiMaLoi(error.message) };
  }
  // Hàm trả về mã yêu cầu vừa ghi. Không có mã = không ghi được dòng nào, dù
  // Supabase không báo lỗi — báo "đã ghi nhận" lúc đó là nói dối chủ tiệm.
  if (!data) return { error: "failed" };

  revalidatePath("/app/settings/data-erasure");
  revalidatePath(`/app/contacts/${parsed.data.contactId}`);
  return { error: null };
}

/** Từ chối một yêu cầu. Lý do BẮT BUỘC — hàm ném 'reason_required' nếu rỗng. */
export async function tuChoiYeuCauXoa(
  requestId: string,
  reason: string,
): Promise<ActionResult> {
  const parsed = z
    .object({ requestId: z.uuid(), reason: z.string().trim().min(1).max(2000) })
    .safeParse({ requestId, reason });
  if (!parsed.success) return { error: "reason_required" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("erasure_request_reject", {
    p_id: parsed.data.requestId,
    p_reason: parsed.data.reason,
  });
  // Hàm trả `void` nên không có gì để đếm — nhưng nó tự `if not found then
  // raise 'request_not_pending'`, tức "không đụng dòng nào" ĐÃ là một lỗi ném
  // ra chứ không im lặng. Kiểm `error` ở đây chính là kiểm số dòng.
  if (error) return { error: doiMaLoi(error.message) };

  revalidatePath("/app/settings/data-erasure");
  return { error: null };
}

/**
 * THI HÀNH — xoá người, giữ số. KHÔNG HOÀN TÁC ĐƯỢC.
 *
 * Trả về tóm tắt để màn hình nói ngay đã xoá bao nhiêu, giữ bao nhiêu; bản
 * tóm tắt đó cũng được CSDL lưu vào cột `summary` nên mở lại vẫn đọc được.
 */
export async function thiHanhYeuCauXoa(requestId: string): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(requestId);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("erasure_request_apply", {
    p_id: parsed.data,
  });
  if (error) return { error: doiMaLoi(error.message) };
  // Hàm luôn trả tóm tắt khi chạy tới cuối. Không có tóm tắt = không có gì
  // chứng minh đã xoá những gì — mà chứng minh được chính là thứ Nghị định 13
  // đòi, nên coi là thất bại thay vì báo xong.
  if (!data) return { error: "failed" };

  revalidatePath("/app/settings/data-erasure");
  // Hồ sơ khách vừa bị thay tên + xoá sạch thông tin cá nhân.
  revalidatePath("/app/contacts");
  return { error: null };
}
