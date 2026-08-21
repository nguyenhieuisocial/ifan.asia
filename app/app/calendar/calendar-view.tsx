"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Calendar, ChevronLeft, ChevronRight, Inbox, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InternalChat } from "@/components/internal-chat/internal-chat";
import { cn } from "@/lib/utils";
import { addDaysToDateKey, formatMinuteLabel } from "@/lib/booking/schedule";
import { freeBlocksOfDay } from "./queries";
import type { Appointment, CalendarBundle, CalendarDay } from "./types";
import { WEEKDAY_SHORT_VN } from "./types";
import { markArrived, markDone, markNoShow } from "./actions";
import { ARRIVABLE_STATUSES, COMPLETABLE_STATUSES, EDITABLE_STATUSES, toastKeyFor } from "./types";
import { AppointmentDialog } from "./appointment-dialog";
import { CancelDialog } from "./cancel-dialog";

const STATUS_STYLE: Record<Appointment["status"], string> = {
  booked: "bg-muted text-foreground",
  arrived: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  done: "bg-muted/60 text-muted-foreground line-through decoration-1",
  cancelled: "bg-muted/40 text-muted-foreground line-through decoration-1",
  no_show: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

function dateLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function CalendarView({
  bundle,
  focusDateKey,
  todayKey,
  currentUserId,
  canAssignOthers,
  canManageAll,
  canWrite,
  moTraoDoiId = null,
}: {
  bundle: CalendarBundle;
  focusDateKey: string;
  todayKey: string;
  currentUserId: string;
  canAssignOthers: boolean;
  canManageAll: boolean;
  /** Khớp RLS appointments_insert — mọi vai TRỪ viewer. */
  canWrite: boolean;
  /**
   * Mã buổi hẹn mà thông báo gọi tên vừa dẫn tới (`?a=`, migration #294). Buổi
   * đó được bung sẵn khung trao đổi, viền hổ phách và cuộn tới nơi — thẻ
   * man-chat-noi-bo hứa "bấm vào là mở thẳng, không phải đi tìm".
   */
  moTraoDoiId?: string | null;
}) {
  const t = useTranslations("calendar");
  const tError = useTranslations("calendar.error");
  const router = useRouter();

  const [addOpen, setAddOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);

  const day = bundle.days.find((d) => d.dateKey === focusDateKey) ?? bundle.days[0];

  // Cuộn tới đúng buổi hẹn thông báo vừa dẫn tới — một ngày đông khách thì thẻ
  // hẹn được nhắc nằm dưới màn hình. Chỉ đọc DOM, không setState, nên không
  // đụng luật `react-hooks/set-state-in-effect` của kho.
  useEffect(() => {
    if (!moTraoDoiId) return;
    document.getElementById(`lich-hen-${moTraoDoiId}`)?.scrollIntoView({ block: "center" });
  }, [moTraoDoiId]);

  function goToDate(dateKey: string) {
    router.push(`/app/calendar?date=${dateKey}`);
  }

  function goRelative(deltaDays: number) {
    goToDate(addDaysToDateKey(focusDateKey, deltaDays));
  }

  async function handleStatus(id: string, action: "arrived" | "done" | "no_show") {
    const fn = action === "arrived" ? markArrived : action === "done" ? markDone : markNoShow;
    const res = await fn(id);
    if (res.error) {
      toast.error(tError(toastKeyFor(res.error)));
      return;
    }
    toast.success(t("statusUpdated"));
  }

  if (!day) return null;

  const isToday = day.dateKey === todayKey;
  const isEmpty = day.appointments.filter((a) => a.status !== "cancelled").length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3 md:px-6">
        <Calendar className="size-5 text-muted-foreground" />
        <h1 className="text-base font-semibold">{t("title")}</h1>
        <div className="ml-auto flex items-center gap-1">
          {/* Hai mũi tên đổi ngày là chỗ bấm nhiều nhất của màn Lịch — 44px
              trên điện thoại (khuôn `size-11` đã dùng ở dòng việc hồ sơ khách). */}
          <Button variant="outline" size="icon" className="max-md:size-11" onClick={() => goRelative(-1)} aria-label={t("prevDay")}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-24 text-center text-sm font-medium">
            {isToday ? t("today") : `${WEEKDAY_SHORT_VN[day.weekday]} ${dateLabel(day.dateKey)}`}
          </span>
          <Button variant="outline" size="icon" className="max-md:size-11" onClick={() => goRelative(1)} aria-label={t("nextDay")}>
            <ChevronRight className="size-4" />
          </Button>
          <a
            href="/api/export/appointments"
            className="ml-2 flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted/60"
          >
            {t("exportCsv")}
          </a>
          {canWrite && (
            <Button size="sm" className="ml-2 gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              {t("addAppointment")}
            </Button>
          )}
        </div>
      </div>

      {/* Dải 7 ngày trong tuần — nhảy nhanh không phải bấm ‹› nhiều lần (chỉ hiện trên máy tính, đúng "xem cả tuần"). */}
      <div className="hidden gap-1 border-b px-6 py-2 md:flex">
        {bundle.days.map((d) => (
          <button
            key={d.dateKey}
            onClick={() => goToDate(d.dateKey)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-center text-xs transition-colors",
              d.dateKey === focusDateKey
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <div>{WEEKDAY_SHORT_VN[d.weekday]}</div>
            <div className="font-medium">{dateLabel(d.dateKey)}</div>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Lịch của ngày LUÔN ưu tiên trên hết — bug thật vừa bắt được khi tự bấm
            thử: đặt "chưa khai giờ" làm nhánh ĐẦU TIÊN khiến lịch vừa lưu xong
            biến mất khỏi màn (banner che tuyệt đối, bất kể ngày có dữ liệu hay
            không). Chỉ hiện NoHoursState khi ngày đó THỰC SỰ trống VÀ chưa khai
            giờ — có lịch thì luôn thấy lịch trước, coi khai giờ là việc phụ. */}
        {!isEmpty ? (
          <>
            <div className="px-4 py-3 text-xs text-muted-foreground md:px-6">
              {t("dayStats", {
                count: day.appointments.filter((a) => a.status !== "cancelled").length,
                free: freeBlocksOfDay(day, bundle.timezone).length,
              })}
            </div>
            <DayTimeline
              day={day}
              timezone={bundle.timezone}
              canManageAll={canManageAll}
              canWrite={canWrite}
              currentUserId={currentUserId}
              onStatus={handleStatus}
              onCancel={setCancelTarget}
              onEdit={setEditTarget}
              moTraoDoiId={moTraoDoiId}
            />
          </>
        ) : !bundle.hasBusinessHours ? (
          <NoHoursState />
        ) : (
          <EmptyDayState />
        )}
      </div>

      <AppointmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        bundle={bundle}
        defaultDateKey={focusDateKey}
        currentUserId={currentUserId}
        canAssignOthers={canAssignOthers}
      />
      {/* Chế độ SỬA dùng LẠI đúng `AppointmentDialog` ở trên, chỉ thêm `initial`
          — không có form thứ hai để về sau lệch nhau. */}
      <AppointmentDialog
        open={editTarget !== null}
        onOpenChange={(v) => !v && setEditTarget(null)}
        bundle={bundle}
        defaultDateKey={focusDateKey}
        currentUserId={currentUserId}
        canAssignOthers={canAssignOthers}
        initial={editTarget}
      />
      <CancelDialog open={cancelTarget !== null} onOpenChange={(v) => !v && setCancelTarget(null)} appointmentId={cancelTarget} />
    </div>
  );
}

function NoHoursState() {
  const t = useTranslations("calendar");
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t("noHoursTitle")}</p>
        <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">{t("noHoursBody")}</p>
        <Button asChild size="sm" className="mt-3">
          <Link href="/app/settings/channels/storefront">{t("noHoursCta")}</Link>
        </Button>
      </div>
      <p className="max-w-sm text-xs text-muted-foreground">{t("noHoursNote")}</p>
    </div>
  );
}

function EmptyDayState() {
  const t = useTranslations("calendar");
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Calendar className="size-5" />
      </div>
      <p className="text-sm font-semibold">{t("emptyTitle")}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{t("emptyBody")}</p>
      <Button variant="outline" size="sm" asChild className="mt-1 gap-1.5">
        <Link href="/app/inbox">
          <Inbox className="size-4" />
          {t("emptyCta")}
        </Link>
      </Button>
    </div>
  );
}

