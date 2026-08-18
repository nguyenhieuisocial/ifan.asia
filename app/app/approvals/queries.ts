import type { SupabaseClient } from "@supabase/supabase-js";
import { APPROVALS_PAGE_SIZE, type MyRequestRow, type TicketRow } from "./types";
import type { FormField } from "../settings/forms/types";

/**
 * Fetcher dùng chung màn "Duyệt & yêu cầu": server component load trang đầu,
 * server action load trang kế — cùng một hàm nên hai bên không thể lệch shape.
 *
 * Huy hiệu "Chờ tôi duyệt" KHÔNG đếm ở đây mà gọi `approval_pending_count()`
 * (migration #37): trước kia nó đếm trong đúng 50 phiếu vừa tải nên tiệm nào
 * quá 50 phiếu chờ là con số đứng yên ở 50.
 */

/** Người quyết định / người gửi → tên hiển thị (đã có sẵn bảng tra ở tầng gọi). */
export type NameOf = (id: string | null | undefined) => string | null;

const ASSIGNED_SELECT = `decision, decided_at, note,
  wf_approval_requests!inner(
    id, title, body, level, total_levels, status, created_at,
    decision_note, decided_at, decided_by, submission_id, run_id,
    workflow_runs(workflows(name)))`;

const MINE_SELECT = `id, data, fields_snapshot, created_at, status,
  wf_forms(name),
  wf_approval_requests(level, total_levels, status, decision_note, decided_at, decided_by)`;

type SubmissionJoin = {
  id: string;
  data: Record<string, unknown> | null;
  fields_snapshot: FormField[] | null;
  submitted_by: string | null;
  created_at: string;
  wf_forms: { name?: string } | null;
};

type RequestJoin = {
  id: string;
  title: string;
  body: string | null;
  level: number;
  total_levels: number;
  status: string;
  created_at: string;
  decision_note: string | null;
  decided_at: string | null;
  decided_by: string | null;
  submission_id: string | null;
  run_id: string | null;
  workflow_runs: { workflows: { name?: string } | null } | null;
};

/** Số phiếu ĐANG chờ chính tôi duyệt — CSDL đếm, không phụ thuộc trang đang tải. */
export async function fetchPendingApprovalCount(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc("approval_pending_count");
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

/**
 * Phiếu được giao cho tôi.
 *   kind "pending" — còn chờ tôi quyết định (lọc NGAY TRONG CSDL, nên 50 dòng
 *     tải về là 50 phiếu chờ thật, không bị phiếu đã xử lý chiếm chỗ như trước);
 *   kind "handled" — tôi đã quyết định rồi.
 */
export async function fetchAssignedTickets(
  supabase: SupabaseClient,
  userId: string,
  kind: "pending" | "handled",
  offset: number,
  nameOf: NameOf,
): Promise<TicketRow[]> {
  let query = supabase
    .from("wf_approval_assignees")
    .select(ASSIGNED_SELECT)
    .eq("user_id", userId)
    // Mốc phụ id: một phiếu giao cho nhiều người sinh nhiều dòng trong CÙNG
    // một câu insert → created_at giống hệt nhau. Thứ tự giữa các dòng trùng
    // mốc không được đảm bảo giống nhau qua hai lần hỏi, nên phân trang kiểu
    // đếm số thứ tự có thể hiện một phiếu hai lần và giấu mất phiếu khác
    // (cùng lớp với việc #167).
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + APPROVALS_PAGE_SIZE - 1);

  query =
    kind === "pending"
      ? query
          .eq("decision", "pending")
          // Phiếu đã bị người cùng cấp chốt thì không còn chờ tôi nữa
          .eq("wf_approval_requests.status", "pending")
      : query.neq("decision", "pending");

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // Nội dung tờ đơn kèm theo (chỉ những phiếu sinh từ biểu mẫu)
  const submissionIds = rows
    .map((a) => (a.wf_approval_requests as unknown as RequestJoin)?.submission_id ?? null)
    .filter((x): x is string => !!x);

  let submissions: SubmissionJoin[] = [];
  if (submissionIds.length > 0) {
    const { data: subs } = await supabase
      .from("wf_form_submissions")
      .select("id, data, fields_snapshot, submitted_by, created_at, wf_forms(name)")
      .in("id", submissionIds);
    submissions = (subs ?? []) as unknown as SubmissionJoin[];
  }
  const subById = new Map(submissions.map((s) => [s.id, s]));

  return rows.map((a) => {
    const r = a.wf_approval_requests as unknown as RequestJoin;
    const sub = r.submission_id ? subById.get(r.submission_id) : undefined;
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      level: r.level,
      totalLevels: r.total_levels,
      status: r.status,
      createdAt: r.created_at,
      decisionNote: r.decision_note,
      myDecision: a.decision as string,
      myDecidedAt: (a.decided_at as string | null) ?? null,
      myNote: (a.note as string | null) ?? null,
      sourceName: sub?.wf_forms?.name ?? r.workflow_runs?.workflows?.name ?? null,
      fromWorkflow: !!r.run_id,
      submitterName: nameOf(sub?.submitted_by),
      fields: sub?.fields_snapshot ?? [],
      data: sub?.data ?? {},
    };
  });
}

/** Yêu cầu do chính tôi gửi đi. */
export async function fetchMyRequests(
  supabase: SupabaseClient,
  userId: string,
  offset: number,
  nameOf: NameOf,
): Promise<MyRequestRow[]> {
  const { data, error } = await supabase
    .from("wf_form_submissions")
    .select(MINE_SELECT)
    .eq("submitted_by", userId)
    // Mốc phụ id — cùng lý do khối trên (việc #167)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + APPROVALS_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);

  return (data ?? []).map((s) => {
    const reqs = (s.wf_approval_requests ?? []) as unknown as {
      level: number;
      total_levels: number;
      status: string;
      decision_note: string | null;
      decided_at: string | null;
      decided_by: string | null;
    }[];
    const latest = [...reqs].sort((a, b) => b.level - a.level)[0];
    return {
      id: s.id as string,
      formName: (s.wf_forms as { name?: string } | null)?.name ?? "",
      createdAt: s.created_at as string,
      status: s.status as string,
      level: latest?.level ?? null,
      totalLevels: latest?.total_levels ?? null,
      decisionNote: latest?.decision_note ?? null,
      deciderName: nameOf(latest?.decided_by),
      fields: (s.fields_snapshot ?? []) as FormField[],
      data: (s.data ?? {}) as Record<string, unknown>,
    };
  });
}

/** Bảng tra user_id → tên hiển thị (RLS profiles chỉ trả đồng nghiệp cùng tenant). */
export async function fetchDisplayNames(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data } = await supabase.from("profiles").select("user_id, display_name");
  return new Map(
    (data ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  );
}
