"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { luuHoSoNhanSu, noiHoSoVoiTaiKhoan } from "./actions";
import { EMPLOYEE_LIST_LIMIT, type Employee } from "./queries";
import { toastKeyFor } from "./toast-keys";

const digitsOnly = (v: string) => v.replace(/\D/g, "");
const toInt = (v: string) => parseInt(v.replace(/\D/g, "") || "0", 10);

type Draft = {
  id: string | null;
  fullName: string;
  phone: string;
  startedOn: string;
  endedOn: string;
  payType: "monthly" | "daily" | "hourly";
  baseSalary: string;
  dailyRate: string;
  hourlyRate: string;
  overtimeRate: string;
  annualLeave: string;
  note: string;
};

function draftTu(e: Employee | null): Draft {
  return {
    id: e?.id ?? null,
    fullName: e?.fullName ?? "",
    phone: e?.phone ?? "",
    startedOn: e?.startedOn ?? new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10),
    endedOn: e?.endedOn ?? "",
    payType: e?.payType ?? "monthly",
    baseSalary: String(e?.baseSalaryVnd ?? 0),
    dailyRate: String(e?.dailyRateVnd ?? 0),
    hourlyRate: String(e?.hourlyRateVnd ?? 0),
    overtimeRate: String(e?.overtimeRateVnd ?? 0),
    annualLeave: String(e?.annualLeaveDays ?? 12),
    note: e?.note ?? "",
  };
}

/**
 * Hồ sơ nhân sự — TÁCH khỏi "Nhân viên" ở Cài đặt (điểm 3 của migration #166):
 * ở đó là QUYỀN TRUY CẬP phần mềm, ở đây là THÔNG TIN LAO ĐỘNG (ngày vào, lương
 * cứng, quỹ phép). Người chưa có tài khoản vẫn phải có hồ sơ.
 */
