"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatMinuteLabel, minutesOfDayInTimeZone } from "@/lib/booking/schedule";
import { xepChong } from "./xep-chong";
import { MAU_DA_HUY, WEEKDAY_SHORT_VN, mauCuaTho } from "./types";
import type { Appointment, CalendarDay } from "./types";

/** Chiều cao MỘT GIỜ, tính bằng pixel. */
const CAO_MOT_GIO = 52;
/** Bấm vào ô trống thì làm tròn xuống mốc 15 phút gần nhất. */
const BUOC_PHUT = 15;
/** Không có giờ mở cửa nào thì vẫn phải vẽ được lưới — lấy khung này. */
const KHUNG_MAC_DINH = { dau: 7 * 60, cuoi: 21 * 60 };

type Props = {
  days: CalendarDay[];
  timezone: string;
  todayKey: string;
  /** Thứ tự thợ trong danh sách — quyết định màu. */
  thuTuTho: Map<string, number>;
  onChonCa: (a: Appointment) => void;
  /** Bấm ô trống: mở hộp tạo lịch với ngày+giờ điền sẵn. */
  onChonOTrong: ((dateKey: string, phut: number) => void) | null;
};

/**
 * LƯỚI THỜI GIAN — cột giờ dọc bên trái, mỗi ngày một cột.
 *
 * Đây là thứ khiến một màn lịch trở thành LỊCH chứ không phải danh sách có sắp
 * xếp: nhìn vào là thấy ngay 14h–16h trống, ca này dài gấp đôi ca kia, và ba ca
 * cùng 9h thì đứng cạnh nhau. Bản trước chỉ liệt kê ca nối đuôi, nên "hôm nay
 * bận không" phải đọc từng dòng mới trả lời được.
 *
 * ⚠️ Khung giờ vẽ ra KHÔNG chỉ là giờ mở cửa. Một ca lỡ đặt ngoài giờ (nhận
 *   khách quen lúc 6h sáng) mà lưới cắt mất thì nó biến mất khỏi màn hình — và
 *   biến mất im lặng là thứ tệ nhất một màn lịch có thể làm. Khung luôn nới ra
 *   đủ ôm mọi ca có thật trong dải.
 */
