"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import {
  checkAppointmentHours,
  createAppointment,
  createRecurringAppointments,
  updateAppointment,
} from "./actions";
import { cn } from "@/lib/utils";
import { WEEKDAY_SHORT_VN } from "@/lib/format";
import { TRAN_SO_BUOI, sinhCacNgay, type LuatLap } from "./sinh-buoi";
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
  defaultDurationMinutes,
  mau,
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
  /** Độ dài điền sẵn — khi người dùng KÉO một khoảng chứ không chỉ bấm một ô. */
  defaultDurationMinutes?: number;
  /**
   * MẪU để nhân bản: điền sẵn mọi trường của một buổi hẹn cũ, nhưng vẫn TẠO
   * MỚI chứ không sửa cái cũ.
   *
   * ⚠️ Khác hẳn `initial`. `initial` = SỬA buổi đó; `mau` = làm một buổi GIỐNG
   *   nó. Dùng nhầm hai cái này thì "nhân bản" sẽ dời mất buổi cũ của khách.
   */
  mau?: Appointment | null;
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
          defaultDurationMinutes={defaultDurationMinutes}
          mau={mau ?? null}
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
  defaultDurationMinutes,
  defaultStaffEmployeeId,
  currentUserId,
  canAssignOthers,
  initial,
  mau,
  onDone,
}: {
  bundle: CalendarBundle;
  defaultDateKey: string;
  /** Giờ điền sẵn khi mở từ một ô trống trên lưới, dạng "HH:MM". */
  defaultTime?: string;
  /** Độ dài điền sẵn — khi người dùng KÉO một khoảng chứ không chỉ bấm một ô. */
  defaultDurationMinutes?: number;
  defaultStaffEmployeeId?: string;
  currentUserId: string;
  canAssignOthers: boolean;
  initial: Appointment | null;
  mau?: Appointment | null;
  onDone: () => void;
}) {
  const t = useTranslations("calendar.dialog");
  const tError = useTranslations("calendar.error");
  const [pending, startTransition] = useTransition();

  // Chế độ SỬA: rót giá trị đang có làm state ban đầu. Không cần effect đồng bộ
  // — Radix unmount nội dung khi đóng nên mỗi lần mở là một lần mount MỚI.
  const start = initial ? startPartsInTimeZone(initial, bundle.timezone) : null;
  // `mau` chỉ điền sẵn — mọi trường vẫn sửa được, và lưu ra là một buổi MỚI.
  const goc = initial ?? mau ?? null;

  const [contact, setContact] = useState<{ id: string; name: string } | null>(
    goc ? { id: goc.contactId, name: goc.contactName } : null,
  );
  // #214: người làm ca định danh bằng employeeId (thợ có thể không có tài khoản).
  const myEmployeeId = bundle.staff.find((s) => s.userId === currentUserId)?.employeeId ?? "";
  const [staffEmployeeId, setStaffEmployeeId] = useState(
    goc?.staffEmployeeId ?? defaultStaffEmployeeId ?? (canAssignOthers ? "" : myEmployeeId),
  );
  const [serviceId, setServiceId] = useState(goc?.serviceId ?? "");
  const [resourceId, setResourceId] = useState(goc?.resourceId ?? "");
  const [dateKey, setDateKey] = useState(start?.dateKey ?? defaultDateKey);
  // `defaultTime` = giờ ô trống vừa bấm trên lưới. Không có thì 09:00 như cũ.
  const [time, setTime] = useState(start?.time ?? defaultTime ?? "09:00");
  const [durationMinutes, setDurationMinutes] = useState(
    start?.durationMinutes ??
      defaultDurationMinutes ??
      (mau
        ? Math.round((Date.parse(mau.endAt) - Date.parse(mau.startAt)) / 60_000)
        : 30),
  );
  const [priceVnd, setPriceVnd] = useState(goc?.priceVnd ?? 0);
  /** Giá do MÁY điền lần trước — để phân biệt với giá người dùng tự gõ. */
  const giaMayDien = useRef<number | null>(null);
  const [note, setNote] = useState(goc?.note ?? "");
  /**
   * LẶP LẠI — chỉ có ở chế độ TẠO MỚI.
   *
   * Sửa một buổi đang nằm trong liệu trình là chuyện khác hẳn (phải hỏi "buổi
   * này / buổi này và sau / tất cả"), và nhét cả hai vào một hộp thì không ai
   * đọc ra được mình đang làm gì.
   */
  const [lapFreq, setLapFreq] = useState<"khong" | LuatLap["freq"]>("khong");
  const [lapBuoc, setLapBuoc] = useState(1);
  const [lapSoBuoi, setLapSoBuoi] = useState(8);
  const [lapCacThu, setLapCacThu] = useState<number[]>([]);
  const [lapTheoThu, setLapTheoThu] = useState(false);
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

  /**
   * Các ngày liệu trình sẽ rơi vào — tính NGAY trong lúc gõ.
   *
   * Bày ra trước khi bấm Lưu là bắt buộc, không phải trang trí: "mỗi tháng
   * ngày 31" nghe hợp lý cho tới khi thấy nó bỏ qua tháng 2, tháng 4, tháng 6.
   * Thấy trước thì sửa được; không thấy thì phát hiện vào hôm khách tới.
   */
  const cacNgayLap = useMemo(() => {
    if (lapFreq === "khong" || initial) return [];
    return sinhCacNgay(dateKey, {
      freq: lapFreq,
      buoc: lapBuoc,
      cacThu: lapCacThu,
      theoThuCuaThang: lapTheoThu,
      soBuoi: lapSoBuoi,
    });
  }, [lapFreq, lapBuoc, lapSoBuoi, lapCacThu, lapTheoThu, dateKey, initial]);

  const canSubmit = contact !== null && staffEmployeeId !== "" && dateKey !== "" && time !== "" && durationMinutes > 0;

  /**
   * Chọn dịch vụ thì điền sẵn CẢ thời lượng LẪN GIÁ.
   *
   * Trước 21/08 chỉ điền thời lượng, nên lễ tân phải tự gõ lại giá từng ca —
   * vừa mất thì giờ vừa là chỗ gõ sai số 0. Giá đã nằm sẵn trên bảng dịch vụ,
   * không có lý do gì bắt người ta nhớ.
   *
   * ⚠️ Chỉ điền ĐÈ khi ô giá đang là số cũ của một dịch vụ khác (hoặc đang 0).
   *   Người ta có quyền sửa giá cho một ca cụ thể — khách quen bớt 50k chẳng
   *   hạn — và đổi dịch vụ xong mà giá tự nhảy về bảng giá là xoá mất việc họ
   *   vừa làm. Nhớ giá vừa điền để biết cái nào là "của máy", cái nào là "của
   *   người".
   */
  function handleServiceChange(id: string) {
    setServiceId(id);
    const svc = bundle.services.find((s) => s.id === id);
    if (!svc) return;
    setDurationMinutes(svc.durationMinutes);
    setPriceVnd((truoc) => (truoc === 0 || truoc === giaMayDien.current ? svc.priceVnd : truoc));
    giaMayDien.current = svc.priceVnd;
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
      // ── Liệu trình lặp lại ─────────────────────────────────────
      if (!initial && lapFreq !== "khong" && lapSoBuoi > 1) {
        const kq = await createRecurringAppointments({
          ...chung,
          source: "calendar",
          freq: lapFreq,
          buoc: lapBuoc,
          cacThu: lapCacThu,
          theoThuCuaThang: lapTheoThu,
          soBuoi: lapSoBuoi,
          timezone: bundle.timezone,
        });
        if (kq.error) {
          toast.error(tError(toastKeyFor(kq.error)));
          return;
        }
        // ⚠️ Buổi bị bỏ qua phải NÓI RA, và nói to. Im lặng thì khách nghĩ
        //   mình có 8 buổi mà thật ra chỉ có 7, và không ai biết cho tới hôm
        //   buổi đó không có ai đợi.
        if (kq.boQua.length > 0) {
          toast.warning(t("repeat.partial", { dat: kq.daDat, bo: kq.boQua.length }), {
            description: kq.boQua
              .map((x) => {
                const [ngay, ma] = x.split("|");
                return `${ngay.slice(8, 10)}/${Number(ngay.slice(5, 7))} — ${tError(toastKeyFor(ma))}`;
              })
              .join(" · "),
            duration: 15_000,
          });
        } else {
          toast.success(t("repeat.done", { count: kq.daDat }));
        }
        onDone();
        return;
      }

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

          {/* ── LẶP LẠI — chỉ khi tạo mới ─────────────────────────── */}
          {!initial && (
            <div className="space-y-1.5 rounded-md border p-2.5">
              <Label htmlFor="lap-freq">{t("repeat.label")}</Label>
              <Select
                id="lap-freq"
                value={lapFreq}
                onChange={(e) => setLapFreq(e.target.value as typeof lapFreq)}
              >
                <option value="khong">{t("repeat.none")}</option>
                <option value="day">{t("repeat.unit.day")}</option>
                <option value="week">{t("repeat.unit.week")}</option>
                <option value="month">{t("repeat.unit.month")}</option>
              </Select>

              {lapFreq !== "khong" && (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="lap-buoc" className="text-[11px]">
                        {t("repeat.stepLabel")}
                      </Label>
                      <Input
                        id="lap-buoc"
                        type="number"
                        min={1}
                        max={52}
                        value={lapBuoc}
                        onChange={(e) => setLapBuoc(Math.max(1, Number(e.target.value) || 1))}
                        className="w-20"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lap-so" className="text-[11px]">
                        {t("repeat.countLabel")}
                      </Label>
                      <Input
                        id="lap-so"
                        type="number"
                        min={2}
                        max={TRAN_SO_BUOI}
                        value={lapSoBuoi}
                        onChange={(e) =>
                          setLapSoBuoi(
                            Math.max(2, Math.min(TRAN_SO_BUOI, Number(e.target.value) || 2)),
                          )
                        }
                        className="w-20"
                      />
                    </div>
                  </div>

                  {lapFreq === "week" && (
                    <div className="space-y-1">
                      <Label className="text-[11px]">{t("repeat.daysLabel")}</Label>
                      <div className="flex flex-wrap gap-1">
                        {[1, 2, 3, 4, 5, 6, 0].map((thu) => (
                          <button
                            key={thu}
                            type="button"
                            aria-pressed={lapCacThu.includes(thu)}
                            onClick={() =>
                              setLapCacThu((truoc) =>
                                truoc.includes(thu)
                                  ? truoc.filter((x) => x !== thu)
                                  : [...truoc, thu],
                              )
                            }
                            className={cn(
                              "min-h-9 min-w-9 rounded-md border px-2 text-[12px] font-medium",
                              lapCacThu.includes(thu)
                                ? "border-primary bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {WEEKDAY_SHORT_VN[thu]}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t("repeat.daysHint")}</p>
                    </div>
                  )}

                  {lapFreq === "month" && (
                    <label className="flex items-start gap-2 text-[12px]">
                      <input
                        type="checkbox"
                        checked={lapTheoThu}
                        onChange={(e) => setLapTheoThu(e.target.checked)}
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <span>{t("repeat.byWeekday")}</span>
                    </label>
                  )}

                  {/* Xem trước — bắt buộc, xem ghi chú ở `cacNgayLap`. */}
                  {cacNgayLap.length > 0 && (
                    <div className="rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed">
                      <p className="font-semibold">
                        {t("repeat.previewTitle", { count: cacNgayLap.length })}
                      </p>
                      <p className="text-muted-foreground">
                        {cacNgayLap
                          .slice(0, 8)
                          .map((k) => `${Number(k.slice(8, 10))}/${Number(k.slice(5, 7))}`)
                          .join(" · ")}
                        {cacNgayLap.length > 8
                          ? ` … ${Number(cacNgayLap[cacNgayLap.length - 1].slice(8, 10))}/${Number(
                              cacNgayLap[cacNgayLap.length - 1].slice(5, 7),
                            )}`
                          : ""}
                      </p>
                      {cacNgayLap.length < lapSoBuoi && (
                        <p className="pt-1 text-amber-700 dark:text-amber-400">
                          {t("repeat.skippedMonths", {
                            asked: lapSoBuoi,
                            got: cacNgayLap.length,
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
