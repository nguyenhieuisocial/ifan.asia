"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Calendar, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  addMinutesToLocalTime,
  buildZonedIso,
  candidateSlotStarts,
  formatMinuteLabel,
} from "@/lib/booking/schedule";
import { createAppointment } from "../calendar/actions";
import { fetchQuickBookingContext } from "./booking-queries";
import { sendReply } from "./actions";

/**
 * Đặt lịch NGAY trong khung chat (ADR-0009 mục 7 việc 5, thẻ design
 * man-dat-lich-tu-chat.html) — "2 chạm, dưới 15 giây, không rời khung chat".
 * Khách ĐÃ BIẾT (đúng cuộc hội thoại đang mở), nên KHÔNG có ô tìm khách như
 * dialog đầy đủ ở màn Lịch — chỉ chọn dịch vụ + bấm 1 mốc giờ còn trống hôm
 * nay. Dùng lại nguyên `createAppointment` (2 EXCLUDE chống trùng ở CSDL,
 * D1 — không viết lại chốt chặn lần hai) và `fetchQuickBookingContext` (dùng
 * lại `getCalendarBundle`/`freeBlocksOfDay` của màn Lịch).
 *
 * "Máy soạn, NGƯỜI bấm gửi" — quyết định gây tranh cãi nhất của ADR-0009:
 * iFan chưa có đường nào TỰ gửi tin cho khách (Zalo OA chờ pháp nhân), nên
 * chốt lịch xong chỉ SOẠN SẴN tin, người dùng tự bấm "Gửi cho khách"
 * (`sendReply` — cùng hàm nút Trả lời đang dùng, KHÔNG tự động gửi).
 */

