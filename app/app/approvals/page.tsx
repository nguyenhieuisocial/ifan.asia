import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ApprovalsView, type MyRequestRow, type TicketRow } from "./approvals-view";
import type { FormField } from "../settings/forms/types";

export const dynamic = "force-dynamic";

const LIMIT = 50;

type SubmissionJoin = {
  id: string;
  data: Record<string, unknown> | null;
  fields_snapshot: FormField[] | null;
  submitted_by: string | null;
  created_at: string;
  wf_forms: { name?: string } | null;
};

/**
 * "Duyệt & yêu cầu" — màn hình người quản lý mở nhiều nhất (spec §4.5, rút gọn
 * cho đợt 1): Chờ tôi duyệt / Tôi đã xử lý / Yêu cầu của tôi.
 */
export default async function ApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user?.id ?? "";

  const [{ data: assigned }, { data: mine }, { data: profiles }] = await Promise.all([
    supabase
      .from("wf_approval_assignees")
      .select(
        `decision, decided_at, note,
         wf_approval_requests!inner(
           id, title, body, level, total_levels, status, created_at,
           decision_note, decided_at, decided_by, submission_id, run_id,
           workflow_runs(workflows(name)))`,
      )
      .eq("user_id", me)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("wf_form_submissions")
      .select(
        `id, data, fields_snapshot, created_at, status,
         wf_forms(name),
         wf_approval_requests(level, total_levels, status, decision_note, decided_at, decided_by)`,
      )
      .eq("submitted_by", me)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase.from("profiles").select("user_id, display_name"),
  ]);

  // Dữ liệu phiếu nộp gắn với các phiếu duyệt được giao cho tôi
  const submissionIds = (assigned ?? [])
    .map((a) => {
      const r = a.wf_approval_requests as unknown as { submission_id?: string | null };
      return r?.submission_id ?? null;
    })
    .filter((x): x is string => !!x);

  let submissions: SubmissionJoin[] = [];
  if (submissionIds.length > 0) {
    const { data } = await supabase
      .from("wf_form_submissions")
      .select("id, data, fields_snapshot, submitted_by, created_at, wf_forms(name)")
      .in("id", submissionIds);
    submissions = (data ?? []) as unknown as SubmissionJoin[];
  }
  const subById = new Map(submissions.map((s) => [s.id, s]));

  const displayNames = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  );
  const tOwner = await getTranslations("contacts.owner");
  const nameOf = (id: string | null | undefined) =>
    id ? (displayNames.get(id) ?? tOwner("member", { id: id.slice(0, 8) })) : null;

  const tickets: TicketRow[] = (assigned ?? []).map((a) => {
    const r = a.wf_approval_requests as unknown as {
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

  const myRequests: MyRequestRow[] = (mine ?? []).map((s) => {
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

  return <ApprovalsView tickets={tickets} myRequests={myRequests} />;
}
