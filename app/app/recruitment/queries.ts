import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CANDIDATE_LIMIT,
  EXPIRED_LIMIT,
  JOB_LIMIT,
  type Candidate,
  type CandidateStage,
  type ExpiredCandidate,
  type Interview,
  type InterviewResult,
  type JobOpening,
  type MemberOption,
  type RecruitmentData,
} from "./types";

/**
 * Đọc dữ liệu cho màn Tuyển dụng (V8, migration #170).
 *
 * BA LUẬT của phần đọc này, viết ở đây để người sau không phá:
 *
 *  1. CỜ ĐỎ "quá 3 ngày chưa ghi kết quả" đọc từ view
 *     `interviews_qua_han_ghi_ket_qua`, KHÔNG tính lại bằng JavaScript. Migration
 *     #170 đã ghi rõ: mốc 3 ngày là DẪN XUẤT, tính lúc đọc, và chỉ có đúng một
 *     chỗ định nghĩa. Copy công thức sang tầng web là tạo ra sự thật thứ hai.
 *
 *  2. GHI CHÚ PHỎNG VẤN: RLS chặn cả quản trị viên, mà "bị chặn" trả về danh
 *     sách rỗng y hệt "chưa ai ghi". Nên phải TỰ SUY ra quyền đọc (`canReadNotes`)
 *     từ vai + danh tính người phỏng vấn, rồi đưa cờ đó ra màn hình. Không có cờ
 *     này thì người dùng nhìn thấy một ô trống và tưởng dữ liệu mất.
 *
 *  3. ĐỌC HỎNG PHẢI NÉM, không nuốt thành danh sách rỗng. Bảng tuyển dụng rỗng
 *     nghĩa là "chưa ai nộp hồ sơ" — nếu đó thật ra là lỗi mạng thì chủ tiệm sẽ
 *     đi đăng lại tin tuyển trong khi hồ sơ vẫn nằm nguyên trong CSDL.
 *     (RLS chặn KHÔNG phải lỗi: nhân viên phỏng vấn đọc `job_openings` ra rỗng
 *     là đúng luật, PostgREST trả 200 kèm mảng rỗng chứ không trả lỗi.)
 */
