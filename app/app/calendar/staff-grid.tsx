"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatMinuteLabel, minutesOfDayInTimeZone } from "@/lib/booking/schedule";
import { xepChong } from "./xep-chong";
import { MAU_DA_HUY, mauCuaTho } from "./types";
import type { Appointment, CalendarDay, StaffOption } from "./types";

const BUOC_PHUT = 15;
const RONG_COT = "min-w-[120px]";

/**
 * CHẾ ĐỘ THEO NGƯỜI — một ngày, mỗi thợ MỘT CỘT.
 *
 * Đây là cách một tiệm thật nhìn lịch, và nó giải quyết tận gốc chuyện ca
 * chồng nhau: cơ sở dữ liệu đã cấm một thợ nhận hai ca cùng giờ (ràng buộc
 * EXCLUDE, #83), nên trong một cột KHÔNG BAO GIỜ có hai ca đè nhau. Lưới sạch
 * hoàn toàn, không cần chia đều cũng không cần xếp bậc thang.
 *
 * Google Lịch gọi kiểu này là "xem cạnh nhau" và cũng chỉ có ở chế độ Ngày —
 * bảy ngày × mười hai thợ là 84 cột, không màn nào chứa nổi.
 *
 * ⚠️ Ca KHÔNG GÁN THỢ vẫn phải hiện, ở một cột riêng ngoài cùng. Bỏ chúng đi
 *   là giấu mất lịch có thật — đúng loại lỗi tệ nhất một màn lịch gây ra. Cột
 *   đó chỉ vẽ khi thực sự có ca nào chưa gán.
 */
