/**
 * Kiểu + hằng số dùng chung cho màn Tuyển dụng (V8, migration #170).
 *
 * Tách khỏi `actions.ts` vì file đó mang directive "use server" — chỉ được
 * export async function (cổng `scripts/soat-use-server-exports.mjs`).
 */

/** ĐÚNG 4 giá trị, khớp check constraint `candidates.stage`. */
export const CANDIDATE_STAGES = [
  "applied",
  "interview_scheduled",
  "probation",
  "hired",
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

/**
 * Cột "Nhận việc" CỐ Ý không nằm trong ô chọn chuyển cột.
 *
 * Vào cột đó phải đi qua nút "Nhận việc" (RPC `candidate_hire`), vì bước ấy còn
 * tạo hồ sơ nhân sự và gửi lời mời trong CÙNG một transaction. Cho kéo tay sang
 * 'hired' là đẻ ra một người "đã nhận việc" mà không có hồ sơ nhân sự nào và
 * không ai mời được vào phần mềm — hỏng lặng lẽ, đúng kiểu khó phát hiện nhất.
 */
export const MOVABLE_STAGES = ["applied", "interview_scheduled", "probation"] as const;
export type MovableStage = (typeof MOVABLE_STAGES)[number];

export const INTERVIEW_RESULTS = ["pass", "fail", "hold"] as const;
export type InterviewResult = (typeof INTERVIEW_RESULTS)[number];

/** Trần danh sách — chạm trần thì màn hình PHẢI nói ra (xem `limitNote`). */
export const JOB_LIMIT = 100;
export const CANDIDATE_LIMIT = 300;
export const EXPIRED_LIMIT = 100;

export type JobOpening = {
  id: string;
  title: string;
  headcount: number;
  openedOn: string;
  status: "open" | "closed";
  note: string | null;
};

export type InterviewNote = {
  id: string;
  body: string;
  createdAt: string;
  interviewerUserId: string;
};

export type Interview = {
  id: string;
  scheduledAt: string;
  interviewerUserId: string | null;
  interviewerName: string | null;
  result: InterviewResult | null;
  resultAt: string | null;
  /**
   * Cờ đỏ "quá 3 ngày chưa ghi kết quả". Lấy từ view
   * `interviews_qua_han_ghi_ket_qua` chứ KHÔNG tính lại bằng JavaScript — luật
   * 3 ngày chỉ được có một chỗ định nghĩa, nếu không hai chỗ sẽ lệch nhau đúng
   * vào lúc ai đó sửa một bên.
   */
  overdue: boolean;
  /**
   * Người đang xem có được đọc TOÀN BỘ ghi chú của buổi này không.
   *
   * RLS `interview_notes` chỉ mở cho NGƯỜI PHỎNG VẤN và CHỦ TIỆM — quản trị
   * viên cũng KHÔNG đọc được (điểm 2 của migration #170). Người khác vẫn tự ghi
   * được ghi chú của MÌNH và đọc lại đúng cái đó, nên `notes` bên dưới có thể
   * không rỗng dù cờ này là false.
   *
   * Cần cờ riêng vì "bị chặn" và "chưa ai ghi" đều trả về danh sách rỗng: không
   * có cờ này thì màn hình hiện một ô trống bí ẩn và người dùng tưởng máy hỏng.
   */
  canReadAllNotes: boolean;
  /** Ghi chú ĐỌC ĐƯỢC (RLS đã lọc) — không phải toàn bộ ghi chú của buổi. */
  notes: InterviewNote[];
};

export type Candidate = {
  id: string;
  jobOpeningId: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  experienceYears: number | null;
  expectedSalaryMinVnd: number | null;
  expectedSalaryMaxVnd: number | null;
  availableFrom: string | null;
  source: string | null;
  appliedOn: string;
  stage: CandidateStage;
  rejectedAt: string | null;
  rejectReason: string | null;
  note: string | null;
  interviews: Interview[];
};

export type MemberOption = {
  userId: string;
  name: string;
};

/** Hồ sơ bị loại đã quá hạn giữ 12 tháng — view `candidates_het_han_giu`. */
export type ExpiredCandidate = {
  id: string;
  fullName: string;
  rejectedAt: string;
};

export type RecruitmentData = {
  jobs: JobOpening[];
  candidates: Candidate[];
  members: MemberOption[];
  expired: ExpiredCandidate[];
};
