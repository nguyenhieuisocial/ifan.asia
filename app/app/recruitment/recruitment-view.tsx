"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronRight,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import {
  CANDIDATE_LIMIT,
  CANDIDATE_STAGES,
  JOB_LIMIT,
  MOVABLE_STAGES,
  type Candidate,
  type ExpiredCandidate,
  type Interview,
  type JobOpening,
  type MemberOption,
} from "./types";
import {
  datLichPhongVan,
  doiCotUngVien,
  doiTrangThaiTinTuyen,
  ghiKetQuaPhongVan,
  loaiUngVien,
  nhanViec,
  taoTinTuyen,
  taoUngVien,
  themGhiChuPhongVan,
  xoaHoSoHetHan,
} from "./actions";

const digitsOnly = (v: string) => v.replace(/\D/g, "");

/**
 * Mọi thất bại đều phải nói ra bằng câu người thường hiểu.
 *
 * `t.has` trước khi `t`: nếu một mã lỗi mới xuất hiện mà chưa ai thêm bản dịch,
 * người dùng sẽ nhận được câu chung chung — chứ KHÔNG phải chuỗi khoá thô kiểu
 * `recruitment.errors.abc_xyz`, thứ không nói cho ai điều gì.
 */
function useBaoLoi() {
  const t = useTranslations("recruitment");
  // Trả về `void` có chủ đích: các nút dùng `return baoLoi(...)` bên trong
  // `startTransition`, mà hàm truyền cho `startTransition` không được trả giá trị.
  return (code: string): void => {
    toast.error(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.chua_luu_duoc"));
  };
}

// ==================== TIN TUYỂN ====================

function NewJobForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("recruitment");
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      const res = await taoTinTuyen({
        title: title.trim(),
        headcount: parseInt(headcount || "1", 10),
        note: note.trim() || null,
      });
      if (res.error) return baoLoi(res.error);
      toast.success(t("jobs.created"));
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">{t("jobs.newTitle")}</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div className="space-y-1.5">
          <Label>{t("jobs.titleField")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("jobs.headcount")}</Label>
          <Input
            type="number"
            min={1}
            max={999}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("jobs.note")}</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !title.trim()}>
          {pending ? t("saving") : t("jobs.save")}
        </Button>
      </div>
    </form>
  );
}

function JobRow({ job, canManage }: { job: JobOpening; canManage: boolean }) {
  const t = useTranslations("recruitment");
  const locale = useLocale() as Locale;
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const res = await doiTrangThaiTinTuyen(job.id, job.status === "open" ? "closed" : "open");
      if (res.error) return baoLoi(res.error);
      toast.success(t("jobs.statusChanged"));
      router.refresh();
    });

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border p-3",
        job.status === "closed" && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{job.title}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>{t("jobs.headcountValue", { n: job.headcount })}</span>
          <span>{t("jobs.openedOn", { date: formatDate(job.openedOn, locale) })}</span>
          <span>{t(job.status === "open" ? "jobs.statusOpen" : "jobs.statusClosed")}</span>
        </div>
        {job.note && <div className="mt-0.5 text-xs text-muted-foreground">{job.note}</div>}
      </div>
      {canManage && (
        <Button size="sm" variant="outline" onClick={toggle} disabled={pending} className="shrink-0">
          {t(job.status === "open" ? "jobs.close" : "jobs.reopen")}
        </Button>
      )}
    </div>
  );
}

// ==================== ỨNG VIÊN MỚI ====================

