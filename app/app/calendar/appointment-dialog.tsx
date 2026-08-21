"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  addMinutesToLocalTime,
  buildZonedIso,
  dateKeyInTimeZone,
  minutesOfDayInTimeZone,
} from "@/lib/booking/schedule";
import { searchContactOptions } from "../deals/queries";
import type { ContactOption } from "../deals/types";
import { checkAppointmentHours, createAppointment, updateAppointment } from "./actions";
import { toastKeyFor, type Appointment, type CalendarBundle } from "./types";

/** Ô chọn khách — nguyên khuôn `ContactPicker` của màn Cơ hội (đừng viết lại combobox thứ hai). */
function ContactPicker({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (v: { id: string; name: string } | null) => void;
}) {
  const t = useTranslations("calendar.dialog");
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const optionsQuery = useQuery({
    queryKey: ["calendar-contact-options", debouncedQ],
    queryFn: () => searchContactOptions(supabase, debouncedQ),
    enabled: value === null,
  });
  const options: ContactOption[] = optionsQuery.data ?? [];
  const loading = optionsQuery.isPending;

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input px-3 text-sm max-md:h-11">
        <span className="truncate">{value.name}</span>
        {/* Chữ "Đổi" là NÚT — cao bằng cả ô để ngón tay với tới (44px). */}
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-primary hover:underline max-md:flex max-md:h-11 max-md:items-center"
          onClick={() => onChange(null)}
        >
          {t("contactChange")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("contactSearchPlaceholder")}
          className="pl-8"
          autoFocus
        />
      </div>
      <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
        {/* Nhánh isError phải đứng TRƯỚC nhánh rỗng: hàm tìm ném lỗi → data
            undefined → options rỗng → nếu không tách thì hiện y hệt câu "không
            tìm thấy", người dùng tưởng tiệm chưa có khách đó. Cùng lớp lỗi im
            lặng với việc #166. */}
        {loading && options.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">{t("contactLoading")}</li>
        ) : optionsQuery.isError ? (
          <li className="px-3 py-2 text-xs text-destructive">{t("contactSearchFailed")}</li>
        ) : options.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">{t("contactEmpty")}</li>
        ) : (
          options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onChange({ id: o.id, name: o.full_name })}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 max-md:min-h-11"
              >
                <span className="truncate">{o.full_name}</span>
                {o.phone && <span className="shrink-0 text-xs text-muted-foreground">{o.phone}</span>}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** Câu cảnh báo ĐỌC ĐƯỢC từ mã `reason` mà `appointment_hours_warning()` trả — KHÔNG chặn lưu (ADR-0009 mục 8). */
function warningLabel(t: (key: string) => string, warning: Awaited<ReturnType<typeof checkAppointmentHours>>): string | null {
  if (warning.ok === null || warning.ok === true) {
    if (warning.ok === true && "reason" in warning && warning.reason === "hours_not_set") return t("warnHoursNotSet");
    return null;
  }
  switch (warning.reason) {
    case "crosses_midnight":
      return t("warnCrossesMidnight");
    case "closure":
      return t("warnClosure").replace("{reason}", warning.closureReason ?? "");
    case "closure_hours":
      return t("warnClosureHours")
        .replace("{reason}", warning.closureReason ?? "")
        .replace("{open}", warning.openTime ?? "")
        .replace("{close}", warning.closeTime ?? "");
    case "day_closed":
      return t("warnDayClosed");
    case "outside_hours":
      return t("warnOutsideHours");
    default:
      return null;
  }
}

/**
 * (ngày, giờ bắt đầu, số phút) của một lịch ĐANG CÓ, đọc theo múi giờ TIỆM —
 * đúng ba ô mà form đang dùng.
 *
 * Thời lượng tính bằng HIỆU HAI MỐC tuyệt đối, không trừ "phút trong ngày": ca
 * vắt qua nửa đêm cho ra số âm, và ngày đổi giờ (DST) cho ra số lệch 60 phút —
 * cùng loại lỗi trộn giờ địa phương đã cắn mặt tiền 12/08.
 */