export async function layBangTuyenDung(
  supabase: SupabaseClient,
  viewer: { userId: string; role: string },
): Promise<RecruitmentData> {
  const [jobRes, candRes, quaHanRes, ghiChuRes, memberRes, profileRes, expiredRes] =
    await Promise.all([
      supabase
        .from("job_openings")
        .select("id, title, headcount, opened_on, status, note")
        .order("opened_on", { ascending: false })
        .limit(JOB_LIMIT),
      supabase
        .from("candidates")
        .select(
          `id, job_opening_id, full_name, phone, email, dob, experience_years,
           expected_salary_min_vnd, expected_salary_max_vnd, available_from, source,
           applied_on, stage, rejected_at, reject_reason, note,
           interviews(id, scheduled_at, interviewer_user_id, result, result_at)`,
        )
        .order("applied_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(CANDIDATE_LIMIT),
      // Luật 1: mốc 3 ngày nằm trong view, không nằm ở đây.
      supabase.from("interviews_qua_han_ghi_ket_qua").select("id"),
      // RLS tự lọc: chỉ về ghi chú của chính mình (hoặc tất cả, nếu là chủ tiệm).
      supabase
        .from("interview_notes")
        .select("id, interview_id, interviewer_user_id, body, created_at")
        .order("created_at", { ascending: true }),
      // KHÔNG embed `profiles(display_name)` vào `tenant_members`: không có FK
      // trực tiếp giữa hai bảng, PostgREST trả lỗi "no relationship found" và
      // danh sách người phỏng vấn rỗng trong im lặng (đã dính ở màn Lịch hẹn).
      supabase.from("tenant_members").select("user_id, role, status").eq("status", "active"),
      supabase.from("profiles").select("user_id, display_name"),
      supabase
        .from("candidates_het_han_giu")
        .select("id, full_name, rejected_at")
        .order("rejected_at", { ascending: true })
        .limit(EXPIRED_LIMIT),
    ]);

  // Luật 3 — nói tên từng thứ đọc hỏng, để trang lỗi không chỉ nói "có gì đó sai".
  for (const [ten, res] of [
    ["tin tuyển", jobRes],
    ["hồ sơ ứng viên", candRes],
    ["buổi phỏng vấn quá hạn", quaHanRes],
    ["ghi chú phỏng vấn", ghiChuRes],
    ["danh sách nhân sự", memberRes],
    ["hồ sơ hết hạn giữ", expiredRes],
  ] as const) {
    if (res.error) throw new Error(`Không đọc được ${ten}: ${res.error.message}`);
  }

  const tenTheoUser = new Map<string, string>();
  for (const p of profileRes.data ?? []) {
    const ten = (p.display_name as string | null)?.trim();
    if (ten) tenTheoUser.set(p.user_id as string, ten);
  }

  const members: MemberOption[] = (memberRes.data ?? []).map((m) => ({
    userId: m.user_id as string,
    // Chưa đặt tên hiển thị thì vẫn phải chọn được — hiện mã ngắn còn hơn hiện
    // một dòng trống không bấm được.
    name: tenTheoUser.get(m.user_id as string) ?? `#${String(m.user_id).slice(0, 8)}`,
  }));

  const quaHan = new Set((quaHanRes.data ?? []).map((r) => r.id as string));

  const ghiChuTheoBuoi = new Map<string, Interview["notes"]>();
  for (const g of ghiChuRes.data ?? []) {
    const key = g.interview_id as string;
    const arr = ghiChuTheoBuoi.get(key) ?? [];
    arr.push({
      id: g.id as string,
      body: g.body as string,
      createdAt: g.created_at as string,
      interviewerUserId: g.interviewer_user_id as string,
    });
    ghiChuTheoBuoi.set(key, arr);
  }

  const jobs: JobOpening[] = (jobRes.data ?? []).map((j) => ({
    id: j.id as string,
    title: j.title as string,
    headcount: Number(j.headcount),
    openedOn: j.opened_on as string,
    status: j.status as JobOpening["status"],
    note: (j.note as string | null) ?? null,
  }));

  const candidates: Candidate[] = (candRes.data ?? []).map((c) => {
    const buoi = (c.interviews ?? []) as {
      id: string;
      scheduled_at: string;
      interviewer_user_id: string | null;
      result: string | null;
      result_at: string | null;
    }[];
    return {
      id: c.id as string,
      jobOpeningId: (c.job_opening_id as string | null) ?? null,
      fullName: c.full_name as string,
      phone: (c.phone as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      dob: (c.dob as string | null) ?? null,
      experienceYears: c.experience_years === null ? null : Number(c.experience_years),
      expectedSalaryMinVnd:
        c.expected_salary_min_vnd === null ? null : Number(c.expected_salary_min_vnd),
      expectedSalaryMaxVnd:
        c.expected_salary_max_vnd === null ? null : Number(c.expected_salary_max_vnd),
      availableFrom: (c.available_from as string | null) ?? null,
      source: (c.source as string | null) ?? null,
      appliedOn: c.applied_on as string,
      stage: c.stage as CandidateStage,
      rejectedAt: (c.rejected_at as string | null) ?? null,
      rejectReason: (c.reject_reason as string | null) ?? null,
      note: (c.note as string | null) ?? null,
      interviews: buoi
        .map((b) => ({
          id: b.id,
          scheduledAt: b.scheduled_at,
          interviewerUserId: b.interviewer_user_id,
          interviewerName: b.interviewer_user_id
            ? (tenTheoUser.get(b.interviewer_user_id) ?? null)
            : null,
          result: (b.result as InterviewResult | null) ?? null,
          resultAt: b.result_at,
          overdue: quaHan.has(b.id),
          // Luật 2 — quyền đọc ghi chú suy từ VAI + DANH TÍNH, không suy từ
          // "truy vấn có trả về dòng nào không".
          canReadAllNotes:
            viewer.role === "owner" || b.interviewer_user_id === viewer.userId,
          notes: ghiChuTheoBuoi.get(b.id) ?? [],
        }))
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    };
  });

  const expired: ExpiredCandidate[] = (expiredRes.data ?? []).map((e) => ({
    id: e.id as string,
    fullName: e.full_name as string,
    rejectedAt: e.rejected_at as string,
  }));

  return { jobs, candidates, members, expired };
}
