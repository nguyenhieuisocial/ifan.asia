import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  DataErasureView,
  type ErasureRequestRow,
  type ErasureSummary,
} from "./data-erasure-view";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;

/**
 * Cài đặt → Yêu cầu xoá dữ liệu (Nghị định 13, migration #287-288).
 *
 * Chỉ owner/admin — đúng ba hàm RPC (`erasure_request_create/reject/apply`
 * đều raise 'forbidden' cho vai khác). Bảng `data_erasure_requests` thì MỌI
 * thành viên trong tiệm đọc được (RLS `data_erasure_select`), nên trang này
 * hỏi vai để hiện đúng câu "không có quyền" thay vì một danh sách nhìn được
 * mà bấm gì cũng bị chặn — khuôn `trash/page.tsx` và `data-export-log`.
 *
 * Tên khách KHÔNG nằm trong bảng yêu cầu (cố ý: bảng đó phải sống được cả sau
 * khi hồ sơ khách đã bị xoá sạch thông tin cá nhân), nên phải lấy riêng từ
 * `contacts`. Yêu cầu đã thi hành sẽ hiện đúng cái tên thay thế
 * "Khách đã xoá #XXXX" — đó là điều ĐÚNG, không phải lỗi hiển thị.
 *
 * Thẻ design: design-system/man-xuat-du-lieu-pdpl.html (nửa dưới — nửa trên
 * là màn Xuất dữ liệu, chưa có code).
 */
export default async function DataErasurePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) {
    return <DataErasureView canManage={false} requests={[]} />;
  }

  const { data: rows, error } = await supabase
    .from("data_erasure_requests")
    .select(
      "id, contact_id, requested_at, deadline_at, status, note, reject_reason, decided_at, summary",
    )
    .order("requested_at", { ascending: false })
    .limit(LIST_LIMIT);

  // Đọc hỏng mà hiện "chưa có yêu cầu nào" là câu trả lời SAI ở đúng chỗ nguy
  // hiểm nhất: mỗi yêu cầu có hạn 30 ngày đang chạy, tưởng trống là để quá hạn.
  if (error) {
    return <DataErasureView canManage requests={[]} loadFailed />;
  }

  const contactIds = [
    ...new Set((rows ?? []).map((r) => r.contact_id as string)),
  ];
  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("id, full_name").in("id", contactIds)
    : { data: [] };
  const nameOf = new Map(
    (contacts ?? []).map((c) => [c.id as string, c.full_name as string]),
  );

  const requests: ErasureRequestRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    contactId: r.contact_id as string,
    contactName: nameOf.get(r.contact_id as string) ?? null,
    requestedAt: r.requested_at as string,
    deadlineAt: r.deadline_at as string,
    status: r.status as ErasureRequestRow["status"],
    note: (r.note as string | null) ?? null,
    rejectReason: (r.reject_reason as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
    summary: (r.summary as ErasureSummary | null) ?? null,
  }));

  return <DataErasureView canManage requests={requests} listLimit={LIST_LIMIT} />;
}