export function PeoplePanel({
  employees,
  members,
  phepDaDung,
}: {
  employees: Employee[];
  members: { userId: string; displayName: string }[];
  /**
   * #250 — ngày phép năm đã dùng theo id hồ sơ. `null` = chưa tra được.
   * Tab này chỉ owner/admin vào được nên hạn mức luôn đọc được ⇒ hiện đủ
   * "còn / hạn mức", không rơi vào nhánh nửa-đúng như bên tab Nghỉ phép.
   */
  phepDaDung: Record<string, number> | null;
}) {
  const t = useTranslations("hr");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();

  const daNoi = new Set(employees.map((e) => e.userId).filter(Boolean) as string[]);

  function luu() {
    if (!draft) return;
    startTransition(async () => {
      const res = await luuHoSoNhanSu({
        id: draft.id,
        fullName: draft.fullName.trim(),
        phone: draft.phone.trim() || null,
        startedOn: draft.startedOn,
        endedOn: draft.endedOn || null,
        payType: draft.payType,
        baseSalaryVnd: toInt(draft.baseSalary),
        dailyRateVnd: toInt(draft.dailyRate),
        hourlyRateVnd: toInt(draft.hourlyRate),
        overtimeRateVnd: toInt(draft.overtimeRate),
        annualLeaveDays: toInt(draft.annualLeave),
        note: draft.note.trim() || null,
      });
      if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
      else {
        toast.success(t("toasts.saved"));
        setDraft(null);
        router.refresh();
      }
    });
  }

  function noiTaiKhoan(employeeId: string, userId: string) {
    startTransition(async () => {
      const res = await noiHoSoVoiTaiKhoan({ employeeId, userId: userId || null });
      if (res.error) toast.error(t(`toasts.${toastKeyFor(res.error)}`));
      else {
        toast.success(t("toasts.saved"));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">{t("people.description")}</p>
        {!draft && (
          <Button size="sm" onClick={() => setDraft(draftTu(null))}>
            <Plus className="mr-1 size-4" />
            {t("people.add")}
          </Button>
        )}
      </div>

      {draft && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <h4 className="text-sm font-semibold">
            {draft.id ? t("people.editTitle") : t("people.addTitle")}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("people.fullName")}</Label>
              <Input
                value={draft.fullName}
                onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("people.phone")}</Label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                maxLength={30}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("people.startedOn")}</Label>
              <Input
                type="date"
                value={draft.startedOn}
                onChange={(e) => setDraft({ ...draft, startedOn: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("people.endedOn")}</Label>
              <Input
                type="date"
                value={draft.endedOn}
                onChange={(e) => setDraft({ ...draft, endedOn: e.target.value })}
              />
              {/*
                #280 — ghi ngày nghỉ là CẮT QUYỀN vào phần mềm, ngay khi tới ngày
                đó. Việc cắt do chính cơ sở dữ liệu làm nên không có cách nào
                lách; vì vậy màn hình phải nói TRƯỚC, không để người ta phát
                hiện sau. Chỉ nói khi hồ sơ này thật sự có tài khoản đăng nhập
                — người chưa nối tài khoản thì chẳng có quyền nào để mất, câu
                cảnh báo lúc đó là nhiễu.
              */}
              {draft.endedOn && employees.find((e) => e.id === draft.id)?.userId && (
                <p className="rounded-md bg-amber-500/10 p-2 text-[13px] text-amber-700 dark:text-amber-400">
                  {t("people.endedRevokesAccess")}
                </p>
              )}
            </div>
            {/*
              #284 — cách trả lương cứng. Trước bản này chỉ có lương tháng, nên
              tiệm trả theo công ngày phải sửa tay từng phiếu mỗi tháng. Ô đơn
              giá đổi theo kiểu đã chọn: hiện cả ba cùng lúc chỉ làm người nhập
              phân vân không biết ô nào mới là ô có tác dụng.
            */}
            <div className="space-y-1.5">
              <Label>{t("people.payType")}</Label>
              <Select
                value={draft.payType}
                onChange={(e) =>
                  setDraft({ ...draft, payType: e.target.value as Draft["payType"] })
                }
              >
                <option value="monthly">{t("people.payTypeMonthly")}</option>
                <option value="daily">{t("people.payTypeDaily")}</option>
                <option value="hourly">{t("people.payTypeHourly")}</option>
              </Select>
              <p className="text-xs text-muted-foreground">{t("people.payTypeHint")}</p>
            </div>
            {draft.payType === "monthly" && (
              <div className="space-y-1.5">
                <Label>{t("people.baseSalary")}</Label>
                <Input
                  value={draft.baseSalary}
                  inputMode="numeric"
                  onChange={(e) => setDraft({ ...draft, baseSalary: e.target.value })}
                  onBlur={(e) => setDraft({ ...draft, baseSalary: digitsOnly(e.target.value) })}
                />
              </div>
            )}
            {draft.payType === "daily" && (
              <div className="space-y-1.5">
                <Label>{t("people.dailyRate")}</Label>
                <Input
                  value={draft.dailyRate}
                  inputMode="numeric"
                  onChange={(e) => setDraft({ ...draft, dailyRate: e.target.value })}
                  onBlur={(e) => setDraft({ ...draft, dailyRate: digitsOnly(e.target.value) })}
                />
              </div>
            )}
            {draft.payType === "hourly" && (
              <div className="space-y-1.5">
                <Label>{t("people.hourlyRate")}</Label>
                <Input
                  value={draft.hourlyRate}
                  inputMode="numeric"
                  onChange={(e) => setDraft({ ...draft, hourlyRate: e.target.value })}
                  onBlur={(e) => setDraft({ ...draft, hourlyRate: digitsOnly(e.target.value) })}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t("people.overtimeRate")}</Label>
              <Input
                value={draft.overtimeRate}
                inputMode="numeric"
                onChange={(e) => setDraft({ ...draft, overtimeRate: e.target.value })}
                onBlur={(e) => setDraft({ ...draft, overtimeRate: digitsOnly(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("people.annualLeave")}</Label>
              <Input
                value={draft.annualLeave}
                inputMode="numeric"
                onChange={(e) => setDraft({ ...draft, annualLeave: e.target.value })}
                onBlur={(e) => setDraft({ ...draft, annualLeave: digitsOnly(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("people.note")}</Label>
            <Textarea
              value={draft.note}
              rows={2}
              maxLength={500}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button onClick={luu} disabled={pending || draft.fullName.trim().length === 0}>
              {pending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      )}

      {employees.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-[13px] text-muted-foreground">
          {t("people.empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {employees.map((e) => (
            <li key={e.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {e.fullName}
                    {e.endedOn && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {t("people.ended", { date: formatDate(e.endedOn, locale) })}
                      </span>
                    )}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {t("people.since", { date: formatDate(e.startedOn, locale) })}
                    {e.phone ? ` · ${e.phone}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatMoney(e.baseSalaryVnd, locale)}
                  </p>
                  {/* #250 — khoá `people.leaveLeft` ("còn lại") trước đây in
                      HẠN MỨC ĐƯỢC CẤP, chưa trừ ngày nào. Nay trừ thật; chưa
                      tra được thì đổi câu chứ không im lặng in hạn mức. */}
                  <p className="text-xs text-muted-foreground">
                    {phepDaDung
                      ? t("people.leaveLeft", {
                          left: Math.max(0, e.annualLeaveDays - (phepDaDung[e.id] ?? 0)),
                          total: e.annualLeaveDays,
                        })
                      : t("people.leaveQuotaOnly", { n: e.annualLeaveDays })}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setDraft(draftTu(e))}>
                  {t("people.edit")}
                </Button>
                <div className="flex items-center gap-1.5">
                  <UserPlus className="size-3.5 text-muted-foreground" />
                  <Select
                    className="h-8 w-48 text-xs"
                    value={e.userId ?? ""}
                    disabled={pending}
                    onChange={(ev) => noiTaiKhoan(e.id, ev.target.value)}
                  >
                    <option value="">{t("people.noAccount")}</option>
                    {members
                      .filter((m) => m.userId === e.userId || !daNoi.has(m.userId))
                      .map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.displayName}
                        </option>
                      ))}
                  </Select>
                </div>
              </div>
              {/*
                #214 (20/08): cảnh báo đỏ "chưa nối tài khoản = hoa hồng 0đ" của
                #210 đã GỠ vì gốc được vá — appointments + commission_sinh_cho_don
                giờ nhận diện người qua employees.id (không còn bắt buộc user_id),
                nên thợ KHÔNG có tài khoản vẫn xếp lịch + tính hoa hồng bình
                thường. Không nối tài khoản chỉ còn nghĩa "người này không đăng
                nhập app" — đúng chủ đích, không phải lỗi, nên không nhắc nữa.
              */}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">{t("people.linkHint")}</p>
      {employees.length >= EMPLOYEE_LIST_LIMIT && (
        <p className="text-xs text-muted-foreground">
          {t("people.limitNote", { n: EMPLOYEE_LIST_LIMIT })}
        </p>
      )}
    </div>
  );
}