function startPartsInTimeZone(
  appt: Appointment,
  timezone: string,
): { dateKey: string; time: string; durationMinutes: number } {
  const minutes = minutesOfDayInTimeZone(appt.startAt, timezone);
  return {
    dateKey: dateKeyInTimeZone(appt.startAt, timezone),
    time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    durationMinutes: Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60_000),
  };
}

export function AppointmentDialog({
  open,
  onOpenChange,
  bundle,
  defaultDateKey,
  defaultTime,
  defaultStaffEmployeeId,
  currentUserId,
  canAssignOthers,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: CalendarBundle;
  defaultDateKey: string;
  /** Giờ điền sẵn khi mở từ một ô trống trên lưới, dạng "HH:MM". */
  defaultTime?: string;
  defaultStaffEmployeeId?: string;
  currentUserId: string;
  canAssignOthers: boolean;
  /** Có = mở ở chế độ SỬA lịch này. Không có = thêm lịch mới. Một form duy nhất cho cả hai — hai form song song là mầm lệch nhau. */
  initial?: Appointment | null;
}) {
  const t = useTranslations("calendar.dialog");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? t("editTitle") : t("title")}</DialogTitle>
          <DialogDescription>{initial ? t("editDescription") : t("description")}</DialogDescription>
        </DialogHeader>
        {/* Radix Dialog UNMOUNT nội dung khi đóng (không `forceMount`) — tách state
            vào component con riêng để mỗi lần mở là một lần mount MỚI, state tự
            reset mà không cần effect (khuôn `DealFormDialog`/`DealForm`). */}
        <AppointmentForm
          bundle={bundle}
          defaultDateKey={defaultDateKey}
          defaultTime={defaultTime}
          defaultStaffEmployeeId={defaultStaffEmployeeId}
          currentUserId={currentUserId}
          canAssignOthers={canAssignOthers}
          initial={initial ?? null}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AppointmentForm({
  bundle,
  defaultDateKey,
  defaultTime,
  defaultStaffEmployeeId,
  currentUserId,
  canAssignOthers,
  initial,
  onDone,
}: {
  bundle: CalendarBundle;
  defaultDateKey: string;
  /** Giờ điền sẵn khi mở từ một ô trống trên lưới, dạng "HH:MM". */
  defaultTime?: string;
  defaultStaffEmployeeId?: string;
  currentUserId: string;
  canAssignOthers: boolean;
  initial: Appointment | null;
  onDone: () => void;
}) {
  const t = useTranslations("calendar.dialog");
  const tError = useTranslations("calendar.error");
  const [pending, startTransition] = useTransition();

  // Chế độ SỬA: rót giá trị đang có làm state ban đầu. Không cần effect đồng bộ
  // — Radix unmount nội dung khi đóng nên mỗi lần mở là một lần mount MỚI.
  const start = initial ? startPartsInTimeZone(initial, bundle.timezone) : null;

  const [contact, setContact] = useState<{ id: string; name: string } | null>(
    initial ? { id: initial.contactId, name: initial.contactName } : null,
  );
  // #214: người làm ca định danh bằng employeeId (thợ có thể không có tài khoản).
  const myEmployeeId = bundle.staff.find((s) => s.userId === currentUserId)?.employeeId ?? "";
  const [staffEmployeeId, setStaffEmployeeId] = useState(
    initial?.staffEmployeeId ?? defaultStaffEmployeeId ?? (canAssignOthers ? "" : myEmployeeId),
  );
  const [serviceId, setServiceId] = useState(initial?.serviceId ?? "");
  const [resourceId, setResourceId] = useState(initial?.resourceId ?? "");
  const [dateKey, setDateKey] = useState(start?.dateKey ?? defaultDateKey);
  // `defaultTime` = giờ ô trống vừa bấm trên lưới. Không có thì 09:00 như cũ.
  const [time, setTime] = useState(start?.time ?? defaultTime ?? "09:00");
  const [durationMinutes, setDurationMinutes] = useState(start?.durationMinutes ?? 30);
  const [priceVnd, setPriceVnd] = useState(initial?.priceVnd ?? 0);
  const [note, setNote] = useState(initial?.note ?? "");
  const [warning, setWarning] = useState<Awaited<ReturnType<typeof checkAppointmentHours>> | null>(null);

  /** (startAt, endAt) dạng ISO với offset THẬT của `bundle.timezone` — dùng chung cho preview cảnh báo lẫn lúc lưu. */
  const { startAt, endAt } = useMemo(() => {
    const end = addMinutesToLocalTime(dateKey, time, durationMinutes);
    return {
      startAt: buildZonedIso(dateKey, time, bundle.timezone),
      endAt: buildZonedIso(end.dateKey, end.time, bundle.timezone),
    };
  }, [dateKey, time, durationMinutes, bundle.timezone]);

  const endTimeLabel = useMemo(() => {
    const end = addMinutesToLocalTime(dateKey, time, durationMinutes);
    return end.dateKey === dateKey ? end.time : `${end.time} (${t("nextDay")})`;
  }, [dateKey, time, durationMinutes, t]);

  // Cảnh báo TRƯỚC khi lưu (ADR-0009 mục 8) — chạy lại mỗi khi đổi giờ, không đợi bấm Lưu mới biết.
  // Component này chỉ MOUNT khi dialog đang mở (Radix unmount khi đóng), nên
  // không cần điều kiện `open` — có mặt tức là đang mở.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      const w = await checkAppointmentHours(startAt, endAt);
      if (!cancelled) setWarning(w);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [startAt, endAt]);

  const canSubmit = contact !== null && staffEmployeeId !== "" && dateKey !== "" && time !== "" && durationMinutes > 0;

  function handleServiceChange(id: string) {
    setServiceId(id);
    const svc = bundle.services.find((s) => s.id === id);
    if (svc) setDurationMinutes(svc.durationMinutes);
  }

  function handleSubmit() {
    if (!contact) return;
    startTransition(async () => {
      const chung = {
        contactId: contact.id,
        staffEmployeeId,
        resourceId: resourceId || null,
        serviceId: serviceId || null,
        startAt,
        endAt,
        priceVnd,
        note: note.trim() || null,
      };
      // `source` chỉ ghi LÚC TẠO — nó nói lịch này ĐẾN TỪ ĐÂU, sửa sau không
      // đổi được sự thật đó (ADR-0009 mục 7 việc 5 đo hiệu quả cửa vào).
      const res = initial
        ? await updateAppointment({ id: initial.id, ...chung })
        : await createAppointment({ ...chung, source: "calendar" });
      if (res.error) {
        toast.error(tError(toastKeyFor(res.error)));
        return;
      }
      toast.success(initial ? t("updated") : t("saved"));
      onDone();
    });
  }

  return (
    <>
      <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>
              {t("contactLabel")} <span className="text-destructive">*</span>
            </Label>
            <ContactPicker value={contact} onChange={setContact} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("serviceLabel")}</Label>
            <Select value={serviceId} onChange={(e) => handleServiceChange(e.target.value)}>
              <option value="">{t("serviceNone")}</option>
              {bundle.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMinutes}′
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                {t("staffLabel")} <span className="text-destructive">*</span>
              </Label>
              {canAssignOthers ? (
                <Select value={staffEmployeeId} onChange={(e) => setStaffEmployeeId(e.target.value)}>
                  <option value="">{t("staffChoose")}</option>
                  {bundle.staff.map((s) => (
                    <option key={s.employeeId} value={s.employeeId}>
                      {s.displayName}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
                  {bundle.staff.find((s) => s.userId === currentUserId)?.displayName ?? t("staffYou")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("resourceLabel")}</Label>
              <Select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
                <option value="">{t("resourceNone")}</option>
                {bundle.resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("dateLabel")}</Label>
              <Input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("timeLabel")}</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("durationLabel")}</Label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("endsAt")} {endTimeLabel}
          </p>

          <div className="space-y-1.5">
            <Label>{t("priceLabel")}</Label>
            <Input
              type="number"
              min={0}
              value={priceVnd}
              onChange={(e) => setPriceVnd(Number(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("noteLabel")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>

          {warning && warningLabel(t, warning) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {warningLabel(t, warning)}
            </div>
          )}
        </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