function DayTimeline({
  day,
  timezone,
  canManageAll,
  canWrite,
  currentUserId,
  onStatus,
  onCancel,
  onEdit,
  moTraoDoiId,
}: {
  day: CalendarDay;
  timezone: string;
  canManageAll: boolean;
  canWrite: boolean;
  currentUserId: string;
  onStatus: (id: string, action: "arrived" | "done" | "no_show") => void;
  onCancel: (id: string) => void;
  onEdit: (appt: Appointment) => void;
  moTraoDoiId: string | null;
}) {
  const t = useTranslations("calendar");
  const free = useMemo(() => freeBlocksOfDay(day, timezone), [day, timezone]);
  // Ca ĐÃ HUỶ vốn bị ẩn khỏi dòng thời gian. Một ngoại lệ: ca mà thông báo vừa
  // dẫn tới thì vẫn hiện, kể cả đã huỷ. Ẩn nó đi nghĩa là người bấm thông báo
  // rơi xuống một ngày trông như không có gì — đúng cái "phải đi tìm" mà #294
  // sinh ra để chấm dứt, và tệ hơn vì ở đây không còn gì để tìm. Cuộc trao đổi
  // vẫn còn sau khi ca bị huỷ; thường nó bàn CHÍNH việc huỷ đó.
  const appts = day.appointments
    .filter((a) => a.status !== "cancelled" || a.id === moTraoDoiId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  return (
    <ul className="divide-y px-4 md:px-6">
      {mergeSorted(free, appts).map((row, i) =>
        row.kind === "free" ? (
          <li key={`free-${i}`} className="flex items-center gap-3 py-2.5">
            <span className="w-12 shrink-0 text-xs text-muted-foreground">{formatMinuteLabel(row.startMin)}</span>
            <span className="flex-1 rounded-md border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
              {t("freeSlot", { minutes: row.endMin - row.startMin })}
            </span>
          </li>
        ) : (
          <li
            key={row.appt.id}
            id={`lich-hen-${row.appt.id}`}
            className="flex items-start gap-3 py-2.5"
          >
            <span className="w-12 shrink-0 pt-1 text-xs text-muted-foreground">{timeOf(row.appt.startAt, timezone)}</span>
            <div
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm",
                STATUS_STYLE[row.appt.status],
                // Viền hổ phách = "đây là ca thông báo vừa dẫn tới". Cùng họ màu
                // với khung trao đổi nội bộ nên đọc ra là một chuyện, không phải
                // một trạng thái mới của ca.
                moTraoDoiId === row.appt.id && "ring-2 ring-amber-400 dark:ring-amber-500",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{row.appt.contactName}</span>
                {row.appt.status === "arrived" && <span className="text-xs font-semibold">{t("statusArrived")}</span>}
                {row.appt.status === "no_show" && <span className="text-xs font-semibold">{t("statusNoShow")}</span>}
              </div>
              <div className="text-xs opacity-80">
                {row.appt.serviceName ?? t("noService")}
                {row.appt.staffName ? ` · ${row.appt.staffName}` : ""}
                {row.appt.resourceName ? ` · ${row.appt.resourceName}` : ""}
              </div>
              {/* MỘT nút chính + MỘT dấu ba chấm — chuẩn mật độ 21/08.
                  Bản trước xếp bốn nút chữ thành BA khối `mt-1.5` chồng nhau
                  (Khách đã tới · Không tới · Huỷ, rồi Sửa, rồi Tạo đơn). Trên
                  điện thoại mỗi nút cao 44px nên chúng xuống hai hàng, đẩy mỗi
                  lịch hẹn lên ~215px: đo thật cho thấy một màn chỉ hiện được
                  HAI lịch rưỡi trong khi ngày đó có 14 lịch.

                  Việc chính đổi theo trạng thái, và chỉ MỘT việc là chính:
                  chưa tới thì "Khách đã tới", đã tới thì "Xong", xong rồi thì
                  "Tạo đơn". Ba việc còn lại (không tới, huỷ, sửa) đi vào dấu
                  ba chấm — không mất việc nào, chỉ đổi chỗ.

                  Điều kiện HIỆN đọc thẳng hằng số máy trạng thái, không chép
                  tay lại tên trạng thái: đúng tập mà máy chủ lọc trong câu
                  UPDATE. Nút Huỷ theo tập `ARRIVABLE` tuy máy chủ còn cho huỷ
                  cả ca `arrived` — hẹp hơn thì không báo sai, chỉ là chưa mở. */}
              {(canManageAll || row.appt.staffUserId === currentUserId) && (() => {
                const coDenNoi = ARRIVABLE_STATUSES.includes(row.appt.status);
                const coXong = COMPLETABLE_STATUSES.includes(row.appt.status);
                const coSua =
                  canWrite && EDITABLE_STATUSES.includes(row.appt.status);
                const coTaoDon = row.appt.status === "done";
                const phu =
                  (coDenNoi ? 2 : 0) + (coSua ? 1 : 0); // không tới + huỷ + sửa
                if (!coDenNoi && !coXong && !coTaoDon && phu === 0) return null;
                const kieuChinh =
                  "rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 max-md:flex max-md:min-h-11 max-md:items-center max-md:px-3";
                const kieuPhu =
                  "rounded border px-2 py-0.5 text-xs hover:bg-background/60 max-md:flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center max-md:px-3";
                return (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {coDenNoi && (
                      <button className={kieuChinh} onClick={() => onStatus(row.appt.id, "arrived")}>
                        {t("actionArrived")}
                      </button>
                    )}
                    {coXong && (
                      <button className={kieuChinh} onClick={() => onStatus(row.appt.id, "done")}>
                        {t("actionDone")}
                      </button>
                    )}
                    {coTaoDon && (
                      // Cửa vào "từ lịch hẹn" (ADR-0019 mục 8 việc 4) — chỉ hiện
                      // khi đã Xong: đơn hàng ghi lại CÁI ĐÃ LÀM, không phải cái
                      // sắp làm.
                      <Link
                        href={`/app/orders/new?contactId=${row.appt.contactId}&appointmentId=${row.appt.id}`}
                        className={kieuChinh}
                      >
                        {t("actionCreateOrder")}
                      </Link>
                    )}
                    {phu > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className={kieuPhu} aria-label={t("actionMore")}>
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {coDenNoi && (
                            <DropdownMenuItem onSelect={() => onStatus(row.appt.id, "no_show")}>
                              {t("actionNoShow")}
                            </DropdownMenuItem>
                          )}
                          {coSua && (
                            <DropdownMenuItem onSelect={() => onEdit(row.appt)}>
                              {t("actionEdit")}
                            </DropdownMenuItem>
                          )}
                          {coDenNoi && (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => onCancel(row.appt.id)}
                            >
                              {t("actionCancel")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })()}
              {/* Trao đổi nội bộ về buổi hẹn này (thẻ man-chat-noi-bo, migration
                  #169). Gấp lại mặc định: một ngày có nhiều lịch, mở sẵn hết thì
                  dòng thời gian không còn đọc được. */}
              <InternalChat
                entityType="appointment"
                entityId={row.appt.id}
                defaultOpen={moTraoDoiId === row.appt.id}
                className="mt-1.5 bg-background/70"
              />
            </div>
          </li>
        ),
      )}
    </ul>
  );
}

/** Trộn 2 danh sách đã sort (khoảng trống theo phút, lịch hẹn theo giờ ISO) thành một dòng thời gian duy nhất. */
function mergeSorted(
  free: { startMin: number; endMin: number }[],
  appts: Appointment[],
): (({ kind: "free" } & { startMin: number; endMin: number }) | { kind: "appt"; appt: Appointment })[] {
  const out: (({ kind: "free" } & { startMin: number; endMin: number }) | { kind: "appt"; appt: Appointment })[] = [];
  let fi = 0;
  let ai = 0;
  while (fi < free.length || ai < appts.length) {
    const f = free[fi];
    const a = appts[ai];
    if (!a) {
      out.push({ kind: "free", ...f });
      fi++;
      continue;
    }
    if (!f) {
      out.push({ kind: "appt", appt: a });
      ai++;
      continue;
    }
    const aMin = minutesOfIso(a.startAt);
    if (f.startMin <= aMin) {
      out.push({ kind: "free", ...f });
      fi++;
    } else {
      out.push({ kind: "appt", appt: a });
      ai++;
    }
  }
  return out;
}

function minutesOfIso(iso: string): number {
  const time = iso.split("T")[1] ?? "";
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function timeOf(iso: string, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return fmt.format(new Date(iso));
}