/** Radix unmount nội dung khi đóng — tách state vào form riêng để mỗi lần mở là mount mới (khuôn AppointmentDialog/AppointmentForm). */
export function BookAppointmentDialog({
  open,
  onOpenChange,
  conversationId,
  contactId,
  contactName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  contactId: string;
  contactName: string;
}) {
  const t = useTranslations("inbox.quickBooking");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title", { name: contactName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <BookAppointmentForm
          conversationId={conversationId}
          contactId={contactId}
          contactName={contactName}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function BookAppointmentForm({
  conversationId,
  contactId,
  contactName,
  onClose,
}: {
  conversationId: string;
  contactId: string;
  contactName: string;
  onClose: () => void;
}) {
  const t = useTranslations("inbox.quickBooking");
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [sending, startSendTransition] = useTransition();

  const contextQuery = useQuery({
    queryKey: ["quick-booking-context"],
    queryFn: () => fetchQuickBookingContext(supabase),
  });
  const ctx = contextQuery.data;

  const [serviceId, setServiceId] = useState("");
  const [staffUserId, setStaffUserId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [selectedStart, setSelectedStart] = useState<number | null>(null);
  const [conflictTime, setConflictTime] = useState<string | null>(null);

  // Auto-pick nhân viên đầu tiên ngay khi context tải xong — khớp thẻ design
  // (thợ + giường "máy chọn sẵn, sửa được nhưng không bắt chọn").
  if (ctx && staffUserId === "" && ctx.staff.length > 0) setStaffUserId(ctx.staff[0].userId);
  if (ctx && resourceId === "" && ctx.resources.length > 0) setResourceId(ctx.resources[0].id);

  const service = ctx?.services.find((s) => s.id === serviceId) ?? null;
  const slots = useMemo(() => {
    if (!ctx || !service) return [];
    return candidateSlotStarts(ctx.freeBlocksToday, service.durationMinutes, 30);
  }, [ctx, service]);

  const [savedLabel, setSavedLabel] = useState<{ time: string; serviceName: string; staffName: string; duration: number } | null>(null);
  const [draft, setDraft] = useState("");

  function handleServiceChange(id: string) {
    setServiceId(id);
    setSelectedStart(null);
    setConflictTime(null);
  }

  /** "HH:MM" 2 số cả giờ lẫn phút — khác `formatMinuteLabel` (chỉ để HIỂN THỊ, cố ý bỏ số 0 đầu giờ), cần dạng ISO hợp lệ ở đây. */
  function hhmmOf(minuteOfDay: number): string {
    return `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
  }

  function handleConfirm() {
    if (!ctx || !service || selectedStart === null || staffUserId === "") return;
    const { todayKey, timezone } = ctx;
    const time = hhmmOf(selectedStart);
    const end = addMinutesToLocalTime(todayKey, time, service.durationMinutes);
    const startAt = buildZonedIso(todayKey, time, timezone);
    const endAt = buildZonedIso(end.dateKey, end.time, timezone);

    startTransition(async () => {
      const res = await createAppointment({
        contactId,
        staffUserId,
        resourceId: resourceId || null,
        serviceId: service.id,
        startAt,
        endAt,
        priceVnd: 0,
        note: null,
        source: "chat",
      });
      if (res.error) {
        if (res.error === "conflict_staff" || res.error === "conflict_resource" || res.error === "conflict_time") {
          setConflictTime(formatMinuteLabel(selectedStart));
          setSelectedStart(null);
          void queryClient.invalidateQueries({ queryKey: ["quick-booking-context"] });
          return;
        }
        toast.error(t("saveFailed"));
        return;
      }
      const staffName = ctx.staff.find((s) => s.userId === staffUserId)?.displayName ?? "";
      setSavedLabel({ time, serviceName: service.name, staffName, duration: service.durationMinutes });
      setDraft(
        t("success.draftMessage", {
          name: contactName,
          time,
          service: service.name,
          duration: service.durationMinutes,
        }),
      );
    });
  }

  function handleSend() {
    if (!draft.trim()) return;
    startSendTransition(async () => {
      const res = await sendReply(conversationId, draft.trim());
      if (res.error) {
        toast.error(t("success.sendFailed"));
        return;
      }
      toast.success(t("success.sent"));
      onClose();
    });
  }

  if (savedLabel) {
    return (
      <div className="space-y-3 py-2">
        <div className="rounded-lg border border-status-closed bg-status-closed/10 p-3">
          <p className="text-sm font-semibold text-status-closed-foreground">
            {t("success.title", { time: savedLabel.time })}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("success.subtitle", { service: savedLabel.serviceName, staff: savedLabel.staffName })}
          </p>
        </div>
        <div className="rounded-lg border border-dashed border-primary p-3">
          <p className="text-[11px] font-semibold text-primary">{t("success.draftLabel")}</p>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="mt-1.5 resize-none text-sm"
          />
          <div className="mt-2 flex gap-2">
            <Button className="flex-1" onClick={handleSend} disabled={sending || !draft.trim()}>
              {sending ? t("success.sending") : t("success.sendButton")}
            </Button>
            <Button variant="outline" onClick={onClose}>
              {t("success.close")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (contextQuery.isPending) {
    return <p className="py-6 text-center text-sm text-muted-foreground">…</p>;
  }
  if (!ctx || !ctx.hasHours) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("noHours")}</p>;
  }

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-muted-foreground">{t("serviceLabel")}</p>
        {ctx.services.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("serviceEmpty")}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {ctx.services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleServiceChange(s.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  s.id === serviceId
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input text-muted-foreground hover:bg-muted",
                )}
              >
                {s.name} · {s.durationMinutes}′
              </button>
            ))}
          </div>
        )}
      </div>

      {conflictTime && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t("conflict", { time: conflictTime })}
        </div>
      )}

      {service && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground">{t("slotsLabel")}</p>
          {slots.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("slotsEmpty")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => {
                    setSelectedStart(min);
                    setConflictTime(null);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    min === selectedStart
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input text-muted-foreground hover:bg-muted",
                  )}
                >
                  {formatMinuteLabel(min)}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">{t("slotsHint")}</p>
        </div>
      )}

      {service && ctx.staff.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground">{t("staffLabel")}</p>
            <Select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)}>
              {ctx.staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.displayName}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground">{t("resourceLabel")}</p>
            <Select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              <option value="">{t("resourceNone")}</option>
              {ctx.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      <Button
        className="w-full"
        disabled={!service || selectedStart === null || staffUserId === "" || pending}
        onClick={handleConfirm}
      >
        {pending ? (
          t("confirming")
        ) : selectedStart !== null ? (
          <>
            <Check className="size-4" />
            {t("confirmButton", { time: formatMinuteLabel(selectedStart) })}
          </>
        ) : (
          <>
            <Calendar className="size-4" />
            {t("confirmButton", { time: "…" })}
          </>
        )}
      </Button>
    </div>
  );
}