export function TimeGrid({
  days,
  timezone,
  todayKey,
  thuTuTho,
  onChonCa,
  onChonOTrong,
}: Props) {
  const t = useTranslations("calendar");
  const khungRef = useRef<HTMLDivElement>(null);
  const [bayGioPhut, datBayGioPhut] = useState<number | null>(null);

  // Đường "bây giờ" phải tự đi xuống, không đứng im ở lúc mở trang.
  useEffect(() => {
    const dat = () => datBayGioPhut(minutesOfDayInTimeZone(new Date().toISOString(), timezone));
    dat();
    const h = setInterval(dat, 60_000);
    return () => clearInterval(h);
  }, [timezone]);

  const khung = useMemo(() => {
    let dau = Infinity;
    let cuoi = -Infinity;
    for (const d of days) {
      for (const r of d.openRanges) {
        dau = Math.min(dau, r.startMin);
        cuoi = Math.max(cuoi, r.endMin);
      }
      for (const a of d.appointments) {
        dau = Math.min(dau, minutesOfDayInTimeZone(a.startAt, timezone));
        cuoi = Math.max(cuoi, minutesOfDayInTimeZone(a.endAt, timezone));
      }
    }
    if (!Number.isFinite(dau) || !Number.isFinite(cuoi) || cuoi <= dau) {
      dau = KHUNG_MAC_DINH.dau;
      cuoi = KHUNG_MAC_DINH.cuoi;
    }
    // Bo tròn ra giờ chẵn và chừa nửa giờ mỗi đầu cho dễ thở.
    return {
      dau: Math.max(0, Math.floor((dau - 30) / 60) * 60),
      cuoi: Math.min(24 * 60, Math.ceil((cuoi + 30) / 60) * 60),
    };
  }, [days, timezone]);

  const gio = useMemo(() => {
    const ra: number[] = [];
    for (let m = khung.dau; m < khung.cuoi; m += 60) ra.push(m);
    return ra;
  }, [khung]);

  const caoTong = ((khung.cuoi - khung.dau) / 60) * CAO_MOT_GIO;
  const toaDo = useMemo(
    () => (phut: number) => ((phut - khung.dau) / 60) * CAO_MOT_GIO,
    [khung.dau],
  );

  // Mở ra là nhìn thấy khung giờ đang chạy, không phải cuộn đi tìm.
  const daCan = useRef(false);
  useEffect(() => {
    const el = khungRef.current;
    if (!el || bayGioPhut === null || daCan.current) return;
    daCan.current = true;
    // Chỉ căn MỘT LẦN: căn lại mỗi phút sẽ giật màn khi người ta đang cuộn xem
    // giờ khác.
    el.scrollTop = Math.max(0, toaDo(bayGioPhut) - el.clientHeight / 3);
  }, [bayGioPhut, toaDo]);

  function bamOTrong(e: React.MouseEvent<HTMLDivElement>, dateKey: string) {
    if (!onChonOTrong) return;
    const hop = e.currentTarget.getBoundingClientRect();
    const phut = khung.dau + ((e.clientY - hop.top) / CAO_MOT_GIO) * 60;
    onChonOTrong(dateKey, Math.max(0, Math.floor(phut / BUOC_PHUT) * BUOC_PHUT));
  }

  return (
    <div ref={khungRef} className="relative flex-1 overflow-auto">
      {/* Dải đầu cột: thứ + ngày. Dính trên khi cuộn — cuộn tới 16h mà không
          biết đang xem thứ mấy là mất phương hướng ngay. */}
      <div className="sticky top-0 z-20 flex border-b bg-background">
        <div className="w-12 shrink-0 border-r" />
        {days.map((d) => {
          const homNay = d.dateKey === todayKey;
          return (
            <div
              key={d.dateKey}
              className={cn(
                "min-w-0 flex-1 border-r px-1 py-1.5 text-center last:border-r-0",
                homNay && "bg-primary/5",
              )}
            >
              <p className="text-[10px] leading-tight text-muted-foreground">
                {WEEKDAY_SHORT_VN[d.weekday]}
              </p>
              <p
                className={cn(
                  "text-[13px] leading-tight font-semibold",
                  homNay &&
                    "mx-auto flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground",
                )}
              >
                {Number(d.dateKey.slice(8, 10))}
              </p>
            </div>
          );
        })}
      </div>

      {/* Hàng CẢ NGÀY — ngày nghỉ của tiệm. Tách khỏi lưới giờ vì nó không
          thuộc giờ nào cả; nhét vào lưới thì phải bịa ra một khung giờ. */}
      {days.some((d) => d.closureReason) && (
        <div className="flex border-b bg-muted/30">
          <div className="w-12 shrink-0 border-r px-1 py-1 text-[9px] leading-tight text-muted-foreground">
            {t("grid.allDay")}
          </div>
          {days.map((d) => (
            <div key={d.dateKey} className="min-w-0 flex-1 border-r p-1 last:border-r-0">
              {d.closureReason && (
                <p
                  className="truncate rounded bg-muted-foreground/15 px-1 py-0.5 text-[10px] leading-tight"
                  title={d.closureReason}
                >
                  {d.closureReason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex" style={{ height: caoTong }}>
        {/* Cột nhãn giờ */}
        <div className="w-12 shrink-0 border-r">
          {gio.map((m) => (
            <div key={m} className="relative" style={{ height: CAO_MOT_GIO }}>
              <span className="absolute -top-1.5 right-1 text-[10px] tabular-nums text-muted-foreground">
                {formatMinuteLabel(m)}
              </span>
            </div>
          ))}
        </div>

        {days.map((d) => (
          <CotNgay
            key={d.dateKey}
            day={d}
            timezone={timezone}
            khung={khung}
            gio={gio}
            toaDo={toaDo}
            thuTuTho={thuTuTho}
            laHomNay={d.dateKey === todayKey}
            bayGioPhut={bayGioPhut}
            onChonCa={onChonCa}
            onBamTrong={onChonOTrong ? (e) => bamOTrong(e, d.dateKey) : null}
          />
        ))}
      </div>
    </div>
  );
}

function CotNgay({
  day,
  timezone,
  khung,
  gio,
  toaDo,
  thuTuTho,
  laHomNay,
  bayGioPhut,
  onChonCa,
  onBamTrong,
}: {
  day: CalendarDay;
  timezone: string;
  khung: { dau: number; cuoi: number };
  gio: number[];
  toaDo: (phut: number) => number;
  thuTuTho: Map<string, number>;
  laHomNay: boolean;
  bayGioPhut: number | null;
  onChonCa: (a: Appointment) => void;
  onBamTrong: ((e: React.MouseEvent<HTMLDivElement>) => void) | null;
}) {
  const t = useTranslations("calendar");

  const cacCa = useMemo(
    () =>
      day.appointments.map((a) => ({
        ca: a,
        startMin: minutesOfDayInTimeZone(a.startAt, timezone),
        endMin: minutesOfDayInTimeZone(a.endAt, timezone),
      })),
    [day.appointments, timezone],
  );
  const cho = useMemo(() => xepChong(cacCa), [cacCa]);
  const ngoaiGio = useMemo(() => layNgoaiGio(day.openRanges, khung), [day.openRanges, khung]);

  return (
    <div
      className={cn("relative min-w-0 flex-1 border-r last:border-r-0", laHomNay && "bg-primary/5")}
      onClick={onBamTrong ?? undefined}
      role={onBamTrong ? "button" : undefined}
      tabIndex={onBamTrong ? -1 : undefined}
      aria-label={onBamTrong ? t("grid.tapEmpty") : undefined}
    >
      {/* Vạch giờ + vạch nửa giờ nhạt hơn */}
      {gio.map((m) => (
        <div key={m} className="absolute inset-x-0 border-t" style={{ top: toaDo(m) }}>
          <div
            className="absolute inset-x-0 border-t border-dashed border-border/40"
            style={{ top: CAO_MOT_GIO / 2 }}
          />
        </div>
      ))}

      {/* Ngoài giờ mở cửa: tô xám. Cho biết ngay chỗ nào tiệm đóng, thay vì để
          ô trống trông y hệt ô rảnh. */}
      {ngoaiGio.map((r, i) => (
        <div
          key={i}
          className="pointer-events-none absolute inset-x-0 bg-muted/40"
          style={{ top: toaDo(r.startMin), height: toaDo(r.endMin) - toaDo(r.startMin) }}
        />
      ))}

      {cacCa.map((x) => {
        const o = cho.get(x);
        if (!o) return null;
        const daHuy = x.ca.status === "cancelled" || x.ca.status === "no_show";
        const mau = daHuy ? MAU_DA_HUY : mauCuaTho(x.ca.staffEmployeeId, thuTuTho);
        const cao = Math.max(18, toaDo(x.endMin) - toaDo(x.startMin));
        const hep = o.soCot > 2 || cao < 34;
        return (
          <button
            key={x.ca.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChonCa(x.ca);
            }}
            title={`${formatMinuteLabel(x.startMin)}–${formatMinuteLabel(x.endMin)} · ${x.ca.contactName}${
              x.ca.staffName !== "—" ? ` · ${x.ca.staffName}` : ""
            }`}
            className={cn(
              "absolute overflow-hidden rounded-[3px] border-l-[3px] px-1 py-0.5 text-left",
              mau.vien,
              mau.nen,
              mau.chu,
              daHuy && "line-through decoration-1",
              "hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring",
            )}
            style={{
              top: toaDo(x.startMin),
              height: cao,
              left: `calc(${(o.cot / o.soCot) * 100}% + 1px)`,
              width: `calc(${100 / o.soCot}% - 2px)`,
            }}
          >
            <p className="truncate text-[10px] leading-tight font-semibold">
              {formatMinuteLabel(x.startMin)} {x.ca.contactName}
            </p>
            {!hep && (
              <p className="truncate text-[10px] leading-tight opacity-80">
                {x.ca.serviceName ?? t("grid.noService")}
              </p>
            )}
          </button>
        );
      })}

      {/* Đường BÂY GIỜ — chỉ vẽ trên cột hôm nay, và chỉ khi giờ hiện tại nằm
          trong khung đang vẽ. Vẽ ở mọi cột thì bảy vạch đỏ vô nghĩa. */}
      {laHomNay && bayGioPhut !== null && bayGioPhut >= khung.dau && bayGioPhut <= khung.cuoi && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
          style={{ top: toaDo(bayGioPhut) }}
        >
          <span className="absolute -top-[5px] -left-[3px] size-2 rounded-full bg-red-500" />
        </div>
      )}
    </div>
  );
}

/** Các quãng NGOÀI giờ mở cửa trong khung đang vẽ. */
function layNgoaiGio(
  openRanges: { startMin: number; endMin: number }[],
  khung: { dau: number; cuoi: number },
) {
  if (openRanges.length === 0) return [{ startMin: khung.dau, endMin: khung.cuoi }];
  const xep = [...openRanges].sort((a, b) => a.startMin - b.startMin);
  const ra: { startMin: number; endMin: number }[] = [];
  let moc = khung.dau;
  for (const r of xep) {
    if (r.startMin > moc) ra.push({ startMin: moc, endMin: Math.min(r.startMin, khung.cuoi) });
    moc = Math.max(moc, r.endMin);
  }
  if (moc < khung.cuoi) ra.push({ startMin: moc, endMin: khung.cuoi });
  return ra.filter((r) => r.endMin > r.startMin);
}