export function StaffGrid({
  day,
  staff,
  timezone,
  thuTuTho,
  caoMotGio,
  todayKey,
  onChonCa,
  onChonOTrong,
  onChiHien,
}: {
  day: CalendarDay;
  staff: StaffOption[];
  timezone: string;
  thuTuTho: Map<string, number>;
  caoMotGio: number;
  todayKey: string;
  onChonCa: (a: Appointment) => void;
  /** Bấm ô trống trong cột của một thợ: tạo lịch đã chọn sẵn thợ đó. */
  onChonOTrong: ((dateKey: string, phut: number, employeeId: string | null) => void) | null;
  /** Bấm một tên trên dải chọn: chỉ còn cột của người đó. */
  onChiHien: (employeeId: string) => void;
}) {
  const t = useTranslations("calendar");
  const khungRef = useRef<HTMLDivElement>(null);
  const [bayGioPhut, datBayGioPhut] = useState<number | null>(null);

  useEffect(() => {
    const dat = () => datBayGioPhut(minutesOfDayInTimeZone(new Date().toISOString(), timezone));
    dat();
    const h = setInterval(dat, 60_000);
    return () => clearInterval(h);
  }, [timezone]);

  const theoTho = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of day.appointments) {
      const k = a.staffEmployeeId ?? "";
      const ds = m.get(k) ?? [];
      ds.push(a);
      m.set(k, ds);
    }
    return m;
  }, [day.appointments]);

  /** Chỉ vẽ cột "chưa gán" khi thực sự có ca chưa gán. */
  const coChuaGan = (theoTho.get("") ?? []).length > 0;

  /**
   * MẶC ĐỊNH CHỈ HIỆN NGƯỜI CÓ CA HÔM ĐÓ.
   *
   * ⚠️ Bản đầu vẽ hết mọi thợ của tiệm. Đo trên điện thoại 21/08: tiệm demo có
   *   hơn hai mươi người, màn 375px chứa được ba cột, và ba cột đầu đều "0 ca"
   *   — nhìn vào tưởng hôm nay tiệm không có khách nào, trong khi ngày đó có
   *   hàng chục ca nằm ở những cột phải cuộn ngang mới tới. Đúng loại lỗi tệ
   *   nhất: màn hình nói sai mà không báo gì.
   *
   * Người không có ca vẫn vào được — bấm "Hiện tất cả". Vì đôi khi câu hỏi
   * đúng lại là "hôm nay ai rảnh".
   */
  const [hienCaNguoiRanh, datHienCaNguoiRanh] = useState(false);
  const soNguoiRanh = staff.filter((s) => (theoTho.get(s.employeeId) ?? []).length === 0).length;

  const cot = useMemo(() => {
    const coCa = staff.filter((s) => (theoTho.get(s.employeeId) ?? []).length > 0);
    const khongCa = staff.filter((s) => (theoTho.get(s.employeeId) ?? []).length === 0);
    // Người CÓ ca luôn đứng trước — không phải cuộn ngang mới thấy việc.
    const ds = hienCaNguoiRanh ? [...coCa, ...khongCa] : coCa;
    return [
      ...ds.map((s) => ({ ma: s.employeeId, ten: s.displayName })),
      ...(coChuaGan ? [{ ma: "", ten: t("staffGrid.unassigned") }] : []),
    ];
  }, [staff, theoTho, coChuaGan, hienCaNguoiRanh, t]);

  const khung = useMemo(() => {
    let dau = Infinity;
    let cuoi = -Infinity;
    for (const r of day.openRanges) {
      dau = Math.min(dau, r.startMin);
      cuoi = Math.max(cuoi, r.endMin);
    }
    for (const a of day.appointments) {
      dau = Math.min(dau, minutesOfDayInTimeZone(a.startAt, timezone));
      cuoi = Math.max(cuoi, minutesOfDayInTimeZone(a.endAt, timezone));
    }
    if (!Number.isFinite(dau) || !Number.isFinite(cuoi) || cuoi <= dau) {
      dau = 7 * 60;
      cuoi = 21 * 60;
    }
    return {
      dau: Math.max(0, Math.floor((dau - 30) / 60) * 60),
      cuoi: Math.min(24 * 60, Math.ceil((cuoi + 30) / 60) * 60),
    };
  }, [day, timezone]);

  const gio = useMemo(() => {
    const ra: number[] = [];
    for (let m = khung.dau; m < khung.cuoi; m += 60) ra.push(m);
    return ra;
  }, [khung]);

  const toaDo = (phut: number) => ((phut - khung.dau) / 60) * caoMotGio;
  const caoTong = ((khung.cuoi - khung.dau) / 60) * caoMotGio;

  const daCan = useRef(false);
  useEffect(() => {
    const el = khungRef.current;
    if (!el || bayGioPhut === null || daCan.current) return;
    daCan.current = true;
    el.scrollTop = Math.max(0, ((bayGioPhut - khung.dau) / 60) * caoMotGio - el.clientHeight / 3);
  }, [bayGioPhut, khung.dau, caoMotGio]);

  if (cot.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[13px] text-muted-foreground">
          {staff.length === 0 ? t("staffGrid.noStaff") : t("staffGrid.noneToday")}
        </p>
        {staff.length > 0 && (
          <button
            type="button"
            onClick={() => datHienCaNguoiRanh(true)}
            className="rounded-md border px-3 py-2 text-[12px] font-medium hover:bg-muted max-md:min-h-11"
          >
            {t("staffGrid.showAll", { count: staff.length })}
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={khungRef} className="relative flex-1 overflow-auto">
      {/* Dải chọn NGƯỜI ngay trên lưới. Trên điện thoại cột trái nằm sau nút
          ⋯ nên không với tới được — mà đây đúng là chỗ người ta muốn chọn
          "xem riêng chị Thảo". Bấm một tên là chỉ còn cột của người đó. */}
      <div className="sticky top-0 z-30 flex items-center gap-1 overflow-x-auto border-b bg-background px-2 py-1.5">
        <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("staffGrid.pick")}
        </span>
        {staff.map((s) => {
          const dangHien = cot.some((c) => c.ma === s.employeeId);
          const soCa = (theoTho.get(s.employeeId) ?? []).length;
          return (
            <button
              key={s.employeeId}
              type="button"
              onClick={() => onChiHien(s.employeeId)}
              aria-pressed={dangHien && cot.length === 1}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] max-md:min-h-9",
                dangHien ? "" : "opacity-50",
              )}
            >
              <span className={cn("size-2 rounded-full", mauCuaTho(s.employeeId, thuTuTho).cham)} />
              <span className="max-w-24 truncate">{s.displayName}</span>
              {soCa > 0 && <span className="font-semibold tabular-nums">{soCa}</span>}
            </button>
          );
        })}
        {soNguoiRanh > 0 && !hienCaNguoiRanh && (
          <button
            type="button"
            onClick={() => datHienCaNguoiRanh(true)}
            className="shrink-0 rounded-full border border-dashed px-2 py-1 text-[11px] text-muted-foreground max-md:min-h-9"
          >
            {t("staffGrid.plusFree", { count: soNguoiRanh })}
          </button>
        )}
      </div>

      <div className="sticky top-0 z-20 flex w-max min-w-full border-b bg-background">
        <div className="sticky left-0 z-10 w-12 shrink-0 border-r bg-background" />
        {cot.map((c) => (
          <div
            key={c.ma || "chua-gan"}
            className={cn("flex-1 border-r px-1.5 py-1.5 last:border-r-0", RONG_COT)}
          >
            <p className="flex items-center gap-1.5 text-[12px] leading-tight font-semibold">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  c.ma ? mauCuaTho(c.ma, thuTuTho).cham : "bg-muted-foreground/50",
                )}
              />
              <span className="truncate">{c.ten}</span>
            </p>
            <p className="text-[10px] leading-tight text-muted-foreground">
              {t("staffGrid.count", { count: (theoTho.get(c.ma) ?? []).length })}
            </p>
          </div>
        ))}
      </div>

      <div className="flex w-max min-w-full" style={{ height: caoTong }}>
        <div className="sticky left-0 z-10 w-12 shrink-0 border-r bg-background">
          {gio.map((m) => (
            <div key={m} className="relative" style={{ height: caoMotGio }}>
              <span className="absolute -top-1.5 right-1 text-[10px] tabular-nums text-muted-foreground">
                {formatMinuteLabel(m)}
              </span>
            </div>
          ))}
        </div>

        {cot.map((c) => {
          const cacCa = (theoTho.get(c.ma) ?? []).map((a) => ({
            ca: a,
            startMin: minutesOfDayInTimeZone(a.startAt, timezone),
            endMin: minutesOfDayInTimeZone(a.endAt, timezone),
          }));
          // Vẫn chạy phép chia cột: ca ĐÃ HUỶ không bị ràng buộc chống trùng
          // giữ chỗ nữa, nên một thợ vẫn có thể có ca huỷ đè lên ca mới.
          const cho = xepChong(cacCa);
          return (
            <div
              key={c.ma || "chua-gan"}
              className={cn("relative flex-1 border-r last:border-r-0", RONG_COT)}
              onClick={(e) => {
                // Chạm bằng ngón tay KHÔNG tạo lịch — xem ghi chú cùng loại ở
                // `time-grid.tsx`. Nút tròn nổi góc dưới phải là đường tạo lịch
                // trên điện thoại.
                if (!onChonOTrong) return;
                if (window.matchMedia?.("(pointer: coarse)").matches) return;
                const hop = e.currentTarget.getBoundingClientRect();
                const phut = khung.dau + ((e.clientY - hop.top) / caoMotGio) * 60;
                onChonOTrong(
                  day.dateKey,
                  Math.max(0, Math.floor(phut / BUOC_PHUT) * BUOC_PHUT),
                  c.ma || null,
                );
              }}
            >
              {gio.map((m) => (
                <div key={m} className="absolute inset-x-0 border-t" style={{ top: toaDo(m) }}>
                  <div
                    className="absolute inset-x-0 border-t border-dashed border-border/40"
                    style={{ top: caoMotGio / 2 }}
                  />
                </div>
              ))}

              {day.dateKey === todayKey &&
                bayGioPhut !== null &&
                bayGioPhut >= khung.dau &&
                bayGioPhut <= khung.cuoi && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                    style={{ top: toaDo(bayGioPhut) }}
                  />
                )}

              {cacCa.map((x) => {
                const o = cho.get(x);
                if (!o) return null;
                const daHuy = x.ca.status === "cancelled" || x.ca.status === "no_show";
                const mau = daHuy ? MAU_DA_HUY : mauCuaTho(x.ca.staffEmployeeId, thuTuTho);
                const cao = Math.max(18, toaDo(x.endMin) - toaDo(x.startMin));
                return (
                  <button
                    key={x.ca.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChonCa(x.ca);
                    }}
                    title={`${formatMinuteLabel(x.startMin)}–${formatMinuteLabel(x.endMin)} · ${x.ca.contactName}`}
                    className={cn(
                      "absolute overflow-hidden rounded-[3px] border-l-[3px] px-1 py-0.5 text-left hover:z-10 hover:shadow-md",
                      mau.vien,
                      mau.nen,
                      mau.chu,
                      daHuy && "line-through decoration-1",
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
                    {cao >= 34 && (
                      <p className="truncate text-[10px] leading-tight opacity-80">
                        {x.ca.serviceName ?? t("grid.noService")}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>


    </div>
  );
}