function NewCandidateForm({ jobs, onDone }: { jobs: JobOpening[]; onDone: () => void }) {
  const t = useTranslations("recruitment");
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [form, setForm] = useState({
    jobOpeningId: "",
    fullName: "",
    phone: "",
    email: "",
    dob: "",
    experienceYears: "",
    salaryMin: "",
    salaryMax: "",
    availableFrom: "",
    source: "",
    note: "",
  });
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!form.fullName.trim()) return;
    startTransition(async () => {
      const res = await taoUngVien({
        jobOpeningId: form.jobOpeningId || null,
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        dob: form.dob || null,
        experienceYears: form.experienceYears ? Number(form.experienceYears) : null,
        expectedSalaryMinVnd: form.salaryMin ? parseInt(digitsOnly(form.salaryMin), 10) : null,
        expectedSalaryMaxVnd: form.salaryMax ? parseInt(digitsOnly(form.salaryMax), 10) : null,
        availableFrom: form.availableFrom || null,
        source: form.source.trim() || null,
        note: form.note.trim() || null,
      });
      if (res.error) return baoLoi(res.error);
      toast.success(t("candidates.created"));
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">{t("candidates.newTitle")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("candidates.fullName")}</Label>
          <Input
            value={form.fullName}
            onChange={(e) => set("fullName")(e.target.value)}
            required
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("candidates.job")}</Label>
          <Select value={form.jobOpeningId} onChange={(e) => set("jobOpeningId")(e.target.value)}>
            <option value="">{t("candidates.noJob")}</option>
            {jobs
              .filter((j) => j.status === "open")
              .map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("candidates.phone")}</Label>
          <Input
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            inputMode="tel"
            maxLength={30}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("candidates.email")}</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            maxLength={160}
          />
          {/* Nói TRƯỚC, không đợi tới lúc bấm "Nhận việc" mới báo thiếu email. */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("candidates.emailHint")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>{t("candidates.experience")}</Label>
          <Input
            type="number"
            min={0}
            max={80}
            step="0.5"
            value={form.experienceYears}
            onChange={(e) => set("experienceYears")(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("candidates.dob")}</Label>
          <Input type="date" value={form.dob} onChange={(e) => set("dob")(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("candidates.salaryMin")}</Label>
          <Input
            value={form.salaryMin}
            onChange={(e) => set("salaryMin")(e.target.value)}
            onBlur={(e) => set("salaryMin")(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("candidates.salaryMax")}</Label>
          <Input
            value={form.salaryMax}
            onChange={(e) => set("salaryMax")(e.target.value)}
            onBlur={(e) => set("salaryMax")(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("candidates.availableFrom")}</Label>
          <Input
            type="date"
            value={form.availableFrom}
            onChange={(e) => set("availableFrom")(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("candidates.source")}</Label>
          <Input
            value={form.source}
            onChange={(e) => set("source")(e.target.value)}
            maxLength={120}
            placeholder={t("candidates.sourcePlaceholder")}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("candidates.note")}</Label>
        <Textarea
          value={form.note}
          onChange={(e) => set("note")(e.target.value)}
          maxLength={1000}
          rows={2}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("candidates.noteHint")}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending || !form.fullName.trim()}>
          {pending ? t("saving") : t("candidates.save")}
        </Button>
      </div>
    </form>
  );
}

// ==================== GHI CHÚ PHỎNG VẤN ====================

/**
 * Khối nhạy cảm nhất của màn này.
 *
 * "Bị chặn" và "chưa ai ghi" đều là danh sách rỗng, nên KHÔNG được vẽ chung một
 * ô trống: người không có quyền phải đọc được đúng câu "bạn không có quyền xem",
 * kèm lý do — nếu không họ sẽ đi hỏi khắp nơi vì sao dữ liệu biến mất.
 */
function NotesBlock({ interview }: { interview: Interview }) {
  const t = useTranslations("recruitment");
  const locale = useLocale() as Locale;
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      const res = await themGhiChuPhongVan(interview.id, body.trim());
      if (res.error) return baoLoi(res.error);
      toast.success(t("interviews.noteAdded"));
      setBody("");
      router.refresh();
    });

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Lock className="size-3.5 text-muted-foreground" />
        {t("interviews.notesTitle")}
      </div>

      {interview.canReadAllNotes ? (
        interview.notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("interviews.notesEmpty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {interview.notes.map((n) => (
              <li key={n.id} className="text-xs leading-relaxed">
                <span className="text-muted-foreground">
                  {formatDateTime(n.createdAt, locale)} —{" "}
                </span>
                {n.body}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-1.5">
          {/* Không có quyền xem TOÀN BỘ. Nhưng ghi chú của CHÍNH MÌNH thì vẫn
              đọc được (RLS cho phép) — nên hiện nốt, kèm lời giải thích rằng
              đây không phải tất cả. */}
          <p className="rounded bg-background/60 p-2 text-xs leading-relaxed text-muted-foreground">
            {t("interviews.notesNoPermission")}
          </p>
          {interview.notes.map((n) => (
            <p key={n.id} className="text-xs leading-relaxed">
              <span className="text-muted-foreground">
                {formatDateTime(n.createdAt, locale)} —{" "}
              </span>
              {n.body}
            </p>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={t("interviews.notePlaceholder")}
          className="text-xs"
        />
        <Button size="sm" onClick={add} disabled={pending || !body.trim()} className="shrink-0">
          {pending ? t("saving") : t("interviews.addNote")}
        </Button>
      </div>
    </div>
  );
}

function InterviewBlock({
  interview,
  canManage,
}: {
  interview: Interview;
  canManage: boolean;
}) {
  const t = useTranslations("recruitment");
  const locale = useLocale() as Locale;
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const ghi = (result: "pass" | "fail" | "hold") =>
    startTransition(async () => {
      const res = await ghiKetQuaPhongVan(interview.id, result);
      if (res.error) return baoLoi(res.error);
      toast.success(t("interviews.resultSaved"));
      router.refresh();
    });

  return (
    <div className="space-y-2 rounded-md border p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium">{formatDateTime(interview.scheduledAt, locale)}</span>
        {interview.interviewerName && (
          <span className="text-muted-foreground">
            {t("interviews.by", { name: interview.interviewerName })}
          </span>
        )}
        {interview.result ? (
          <span className="rounded-full bg-muted px-1.5 py-0.5">
            {t(`interviews.result.${interview.result}`)}
          </span>
        ) : (
          <span className="text-muted-foreground">{t("interviews.noResult")}</span>
        )}
      </div>

      {/* Cờ đỏ — luật 3 ngày do view của CSDL quyết, tầng này chỉ vẽ. */}
      {interview.overdue && (
        <div className="flex items-start gap-1.5 rounded bg-destructive/10 p-2 text-xs leading-relaxed text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("interviews.overdue")}</span>
        </div>
      )}

      {canManage && !interview.result && (
        <div className="flex flex-wrap gap-1.5">
          {(["pass", "hold", "fail"] as const).map((r) => (
            <Button key={r} size="sm" variant="outline" onClick={() => ghi(r)} disabled={pending}>
              {t(`interviews.result.${r}`)}
            </Button>
          ))}
        </div>
      )}

      <NotesBlock interview={interview} />
    </div>
  );
}

// ==================== THẺ ỨNG VIÊN ====================

function CandidateCard({
  candidate,
  members,
  canManage,
}: {
  candidate: Candidate;
  members: MemberOption[];
  canManage: boolean;
}) {
  const t = useTranslations("recruitment");
  const locale = useLocale() as Locale;
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const coCoDo = candidate.interviews.some((i) => i.overdue);

  const chuyenCot = (stage: string) =>
    startTransition(async () => {
      const res = await doiCotUngVien(candidate.id, stage);
      if (res.error) return baoLoi(res.error);
      toast.success(t("candidates.moved"));
      router.refresh();
    });

  const datLich = () =>
    startTransition(async () => {
      const res = await datLichPhongVan({
        candidateId: candidate.id,
        // `datetime-local` trả giờ địa phương → chuyển ISO trước khi gửi.
        scheduledAt: new Date(scheduledAt).toISOString(),
        interviewerUserId: interviewer || null,
      });
      if (res.error) return baoLoi(res.error);
      toast.success(t("interviews.scheduled"));
      setScheduledAt("");
      router.refresh();
    });

  const loai = () =>
    startTransition(async () => {
      const res = await loaiUngVien(candidate.id, rejectReason.trim());
      if (res.error) return baoLoi(res.error);
      toast.success(t("candidates.rejected"));
      setRejectReason("");
      router.refresh();
    });

  /**
   * Nút "Nhận việc" hiện với MỌI người xem được hồ sơ, kể cả người không đủ
   * quyền — cố ý. RPC `candidate_hire` là chốt chặn thật; giấu nút chỉ làm người
   * ta tưởng tính năng không tồn tại. Bấm mà không đủ quyền thì nhận được câu
   * giải thích, chứ không phải một nút không phản hồi.
   */
  const nhan = () =>
    startTransition(async () => {
      const res = await nhanViec(candidate.id, startedOn || null);
      // `!== null` chứ không phải `if (res.error)`: kiểu trả về là hợp của hai
      // nhánh, mà chuỗi rỗng cũng falsy nên phép kiểm truthy KHÔNG tách được
      // nhánh nào đang cầm đường link.
      if (res.error !== null) return baoLoi(res.error);
      setInviteLink(res.link);
      toast.success(t("hire.done"));
      router.refresh();
    });

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 p-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{candidate.fullName}</span>
            {coCoDo && <AlertTriangle className="size-3.5 shrink-0 text-destructive" />}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
            <span>{t("candidates.appliedOn", { date: formatDate(candidate.appliedOn, locale) })}</span>
            {candidate.experienceYears !== null && (
              <span>{t("candidates.experienceValue", { n: candidate.experienceYears })}</span>
            )}
          </div>
          {(candidate.expectedSalaryMinVnd !== null || candidate.expectedSalaryMaxVnd !== null) && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {t("candidates.expected")}:{" "}
              {candidate.expectedSalaryMinVnd !== null
                ? formatMoney(candidate.expectedSalaryMinVnd, locale)
                : "—"}
              {" – "}
              {candidate.expectedSalaryMaxVnd !== null
                ? formatMoney(candidate.expectedSalaryMaxVnd, locale)
                : "—"}
            </div>
          )}
          {candidate.rejectedAt && (
            <div className="mt-0.5 text-[11px] text-destructive">
              {t("candidates.rejectedOn", { date: formatDate(candidate.rejectedAt, locale) })}
              {candidate.rejectReason ? ` — ${candidate.rejectReason}` : ""}
            </div>
          )}
        </div>
        <ChevronRight
          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t p-2.5">
          <div className="grid gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            {candidate.phone && <div>{t("candidates.phone")}: {candidate.phone}</div>}
            <div>
              {t("candidates.email")}:{" "}
              {candidate.email ?? (
                <span className="text-destructive">{t("candidates.emailMissing")}</span>
              )}
            </div>
            {candidate.dob && (
              <div>{t("candidates.dob")}: {formatDate(candidate.dob, locale)}</div>
            )}
            {candidate.availableFrom && (
              <div>
                {t("candidates.availableFrom")}: {formatDate(candidate.availableFrom, locale)}
              </div>
            )}
            {candidate.source && <div>{t("candidates.source")}: {candidate.source}</div>}
          </div>
          {candidate.note && <p className="text-xs italic text-muted-foreground">{candidate.note}</p>}

          {/* ── Chuyển cột ── */}
          {canManage && candidate.stage !== "hired" && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("candidates.moveTo")}</Label>
              <Select
                value={candidate.stage}
                onChange={(e) => chuyenCot(e.target.value)}
                disabled={pending}
              >
                {MOVABLE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(`stages.${s}`)}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("candidates.moveHint")}
              </p>
            </div>
          )}

          {/* ── Phỏng vấn ── */}
          <div className="space-y-2">
            <div className="text-xs font-medium">{t("interviews.title")}</div>
            {candidate.interviews.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("interviews.empty")}</p>
            ) : (
              candidate.interviews.map((i) => (
                <InterviewBlock key={i.id} interview={i} canManage={canManage} />
              ))
            )}

            {canManage && (
              <div className="grid gap-2 rounded-md border border-dashed p-2.5 sm:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1">
                  <Label className="text-xs">{t("interviews.when")}</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("interviews.who")}</Label>
                  <Select value={interviewer} onChange={(e) => setInterviewer(e.target.value)}>
                    <option value="">{t("interviews.whoNone")}</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button size="sm" onClick={datLich} disabled={pending || !scheduledAt}>
                    <Plus className="size-3.5" />
                    {t("interviews.schedule")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Nhận việc ── */}
          {candidate.stage !== "hired" && (
            <div className="space-y-2 rounded-md border p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <UserCheck className="size-3.5" />
                {t("hire.title")}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("hire.explain")}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("hire.startedOn")}</Label>
                  <Input
                    type="date"
                    value={startedOn}
                    onChange={(e) => setStartedOn(e.target.value)}
                  />
                </div>
                <Button size="sm" onClick={nhan} disabled={pending}>
                  {pending ? t("saving") : t("hire.button")}
                </Button>
              </div>
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                {t("hire.roleNote")}
              </p>
              {inviteLink && (
                <div className="space-y-1 rounded bg-muted/40 p-2">
                  <p className="text-[11px] text-muted-foreground">{t("hire.linkHint")}</p>
                  <code className="block break-all text-[11px]">{inviteLink}</code>
                </div>
              )}
            </div>
          )}

          {/* ── Loại hồ sơ ── */}
          {canManage && !candidate.rejectedAt && candidate.stage !== "hired" && (
            <div className="space-y-1.5 rounded-md border p-2.5">
              <Label className="text-xs">{t("candidates.rejectTitle")}</Label>
              <div className="flex gap-2">
                <Input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  maxLength={300}
                  placeholder={t("candidates.rejectPlaceholder")}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loai}
                  disabled={pending}
                  className="shrink-0 text-destructive hover:text-destructive"
                >
                  {t("candidates.reject")}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("candidates.rejectHint")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== HẾT HẠN GIỮ ====================

function ExpiredPanel({ expired }: { expired: ExpiredCandidate[] }) {
  const t = useTranslations("recruitment");
  const locale = useLocale() as Locale;
  const baoLoi = useBaoLoi();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const xoa = (id: string) =>
    startTransition(async () => {
      const res = await xoaHoSoHetHan(id);
      if (res.error) return baoLoi(res.error);
      toast.success(t("expired.deleted"));
      router.refresh();
    });

  return (
    <section className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <h2 className="text-[13px] font-semibold">{t("expired.title", { n: expired.length })}</h2>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("expired.explain")}</p>
      <ul className="space-y-1.5">
        {expired.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate">
              {e.fullName}
              <span className="ml-1.5 text-muted-foreground">
                {t("expired.rejectedOn", { date: formatDate(e.rejectedAt, locale) })}
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => xoa(e.id)}
              disabled={pending}
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              {t("expired.delete")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ==================== MÀN CHÍNH ====================

export default function RecruitmentView({
  jobs,
  candidates,
  members,
  expired,
  canManage,
  loadFailed,
}: {
  jobs: JobOpening[];
  candidates: Candidate[];
  members: MemberOption[];
  expired: ExpiredCandidate[];
  canManage: boolean;
  loadFailed: boolean;
}) {
  const t = useTranslations("recruitment");
  const [showJobForm, setShowJobForm] = useState(false);
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [jobFilter, setJobFilter] = useState("");
  const [showRejected, setShowRejected] = useState(false);

  const hienThi = useMemo(
    () =>
      candidates.filter(
        (c) =>
          (jobFilter === "" || c.jobOpeningId === jobFilter) &&
          (showRejected || c.rejectedAt === null),
      ),
    [candidates, jobFilter, showRejected],
  );

  const soCoDo = useMemo(
    () => hienThi.filter((c) => c.interviews.some((i) => i.overdue)).length,
    [hienThi],
  );

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {t("loadFailed")}
        </p>
      </div>
    );
  }

  // ⚠️ HAI LỚP VÙNG CUỘN — bắt buộc, không phải trang trí.
  // Khung /app cho màn một khung cha CAO CỐ ĐỊNH và cắt phần thừa. Màn nào trả
  // thẳng một khối nội dung (không có lớp cuộn) thì phần dài quá màn hình bị
  // CẮT MẤT và không có cách nào với tới — trên máy tính ít lộ vì màn rộng,
  // trên điện thoại là hỏng hẳn.
  // Đo trên bản thật 19/08, vai chủ tiệm, khổ 390px: form "+ Ứng viên" có 13 ô, 6 ô cuối và nút "Lưu hồ sơ" nằm ngoài vùng nhìn thấy, không cuộn tới được.
  // Khuôn này chép từ các màn đang chạy đúng (Bảng lương, Dự án).
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold">{t("title")}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowJobForm((v) => !v)}>
                  <Plus className="size-3.5" />
                  {t("jobs.new")}
                </Button>
                <Button size="sm" onClick={() => setShowCandidateForm((v) => !v)}>
                  <Plus className="size-3.5" />
                  {t("candidates.new")}
                </Button>
              </div>
            )}
          </div>

          {/* Cờ đỏ tổng — thứ duy nhất đáng đập vào mắt khi vừa mở màn. */}
          {soCoDo > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[13px] leading-relaxed text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{t("overdueBanner", { n: soCoDo })}</span>
            </div>
          )}

          {showJobForm && <NewJobForm onDone={() => setShowJobForm(false)} />}
          {showCandidateForm && (
            <NewCandidateForm jobs={jobs} onDone={() => setShowCandidateForm(false)} />
          )}

          {/* ── Tin tuyển ── */}
          <section className="space-y-2">
            <h2 className="text-[13px] font-semibold">{t("jobs.title")}</h2>
            {jobs.length === 0 ? (
              <p className="rounded-lg border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                {t("jobs.empty")}
              </p>
            ) : (
              <div className="space-y-2">
                {jobs.map((j) => (
                  <JobRow key={j.id} job={j} canManage={canManage} />
                ))}
              </div>
            )}
            {jobs.length >= JOB_LIMIT && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("jobs.limitNote", { limit: JOB_LIMIT })}
              </p>
            )}
          </section>

          {/* ── Bộ lọc ── */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("filter.job")}</Label>
              <Select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
                <option value="">{t("filter.allJobs")}</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={showRejected}
                onChange={(e) => setShowRejected(e.target.checked)}
              />
              {t("filter.showRejected")}
            </label>
          </div>

          {/* ── Bảng 4 cột ── */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CANDIDATE_STAGES.map((stage) => {
              const cot = hienThi.filter((c) => c.stage === stage);
              return (
                <section key={stage} className="space-y-2">
                  <h3 className="flex items-center justify-between text-[13px] font-semibold">
                    <span>{t(`stages.${stage}`)}</span>
                    <span className="text-muted-foreground">{cot.length}</span>
                  </h3>
                  {cot.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">
                      {t("emptyColumn")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {cot.map((c) => (
                        <CandidateCard
                          key={c.id}
                          candidate={c}
                          members={members}
                          canManage={canManage}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {candidates.length >= CANDIDATE_LIMIT && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("candidates.limitNote", { limit: CANDIDATE_LIMIT })}
            </p>
          )}

          {expired.length > 0 && <ExpiredPanel expired={expired} />}
        </div>
      </div>
    </div>
  );
}
