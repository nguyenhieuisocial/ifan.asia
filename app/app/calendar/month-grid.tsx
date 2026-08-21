"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatMinuteLabel, minutesOfDayInTimeZone } from "@/lib/booking/schedule";
import { nhanAmNgan } from "@/lib/am-lich";
import { MAU_DA_HUY, mauCuaTho } from "./types";
import type { Appointment, CalendarDay } from "./types";

/** Mỗi ô ngày hiện tối đa bấy nhiêu ca, phần còn lại gộp thành "+N nữa". */
const TOI_DA_MOI_O = 3;
const THU_VN = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/**
 * CHẾ ĐỘ THÁNG — trả lời câu "tháng này chỗ nào kín, chỗ nào trống".
 *
 * Không vẽ theo giờ: một ô ngày cao 90px mà nhét 14 tiếng mở cửa vào thì mỗi ca
 * dày 4px, không đọc được gì. Thay vào đó mỗi ca là một dòng chữ, và ô nào quá
 * nhiều thì gộp phần đuôi — bấm vào ngày để xem đủ.
 *
 * ⚠️ Ngày ngoài tháng đang xem vẫn VẼ (lưới tháng luôn 6 hàng × 7 cột cho khỏi
 *   nhảy chiều cao khi đổi tháng) nhưng làm mờ, và ca của chúng vẫn bấm được —
 *   giấu đi thì ca ngày 1 tháng sau biến mất khỏi màn không lý do.
 */
export function MonthGrid({
  days,
  thangDangXem,
  timezone,
  todayKey,
  thuTuTho,
  onChonCa,
  onChonNgay,
  amLich,
}: {
  days: CalendarDay[];
  /** "YYYY-MM" — ngày ngoài tháng này bị làm mờ. */
  thangDangXem: string;
  timezone: string;
  todayKey: string;
  thuTuTho: Map<string, number>;
  onChonCa: (a: Appointment) => void;
  onChonNgay: (dateKey: string) => void;
  amLich: boolean;
}) {
  const t = useTranslations("calendar");
  const hang = useMemo(() => {
    const ra: CalendarDay[][] = [];
    for (let i = 0; i < days.length; i += 7) ra.push(days.slice(i, i + 7));
    return ra;
  }, [days]);

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="sticky top-0 z-10 grid grid-cols-7 border-b bg-background">
        {THU_VN.map((x) => (
          <div key={x} className="border-r py-1 text-center text-[10px] text-muted-foreground last:border-r-0">
            {x}
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        {hang.map((h, i) => (
          <div key={i} className="grid min-h-[92px] flex-1 grid-cols-7 border-b last:border-b-0">
            {h.map((d) => {
              const ngoaiThang = !d.dateKey.startsWith(thangDangXem);
              const homNay = d.dateKey === todayKey;
              const con = d.appointments.length - TOI_DA_MOI_O;
              return (
                <div
                  key={d.dateKey}
                  className={cn(
                    "min-w-0 border-r p-1 last:border-r-0",
                    ngoaiThang && "bg-muted/20",
                    homNay && "bg-primary/5",
                  )}
                >
                  <div className="mb-0.5 flex items-baseline gap-1">
                    <button
                      type="button"
                      onClick={() => onChonNgay(d.dateKey)}
                      className={cn(
                        // 20px là DƯỚI ngưỡng 24×24 của WCAG 2.5.8 — ngón tay
                        // bấm trượt sang ô ngày bên cạnh, và ở màn Tháng thì
                        // bấm nhầm ngày nghĩa là mở nhầm lịch của một ngày khác.
                        "flex size-6 items-center justify-center rounded-full text-[11px] leading-none font-medium hover:bg-muted",
                        ngoaiThang && "text-muted-foreground",
                        homNay && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                      )}
                      aria-label={t("month.openDay", { date: d.dateKey })}
                    >
                      {Number(d.dateKey.slice(8, 10))}
                    </button>
                    {amLich && (
                      <span className="text-[9px] leading-none text-muted-foreground">
                        {nhanAmNgan(d.dateKey)}
                      </span>
                    )}
                  </div>

                  {d.closureReason && (
                    <p className="mb-0.5 truncate rounded bg-muted-foreground/15 px-1 text-[9px] leading-tight">
                      {d.closureReason}
                    </p>
                  )}

                  <ul className="space-y-0.5">
                    {d.appointments.slice(0, TOI_DA_MOI_O).map((a) => {
                      const daHuy = a.status === "cancelled" || a.status === "no_show";
                      const mau = daHuy ? MAU_DA_HUY : mauCuaTho(a.staffEmployeeId, thuTuTho);
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => onChonCa(a)}
                            title={`${a.contactName} · ${a.staffName}`}
                            className={cn(
                              "flex w-full items-center gap-1 rounded px-1 py-px text-left text-[10px] leading-tight hover:bg-muted",
                              daHuy && "text-muted-foreground line-through decoration-1",
                            )}
                          >
                            <span className={cn("size-1.5 shrink-0 rounded-full", mau.cham)} />
                            <span className="shrink-0 tabular-nums opacity-70">
                              {formatMinuteLabel(minutesOfDayInTimeZone(a.startAt, timezone))}
                            </span>
                            <span className="truncate">{a.contactName}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {con > 0 && (
                    <button
                      type="button"
                      onClick={() => onChonNgay(d.dateKey)}
                      className="mt-0.5 px-1 text-[10px] leading-tight font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {t("month.more", { count: con })}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
